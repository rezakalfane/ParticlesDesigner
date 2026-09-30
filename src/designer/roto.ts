import { PhysicalRoto, type RequestMIDIAccessLike } from "../roto/physicalRoto";
import { parseRotoSetup } from "../roto/setup";
import { DESIGNER_SETUPS, designerActions, designerSetupDocuments } from "./rotoLayout";

export interface DesignerRotoHost {
  read(key: string): number | undefined;
  write(key: string, normalized: number): void;
  action(key: string, state?: boolean): void;
  commit(): void;
  describe(): string;
  /** UI element edited by a knob/action key; its section is scrolled into view. */
  locate?(key: string): Element | null;
}
/** Designer-local ROTO adapter. */
export function connectDesignerRoto(host: DesignerRotoHost, container: HTMLElement) {
  const nav = navigator as Navigator & { requestMIDIAccess?: RequestMIDIAccessLike };
  const physical = new PhysicalRoto({ requestMIDIAccess: nav.requestMIDIAccess?.bind(nav) });
  const setups = designerSetupDocuments().map((doc) => parseRotoSetup(JSON.stringify(doc)));
  physical.loadSetups(setups);
  const strip = document.createElement("div");
  strip.className = "designer-roto";
  const connect = document.createElement("button");
  connect.textContent = "Connect ROTO";
  connect.disabled = !physical.supported;
  const status = document.createElement("span");
  status.setAttribute("role", "status");
  const candidate = document.createElement("span");
  const pages = document.createElement("div");
  pages.className = "designer-roto-pages";
  const setupFiles = document.createElement("a");
  setupFiles.href = "roto/";
  setupFiles.target = "_blank";
  setupFiles.textContent = "Get the ROTO-SETUP files (channels 9–11)";
  setupFiles.className = "designer-roto-files";
  strip.append(connect, status, candidate, pages, setupFiles);
  container.prepend(strip);
  let active: { setup: number; page: number } | undefined;
  let pending: ReturnType<typeof setTimeout> | undefined;
  let dirty = false;
  const flush = () => {
    clearTimeout(pending);
    if (dirty) host.commit();
    dirty = false;
  };
  const refreshCandidate = () => {
    candidate.textContent = host.describe();
  };
  const buttons: HTMLButtonElement[] = [];
  function follow(setup: number, page: number, key?: string) {
    const spec = DESIGNER_SETUPS[setup].pages[page];
    buttons.forEach((b, i) => b.setAttribute("aria-pressed", String(i === setup * 4 + page)));
    const target = document.getElementById(spec.section);
    target?.closest("fieldset")?.classList.add("roto-focused");
    document.querySelectorAll("fieldset.roto-focused").forEach((f) => {
      if (f !== target?.closest("fieldset")) f.classList.remove("roto-focused");
    });
    reveal(spec.section, key);
    refreshCandidate();
  }
  /**
   * Scroll the edited control's section (else the page's section) to the top of
   * the panel, or as far as the panel allows.
   */
  function reveal(section: string, key?: string) {
    const control = key ? host.locate?.(key) : null;
    const target =
      control && container.contains(control) ? control : document.getElementById(section);
    const block = target?.closest("fieldset") ?? target;
    if (!block) return;
    const pad = parseFloat(getComputedStyle(container).paddingTop) || 0;
    const top = Math.max(
      0,
      Math.min(
        container.scrollHeight - container.clientHeight,
        container.scrollTop +
          block.getBoundingClientRect().top -
          container.getBoundingClientRect().top -
          pad,
      ),
    );
    // Knob streams call this per message: only (re)start a scroll when off target.
    if (Math.abs(top - container.scrollTop) > 1) container.scrollTo({ top, behavior: "smooth" });
  }
  DESIGNER_SETUPS.forEach((setup, si) =>
    setup.pages.forEach((p, pi) => {
      const b = document.createElement("button");
      b.textContent = p.name;
      b.title = `${setup.name} · MIDI ${setup.channel} · page ${pi + 1} (UI navigation only)`;
      b.onclick = () => follow(si, pi);
      pages.append(b);
      buttons.push(b);
    }),
  );
  physical.onStatus((s) => {
    status.textContent = `ROTO · ${s.state} · channels 9–11`;
    active = undefined; // Wait for hardware to identify its current page after reconnect.
    physical.invalidateKnown();
  });
  connect.onclick = () => {
    void physical.connect();
  };
  physical.onRawMessage((data) => {
    if ((data[0] & 0xf0) === 0xb0 && ![9, 10, 11].includes((data[0] & 15) + 1)) active = undefined;
  });
  physical.onEvent((event) => {
    const [channelText, , indexText] = event.controlId.split(":");
    const si = DESIGNER_SETUPS.findIndex((s) => s.channel === Number(channelText));
    if (si < 0) return;
    const index = Number(indexText),
      pi = Math.floor(index / 8),
      slot = index % 8;
    const p = DESIGNER_SETUPS[si].pages[pi];
    if (!p) return;
    const key =
      event.kind === "knob" ? p.knobs[slot] : slot === 7 ? undefined : designerActions(p)[slot];
    if (!active || active.setup !== si || active.page !== pi) {
      flush();
      active = { setup: si, page: pi };
      physical.invalidateKnown(Number(channelText));
      follow(si, pi, key);
    } else reveal(p.section, key);
    if (event.kind === "knob") {
      if (!key) return;
      host.write(key, event.value);
      if (!key.endsWith(" bank") && !key.endsWith(" slot")) {
        dirty = true;
        clearTimeout(pending);
        pending = setTimeout(flush, 300);
      }
    } else {
      const control = setups[si].buttons.find((c) => c.controlIndex === index)!;
      if (slot === 7) {
        if (event.pressed) follow(si, pi);
        return;
      }
      if (control.hapticMode !== 1 && !event.pressed) return;
      flush();
      host.action(key!, control.hapticMode === 1 ? Boolean(event.pressed) : undefined);
    }
    refreshCandidate();
  });
  const timer = setInterval(() => {
    refreshCandidate();
    if (!active || dirty) return; // Do not motor-fight a continuous gesture.
    const { setup: si, page: pi } = active;
    const p = DESIGNER_SETUPS[si].pages[pi];
    for (const c of setups[si].controls) {
      if (Math.floor(c.controlIndex / 8) !== pi) continue;
      const slot = c.controlIndex % 8;
      if (c.kind === "button" && c.hapticMode !== 1) continue;
      const key = c.kind === "knob" ? p.knobs[slot] : designerActions(p)[slot];
      const value = host.read(key);
      if (value !== undefined) physical.setControlStateQuiet(c.id, value);
    }
  }, 100);
  if (physical.supported) void physical.connect();
  refreshCandidate();
  return () => {
    flush();
    clearInterval(timer);
    physical.disconnect();
    strip.remove();
  };
}
