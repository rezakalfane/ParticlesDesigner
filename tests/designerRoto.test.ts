// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { designerSetupDocuments, DESIGNER_SETUPS } from "../src/designer/rotoLayout";
import { connectDesignerRoto } from "../src/designer/roto";
import { PhysicalRoto, type MidiInputLike, type MidiAccessLike } from "../src/roto/physicalRoto";
import { parseRotoSetup } from "../src/roto/setup";

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
  localStorage.clear();
});
function midi() {
  const input: MidiInputLike = {
    id: "in",
    name: "ROTO-CONTROL",
    state: "connected",
    onmidimessage: null,
  };
  const output = { id: "out", name: "ROTO-CONTROL", state: "connected", send: vi.fn() };
  const access: MidiAccessLike = {
    inputs: new Map([["in", input]]),
    outputs: new Map([["out", output]]),
    onstatechange: null,
  };
  return {
    input,
    output,
    access,
    fire: (channel: number, cc: number, value: number) =>
      input.onmidimessage?.({ data: [0xb0 + channel - 1, cc, value] }),
  };
}
describe("Designer ROTO", () => {
  it("exports observed v1 maps on 9–11 with unique CCs including fine LSBs", () => {
    for (const doc of designerSetupDocuments()) {
      expect([9, 10, 11]).toContain(doc.index);
      expect(JSON.parse(readFileSync(`roto/${doc.index} ${doc.name}.json`, "utf8"))).toEqual(doc);
      const setup = parseRotoSetup(JSON.stringify(doc)),
        occupied = new Set<number>();
      expect(setup.knobs.length).toBeLessThanOrEqual(32);
      expect(setup.buttons.length).toBeLessThanOrEqual(32);
      for (const c of setup.controls) {
        expect(c.controlChannel).toBe(doc.index);
        for (const cc of c.maxValue > 127
          ? [c.controlParam, c.controlParam + 32]
          : [c.controlParam]) {
          expect(occupied.has(cc)).toBe(false);
          occupied.add(cc);
          expect(cc).toBeLessThan(120);
        }
      }
      for (let page = 0; page < 4; page++) {
        const label = setup.buttons.find((c) => c.controlIndex === page * 8 + 7)!;
        expect(label.controlName).toBe(DESIGNER_SETUPS[doc.index - 9].pages[page].name);
        expect(label.hapticMode).toBe(0);
        expect(label.colorScheme).toBe(24);
        expect(setup.buttons.find((c) => c.controlIndex === page * 8 + 3)?.controlName).toBe(
          "Blackout",
        );
      }
    }
  });
  it("ignores MIDI channels outside its setups (9–11)", async () => {
    const m = midi(),
      received = vi.fn();
    const adapter = new PhysicalRoto({ requestMIDIAccess: async () => m.access });
    adapter.loadSetups(designerSetupDocuments().map((d) => parseRotoSetup(JSON.stringify(d))));
    adapter.onEvent(received);
    await adapter.connect();
    for (const ch of [1, 2, 3, 4, 8]) for (let cc = 0; cc < 120; cc++) m.fire(ch, cc, 127);
    expect(received).not.toHaveBeenCalled();
    adapter.disconnect();
  });
  it("page announcement is harmless, browsing is clean, edits coalesce and feedback stays on its channel", async () => {
    vi.useFakeTimers();
    const m = midi();
    Object.defineProperty(navigator, "requestMIDIAccess", {
      configurable: true,
      value: async () => m.access,
    });
    const host = {
      read: vi.fn(() => 0.5),
      write: vi.fn(),
      action: vi.fn(),
      commit: vi.fn(),
      describe: () => "Candidate",
    };
    const stop = connectDesignerRoto(host, document.body);
    await Promise.resolve();
    await Promise.resolve();
    // First page label: CC71. No edit or history write, even on release.
    m.fire(9, 71, 127);
    m.fire(9, 71, 0);
    expect(host.write).not.toHaveBeenCalled();
    expect(host.action).not.toHaveBeenCalled();
    expect(host.commit).not.toHaveBeenCalled();
    m.fire(9, 4, 64);
    await vi.advanceTimersByTimeAsync(350); // Bank browse.
    expect(host.write).toHaveBeenCalledWith("Preset bank", 64 / 127);
    expect(host.commit).not.toHaveBeenCalled();
    m.fire(9, 6, 20);
    m.fire(9, 6, 30);
    m.fire(9, 6, 40);
    await vi.advanceTimersByTimeAsync(299);
    expect(host.commit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(host.commit).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(m.output.send.mock.calls.length).toBeGreaterThan(0);
    expect(m.output.send.mock.calls.every(([bytes]) => bytes[0] === 0xb8)).toBe(true);
    const count = m.output.send.mock.calls.length;
    m.fire(1, 0, 64);
    await vi.advanceTimersByTimeAsync(500);
    expect(m.output.send).toHaveBeenCalledTimes(count);
    stop();
    expect(m.input.onmidimessage).toBeNull();
  });
});
