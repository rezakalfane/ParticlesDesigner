/**
 * PhysicalRoto: Web MIDI adapter for the ROTO-CONTROL hardware. Emits
 * ControlEvents through the exact same contract as VirtualRoto, so the engine
 * cannot tell mouse from MIDI (acceptance A16 seam, now with real hardware).
 *
 * Protocol notes (see docs/PHYSICAL-ROTO.md):
 * - Knobs/buttons are decoded from Control Change messages using the control's
 *   own `controlChannel`/`controlParam` from the loaded RotoSetup.
 * - 7-bit controls (maxValue <= 127): raw = CC value.
 * - 14-bit controls (maxValue > 127): standard MSB/LSB pair, MSB at
 *   `controlParam`, LSB at `controlParam + 32` — VERIFIED on hardware
 *   2026-09-17 (device sends MSB first, then LSB, resending both per update).
 * - Buttons: value >= 64 is "on".
 * - Output direction (motorized knobs / LEDs): setControlStateQuiet sends CCs
 *   back. Exact echoes of what we just sent are suppressed so a device that
 *   reflects outbound CCs cannot cause a feedback loop.
 *
 * All known setups are decoded at once (`loadSetups`): each setup uses
 * its own MIDI channel(s), so the channel identifies the preset
 * on the wire. The app follows the hardware — inbound data auto-selects the
 * matching preset and bank in the UI (via the event's controlId).
 *
 * Web MIDI requires Chrome/Edge (no Safari/Firefox support). MIDIAccess is
 * injected in tests; no DOM is used here.
 */
import {
  ControlEvent,
  ControlEventHandler,
  ControlSource,
  RotoEventSource,
  makeControlEvent,
} from "./events";
import { RotoControl, RotoSetup } from "./setup";

// --- Minimal structural Web MIDI types (TS dom lib has none; no deps). -----

export interface MidiMessageEventLike {
  data: Uint8Array | number[] | null;
}
export interface MidiInputLike {
  id: string;
  name?: string | null;
  state: string;
  onmidimessage: ((e: MidiMessageEventLike) => void) | null;
}
export interface MidiOutputLike {
  id: string;
  name?: string | null;
  state: string;
  send(data: number[]): void;
}
export interface MidiAccessLike {
  inputs: Map<string, MidiInputLike> | Iterable<MidiInputLike>;
  outputs: Map<string, MidiOutputLike> | Iterable<MidiOutputLike>;
  onstatechange: ((e?: unknown) => void) | null;
}
export type RequestMIDIAccessLike = () => Promise<MidiAccessLike>;

/** A MIDI port pair the operator can connect for learn/teach. ROTO is always auto. */
export interface MidiDeviceInfo {
  name: string;
  inputId: string | null;
  outputId: string | null;
  roto: boolean;
  connected: boolean;
  auto: boolean;
  /** Listening to this device's input. ROTO is always on while connected. */
  listen: boolean;
  /** Sending motor/LED feedback to this device's output. ROTO is always on. */
  teach: boolean;
  /** Automation source: its CCs write the show but never move the Virtual
   *  ROTO page, so a lane cannot flip the page out from under a hand. */
  automation: boolean;
}

const MIDI_AUTO_KEY = "particles-designer.midi.auto.v1";
const MIDI_DIR_KEY = "particles-designer.midi.dir.v1";
const MIDI_AUTOMATION_KEY = "particles-designer.midi.automation.v1";

export type PhysicalRotoStatus =
  | { state: "unsupported" }
  | { state: "disconnected"; ports: string[] }
  | { state: "connected"; inputName: string; outputName: string | null };

/** Echoes of our own outbound CCs within this window are swallowed. */
const ECHO_WINDOW_MS = 100;
/** Default port-name match for the ROTO-CONTROL. */
const DEFAULT_NAME_PATTERN = /roto/i;

/**
 * Collect ports from a MIDIInputMap/MIDIOutputMap. These are maplike but NOT
 * instanceof Map in the browser: iterating them yields [id, port] entries, so
 * always go through .values() when available.
 */
function each<T>(ports: Map<string, T> | Iterable<T>): T[] {
  const maplike = ports as { values?: () => Iterable<T> };
  if (typeof maplike.values === "function") return [...maplike.values()];
  return [...(ports as Iterable<T>)];
}

/**
 * Raw value of a stepped control's detent, the way the hardware anchors it.
 * Observed on device for a 7-step 0..127 knob: 0, 21, 42, 63, 84, 105, 127 —
 * i.e. TRUNCATED, not rounded. Sending a rounded value (64/85/106) makes the
 * device snap to the nearest detent and echo a different raw back, which
 * defeats echo suppression and makes the motor hunt forever.
 */
export function steppedAnchorRaw(c: RotoControl, normalized: number): number {
  if (c.hapticSteps <= 1) return c.minValue;
  const step = c.stepIndexFor(normalized) ?? 0;
  return c.minValue + Math.floor((step * (c.maxValue - c.minValue)) / (c.hapticSteps - 1));
}

export class PhysicalRoto implements RotoEventSource {
  readonly source: ControlSource = "physical";

  private handlers: ControlEventHandler[] = [];
  private statusHandlers: ((s: PhysicalRotoStatus) => void)[] = [];
  private rawHandlers: ((msg: number[]) => void)[] = [];
  /** Diagnostic monitor: outbound motor/LED bytes (see onRawSend). */
  private rawSendHandlers: ((msg: number[]) => void)[] = [];

  /** All loaded setups' controls by id (`setupIndex:kind:controlIndex`). */
  private byId = new Map<string, RotoControl>();
  /** (channel << 8) | cc -> knob/button for 7-bit controls and 14-bit MSB. */
  private byCc = new Map<number, RotoControl>();
  /** (channel << 8) | lsbCc -> 14-bit knob that owns this LSB. */
  private lsbOwners = new Map<number, RotoControl>();
  /** Last LSB seen per 14-bit knob (control.id). */
  private lsbValues = new Map<string, number>();
  /** Last MSB seen per 14-bit knob (control.id). */
  private msbValues = new Map<string, number>();

  private access: MidiAccessLike | null = null;
  /** All inputs we listen on (the device may expose several ports). */
  private attachedInputs: MidiInputLike[] = [];
  private output: MidiOutputLike | null = null;

  /** Raw value last sent TO the device per control (echo suppression). */
  private lastSentRaw = new Map<string, { raw: number; at: number }>();
  /** Raw value last known on the device (received or sent). */
  private lastKnownRaw = new Map<string, number>();

  /** Learn mode: extra inputs are capture-only (never show writes). */
  private learnListening = false;
  private learnArmed = false;
  private learnInputs: MidiInputLike[] = [];
  private learnHandlers: ((hit: { channel: number; cc: number; value: number }) => void)[] = [];
  /** Non-ROTO devices the operator connected (same CC map; no motor sync). */
  private userNames = new Set<string>();
  /** Non-ROTO names that reconnect on hotplug. */
  private autoNames = new Set<string>();
  /** Direction overrides for non-ROTO devices. Absent = both directions. */
  private directions = new Map<string, { listen: boolean; teach: boolean }>();
  private automationNames = new Set<string>();
  private teachOutputs: MidiOutputLike[] = [];
  /** Teach echoes (channel, cc, value) swallowed so they are not re-learned. */
  private teachEchoes: { channel: number; cc: number; value: number; at: number }[] = [];

  private status: PhysicalRotoStatus = { state: "disconnected", ports: [] };

  constructor(
    private opts: {
      requestMIDIAccess?: RequestMIDIAccessLike;
      now?: () => number;
      deviceNamePattern?: RegExp;
      /**
       * Phase 15 explicit device binding (docs/PHYSICAL-ROTO.md): an
       * exact configured port name wins over pattern recognition. The
       * physical ROTO must NEVER bind an arbitrary "first MIDI output":
       * without a configured name or a positive ROTO identity match there
       * is simply no output (listen-only, no motor/LED feedback).
       */
      deviceName?: string;
    } = {},
  ) {
    this.loadAutoNames();
    this.loadDirections();
    this.loadAutomation();
  }

  private get now(): () => number {
    return this.opts.now ?? (() => performance.now());
  }

  get supported(): boolean {
    return this.opts.requestMIDIAccess !== undefined;
  }

  get currentStatus(): PhysicalRotoStatus {
    return this.status;
  }

  onEvent(cb: ControlEventHandler): void {
    this.handlers.push(cb);
  }
  onStatus(cb: (s: PhysicalRotoStatus) => void): void {
    this.statusHandlers.push(cb);
    cb(this.status);
  }
  /** Raw inbound MIDI bytes, for the diagnostic monitor. */
  onRawMessage(cb: (msg: number[]) => void): void {
    this.rawHandlers.push(cb);
  }
  /** Raw OUTBOUND bytes (motor/LED feedback), for the diagnostic monitor. */
  onRawSend(cb: (msg: number[]) => void): void {
    this.rawSendHandlers.push(cb);
  }

  /**
   * MIDI learn UI. Extra devices stay capture-only either way — their CCs
   * never become ControlEvents. Armed learn swallows ROTO CCs too.
   */
  setLearnListening(on: boolean): void {
    this.learnListening = on;
    if (!on) this.learnArmed = false;
  }

  /** Operator connect for a non-ROTO device. Its CCs use the same control map. */
  connectDevice(name: string): void {
    if (this.isRotoName(name)) {
      void this.connect();
      return;
    }
    this.userNames.add(name);
    if (this.access) this.scanPorts();
  }

  disconnectDevice(name: string): void {
    if (this.isRotoName(name)) {
      this.disconnect();
      return;
    }
    this.userNames.delete(name);
    this.autoNames.delete(name);
    this.saveAutoNames();
    if (this.access) this.scanPorts();
  }

  /**
   * Per-device direction. ROTO ignores this — it always listens and always
   * receives motor feedback. A bus used for automation wants listen only.
   */
  /** Automation devices write values without following their page. */
  setDeviceAutomation(name: string, on: boolean): void {
    if (this.isRotoName(name)) return;
    if (on) this.automationNames.add(name);
    else this.automationNames.delete(name);
    this.saveAutomation();
    if (this.access) this.scanPorts();
  }

  /** True when the last decoded message came from an automation device. */
  get lastInputWasAutomation(): boolean {
    return this.lastFromAutomation;
  }

  private lastFromAutomation = false;

  setDeviceDirection(name: string, direction: "listen" | "teach", on: boolean): void {
    if (this.isRotoName(name)) return;
    const cur = this.directions.get(name) ?? { listen: true, teach: true };
    cur[direction] = on;
    this.directions.set(name, cur);
    this.saveDirections();
    if (this.access) this.scanPorts();
  }

  /** Auto-connect is forced on for ROTO. Other names persist locally. */
  setDeviceAuto(name: string, on: boolean): void {
    if (this.isRotoName(name)) return;
    if (on) {
      this.autoNames.add(name);
      this.userNames.add(name);
    } else {
      this.autoNames.delete(name);
    }
    this.saveAutoNames();
    if (this.access) this.scanPorts();
  }

  midiDevices(): MidiDeviceInfo[] {
    if (!this.access) return [];
    const byName = new Map<string, MidiDeviceInfo>();
    const touch = (name: string, id: string, dir: "input" | "output"): MidiDeviceInfo => {
      let row = byName.get(name);
      if (!row) {
        const roto = this.isRotoName(name);
        row = {
          name,
          inputId: null,
          outputId: null,
          roto,
          connected: false,
          auto: roto || this.autoNames.has(name),
          listen: roto || (this.directions.get(name)?.listen ?? true),
          teach: roto || (this.directions.get(name)?.teach ?? true),
          automation: !roto && this.automationNames.has(name),
        };
        byName.set(name, row);
      }
      if (dir === "input") row.inputId = id;
      else row.outputId = id;
      return row;
    };
    for (const p of each(this.access.inputs)) {
      if (p.state !== "connected") continue;
      const name = p.name ?? p.id;
      const row = touch(name, p.id, "input");
      row.connected =
        row.connected || this.attachedInputs.includes(p) || this.learnInputs.includes(p);
    }
    for (const p of each(this.access.outputs)) {
      if (p.state !== "connected") continue;
      const name = p.name ?? p.id;
      const row = touch(name, p.id, "output");
      row.connected = row.connected || this.output === p || this.teachOutputs.includes(p);
    }
    return [...byName.values()].sort(
      (a, b) => Number(b.roto) - Number(a.roto) || a.name.localeCompare(b.name),
    );
  }

  /**
   * A virtual control is armed. Inbound CCs are reported to learn handlers
   * and not decoded as show gestures until disarmed.
   */
  setLearnArmed(on: boolean): void {
    this.learnArmed = on;
  }

  onLearnCapture(cb: (hit: { channel: number; cc: number; value: number }) => void): void {
    this.learnHandlers.push(cb);
  }

  /**
   * Teach: send the control's current raw value on its channel/CC. Always
   * emits (unlike motor sync, which skips an unchanged value).
   */
  teach(c: RotoControl, raw: number): void {
    this.sendRaw(c, raw, true);
  }

  /**
   * Register every setup the device may send from. Decode keys on
   * (channel, param) across ALL setups: each setup uses its own
   * channel(s), so the channel alone identifies the preset and a
   * message is decoded against the right setup even when the app's UI is
   * showing another one (the app follows via the event's controlId).
   */
  loadSetups(setups: RotoSetup[]): void {
    this.byId.clear();
    this.byCc.clear();
    this.lsbOwners.clear();
    this.lsbValues.clear();
    this.msbValues.clear();
    for (const setup of setups) {
      for (const c of setup.controls) {
        this.byId.set(c.id, c);
        const key = (c.controlChannel << 8) | c.controlParam;
        if (c.maxValue > 127) {
          this.byCc.set(key, c);
          this.lsbOwners.set((c.controlChannel << 8) | (c.controlParam + 32), c);
        } else {
          // Buttons win over knobs on a (channel, param) collision — a knob
          // collision is a preset bug (see scripts/generate-roto-presets.ts).
          const existing = this.byCc.get(key);
          if (!existing || c.kind === "button") this.byCc.set(key, c);
        }
      }
    }
  }

  loadSetup(setup: RotoSetup): void {
    this.loadSetups([setup]);
  }

  /** Learned control owns this channel/CC even if a button previously won the key. */
  claim(c: RotoControl): void {
    this.byId.set(c.id, c);
    const key = (c.controlChannel << 8) | c.controlParam;
    this.byCc.set(key, c);
    if (c.maxValue > 127) {
      this.lsbOwners.set((c.controlChannel << 8) | (c.controlParam + 32), c);
    }
  }

  /**
   * Forget the believed device positions (one setup or all) so the next
   * sync re-sends every value. Needed when the hardware may display stale
   * positions: device-side setup/bank switch (the app learns it from the
   * first inbound event of the new page) and (re)connect — the motors
   * cannot be assumed to still hold the last pushed values.
   */
  invalidateKnown(setupIndex?: number): void {
    if (setupIndex === undefined) {
      this.lastKnownRaw.clear();
      return;
    }
    for (const c of this.byId.values()) {
      if (c.setupIndex === setupIndex) this.lastKnownRaw.delete(c.id);
    }
  }

  /** Request MIDI access and connect to the ROTO-CONTROL. */
  async connect(): Promise<PhysicalRotoStatus> {
    const req = this.opts.requestMIDIAccess;
    if (!req) {
      this.setStatus({ state: "unsupported" });
      return this.status;
    }
    if (!this.access) {
      this.access = await req();
      this.access.onstatechange = () => this.scanPorts();
    }
    this.scanPorts();
    return this.status;
  }

  disconnect(): void {
    for (const input of this.attachedInputs) input.onmidimessage = null;
    this.attachedInputs = [];
    this.output = null;
    this.setStatus({ state: "disconnected", ports: this.portNames() });
  }

  private portNames(): string[] {
    if (!this.access) return [];
    return each(this.access.inputs).map((p) => p.name ?? p.id);
  }

  private scanPorts(): void {
    if (!this.access) return;
    const pattern = this.opts.deviceNamePattern ?? DEFAULT_NAME_PATTERN;
    const configured = this.opts.deviceName;
    const inputs = each(this.access.inputs).filter((p) => p.state === "connected");
    const outputs = each(this.access.outputs).filter((p) => p.state === "connected");
    // Phase 15 ownership rule: bind ONLY an explicitly configured device
    // or a positively recognized ROTO identity — never an arbitrary port.
    // A non-ROTO device's CCs could otherwise phantom-write show state,
    // and an arbitrary "first output" could drive unknown hardware.
    const matches = (p: { name?: string | null }): boolean =>
      configured !== undefined ? (p.name ?? "") === configured : pattern.test(p.name ?? "");
    const named = inputs.filter(matches);
    const listen = named;
    const output = outputs.find(matches) ?? null;
    const prevOutput = this.output;
    this.attachExtraDevices(inputs, outputs, listen, output);
    if (listen.length === 0) {
      for (const input of this.attachedInputs) input.onmidimessage = null;
      this.attachedInputs = [];
      this.output = null;
      this.setStatus({ state: "disconnected", ports: inputs.map((p) => p.name ?? p.id) });
      return;
    }
    for (const input of this.attachedInputs) {
      if (!listen.includes(input)) input.onmidimessage = null;
    }
    for (const input of listen) {
      input.onmidimessage = (e) => this.handleMessage(e.data);
    }
    this.attachedInputs = listen;
    if (output && output !== prevOutput) this.invalidateKnown(); // re-push everything
    this.output = output;
    this.setStatus({
      state: "connected",
      inputName: listen.map((p) => p.name ?? p.id).join(", "),
      outputName: output ? (output.name ?? output.id) : null,
    });
  }

  private isRotoName(name: string): boolean {
    const pattern = this.opts.deviceNamePattern ?? DEFAULT_NAME_PATTERN;
    if (this.opts.deviceName !== undefined) return name === this.opts.deviceName;
    return pattern.test(name);
  }

  private wantedExtra(name: string): boolean {
    return !this.isRotoName(name) && (this.userNames.has(name) || this.autoNames.has(name));
  }

  /**
   * Operator-connected devices decode through the same channel/CC map, so a
   * matched CC writes the show. They never receive motor sync — teach only.
   * Unconnected ports stay ignored.
   */
  private attachExtraDevices(
    inputs: MidiInputLike[],
    outputs: MidiOutputLike[],
    bound: MidiInputLike[],
    rotoOutput: MidiOutputLike | null,
  ): void {
    for (const input of this.learnInputs) input.onmidimessage = null;
    this.learnInputs = [];
    this.teachOutputs = [];
    for (const input of inputs) {
      const name = input.name ?? input.id;
      if (bound.includes(input) || !this.wantedExtra(name)) continue;
      if (!(this.directions.get(name)?.listen ?? true)) continue;
      input.onmidimessage = (e) => this.handleMessage(e.data, input.name ?? input.id);
      this.learnInputs.push(input);
    }
    for (const output of outputs) {
      const name = output.name ?? output.id;
      if (output === rotoOutput || !this.wantedExtra(name)) continue;
      const teach = this.directions.get(name)?.teach ?? true;
      if (!teach) continue;
      this.teachOutputs.push(output);
    }
  }

  private loadAutoNames(): void {
    try {
      const raw = globalThis.localStorage?.getItem(MIDI_AUTO_KEY);
      if (!raw) return;
      const names = JSON.parse(raw) as unknown;
      if (!Array.isArray(names)) return;
      for (const n of names)
        if (typeof n === "string" && !this.isRotoName(n)) this.autoNames.add(n);
    } catch {
      /* no storage in tests */
    }
  }

  private loadAutomation(): void {
    try {
      const raw = globalThis.localStorage?.getItem(MIDI_AUTOMATION_KEY);
      if (!raw) return;
      const names = JSON.parse(raw) as unknown;
      if (!Array.isArray(names)) return;
      for (const n of names) if (typeof n === "string") this.automationNames.add(n);
    } catch {
      /* no storage in tests */
    }
  }

  private saveAutomation(): void {
    try {
      globalThis.localStorage?.setItem(
        MIDI_AUTOMATION_KEY,
        JSON.stringify([...this.automationNames]),
      );
    } catch {
      /* ignore */
    }
  }

  private loadDirections(): void {
    try {
      const raw = globalThis.localStorage?.getItem(MIDI_DIR_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object") return;
      for (const [name, dir] of Object.entries(parsed as Record<string, unknown>)) {
        if (!dir || typeof dir !== "object") continue;
        const d = dir as { listen?: unknown; teach?: unknown };
        this.directions.set(name, { listen: d.listen !== false, teach: d.teach !== false });
      }
    } catch {
      /* no storage in tests */
    }
  }

  private saveDirections(): void {
    try {
      globalThis.localStorage?.setItem(
        MIDI_DIR_KEY,
        JSON.stringify(Object.fromEntries(this.directions)),
      );
    } catch {
      /* ignore */
    }
  }

  private saveAutoNames(): void {
    try {
      globalThis.localStorage?.setItem(MIDI_AUTO_KEY, JSON.stringify([...this.autoNames]));
    } catch {
      /* ignore */
    }
  }

  private setStatus(s: PhysicalRotoStatus): void {
    this.status = s;
    for (const cb of this.statusHandlers) cb(s);
  }

  private handleMessage(data: Uint8Array | number[] | null, fromName = ""): void {
    if (!data || data.length < 3) return;
    const msg = [data[0]!, data[1]!, data[2]!];
    for (const cb of this.rawHandlers) cb(msg);
    const type = msg[0]! & 0xf0;
    if (type !== 0xb0) return; // CC only; NRPN/notes unverified (monitor first)
    const channel = (msg[0]! & 0x0f) + 1;
    const cc = msg[1]!;
    const value = msg[2]!;
    if (this.captureLearn(channel, cc, value)) return;
    this.lastFromAutomation = fromName !== "" && this.automationNames.has(fromName);
    const key = (channel << 8) | cc;

    // 14-bit LSB: stash and (when an MSB is known) emit. VERIFIED on hardware
    // 2026-09-17: the device sends MSB first, then LSB, resending both on
    // every update — so emitting on LSB arrival too makes the settled value
    // exact instead of lagging one pair behind the hardware.
    const lsbOwner = this.lsbOwners.get(key);
    if (lsbOwner) {
      this.lsbValues.set(lsbOwner.id, value);
      const msb = this.msbValues.get(lsbOwner.id);
      if (msb !== undefined) this.emitDecoded(lsbOwner, (msb << 7) | value);
      return;
    }

    const control = this.byCc.get(key);
    if (!control) return;

    let raw: number;
    if (control.maxValue > 127) {
      this.msbValues.set(control.id, value);
      // Motor-echo guard (VERIFIED symptom 2026-09-20): the device answers a
      // motor command with MSB THEN LSB. Emitting on MSB arrival pairs the
      // new MSB with the STALE LSB — an inexact value that exact-match echo
      // suppression cannot catch, decoded as a phantom manual write (mesh
      // points / map scale drifted on OutSel navigation). While a send is in
      // flight, wait for the LSB: it completes the exact pair and is
      // swallowed by the echo check. Real turns also send MSB+LSB pairs, so
      // a genuine gesture still emits on its LSB — nothing is lost.
      const sent = this.lastSentRaw.get(control.id);
      if (sent && this.now() - sent.at < ECHO_WINDOW_MS) return;
      raw = (value << 7) | (this.lsbValues.get(control.id) ?? 0);
    } else {
      raw = value;
    }
    this.emitDecoded(control, raw);
  }

  /** Armed learn swallows the CC (echoes included) so it cannot drive the show. */
  private captureLearn(channel: number, cc: number, value: number): boolean {
    if (!this.learnArmed) return false;
    const echo = this.teachEchoes.find(
      (e) =>
        e.channel === channel &&
        e.cc === cc &&
        e.value === value &&
        this.now() - e.at < ECHO_WINDOW_MS,
    );
    if (echo) return true;
    const hit = { channel, cc, value };
    for (const cb of this.learnHandlers) cb(hit);
    return true;
  }

  private emitDecoded(control: RotoControl, raw: number): void {
    // Swallow echoes of CCs we just sent. The ROTO motor does not land on
    // the exact value: it answers with the nearest detent, which exact-match
    // suppression misses. That near-miss was decoded as a new gesture and
    // fought the automation (Logic sets 40, the motor reports 39, Logic's
    // next point sets 41…). Any inbound value for a control we just pushed,
    // inside the echo window, is the motor catching up — not a hand.
    const sent = this.lastSentRaw.get(control.id);
    if (sent && sent.raw === raw && this.now() - sent.at < ECHO_WINDOW_MS) return;

    this.lastKnownRaw.set(control.id, raw);
    const pressed = control.kind === "button" ? raw >= 64 : undefined;
    const ev = makeControlEvent(this.source, control, raw, this.now(), pressed);
    for (const cb of this.handlers) cb(ev);
  }

  /**
   * Motorized-knob direction: push a parameter value to the hardware WITHOUT
   * emitting an event. Skipped when the device is already at that value.
   */
  setControlStateQuiet(controlId: string, normalized: number): void {
    if (!this.output && this.teachOutputs.length === 0) return;
    const c = this.byId.get(controlId);
    if (!c) return;
    const raw = c.isStepped ? steppedAnchorRaw(c, normalized) : c.rawFromNormalized(normalized);
    if (this.lastKnownRaw.get(c.id) === raw) return;
    this.sendRaw(c, raw, false);
  }

  private sendRaw(c: RotoControl, raw: number, force: boolean): void {
    // Every outbound byte goes through here. A device with Out unchecked is
    // absent from teachOutputs, so nothing reaches it — including when the
    // ROTO itself is disconnected and this.output is null.
    const targets = [this.output, ...this.teachOutputs].filter(
      (o): o is MidiOutputLike => o !== null,
    );
    if (targets.length === 0) return;
    if (!force && this.lastKnownRaw.get(c.id) === raw) return;
    this.lastKnownRaw.set(c.id, raw);
    this.lastSentRaw.set(c.id, { raw, at: this.now() });
    const channel = c.controlChannel;
    const status = 0xb0 | ((channel - 1) & 0x0f);
    const send = (cc: number, value: number): void => {
      const msg = [status, cc, value];
      this.teachEchoes.push({ channel, cc, value, at: this.now() });
      for (const out of targets) out.send(msg);
      for (const cb of this.rawSendHandlers) cb(msg);
    };
    if (c.maxValue > 127) {
      send(c.controlParam, (raw >> 7) & 0x7f);
      send(c.controlParam + 32, raw & 0x7f);
    } else {
      send(c.controlParam, raw & 0x7f);
    }
  }
}
