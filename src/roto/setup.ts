/**
 * ROTO-SETUP v1 JSON import/export and the canonical RotoModel.
 *
 * Compatibility policy (see docs/ROTO-FORMAT.md):
 * - Only the observed ROTO-SETUP v1 shape from the supplied examples is claimed.
 * - The parsed raw JSON object is retained and mutated in place on edit, so
 *   unknown fields, array order, non-dense controlIndex values, sentinel values
 *   (255, 65535) and unrecognized numeric modes survive an import/export round
 *   trip byte-for-byte (modulo whitespace).
 * - Rendering code must never read this raw JSON; it reads RotoControl/RotoSetup.
 */

export type RotoControlKind = "knob" | "button";

export class RotoFormatError extends Error {
  override readonly name = "RotoFormatError";
}

type Raw = Record<string, unknown>;

function isRecord(v: unknown): v is Raw {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function num(raw: Raw, key: string): number | undefined {
  const v = raw[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function str(raw: Raw, key: string): string | undefined {
  const v = raw[key];
  return typeof v === "string" ? v : undefined;
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * One logical control (knob or button). Wraps the raw JSON record; identity is
 * `setupIndex:kind:controlIndex` — never the array offset, because observed
 * controlIndex values are not dense.
 */
export class RotoControl {
  constructor(
    readonly kind: RotoControlKind,
    readonly setupIndex: number,
    readonly raw: Raw,
  ) {}

  get id(): string {
    return `${this.setupIndex}:${this.kind}:${this.controlIndex}`;
  }

  get controlIndex(): number {
    const v = num(this.raw, "controlIndex");
    if (v === undefined) {
      throw new RotoFormatError(`control is missing numeric controlIndex`);
    }
    return v;
  }

  /** Raw numeric mode. Observed: 0 and 1. Not interpreted — preserved as-is. */
  get controlMode(): number {
    return num(this.raw, "controlMode") ?? 0;
  }
  get controlChannel(): number {
    return num(this.raw, "controlChannel") ?? 1;
  }
  get controlParam(): number {
    return num(this.raw, "controlParam") ?? 0;
  }
  /** Observed sentinel 65535 on many buttons. Preserved, not interpreted. */
  get nrpnAddress(): number {
    return num(this.raw, "nrpnAddress") ?? 0;
  }
  get minValue(): number {
    return num(this.raw, "minValue") ?? 0;
  }
  get maxValue(): number {
    return num(this.raw, "maxValue") ?? 127;
  }
  get controlName(): string {
    return str(this.raw, "controlName") ?? "";
  }
  /** Observed palette index (0..72 seen). Mapping to RGB is unverified. */
  get colorScheme(): number {
    return num(this.raw, "colorScheme") ?? 0;
  }
  get hapticMode(): number {
    return num(this.raw, "hapticMode") ?? 0;
  }
  /** Observed sentinel 255 = "no indent". Knobs only. */
  get hapticIndent1(): number | undefined {
    return num(this.raw, "hapticIndent1");
  }
  get hapticIndent2(): number | undefined {
    return num(this.raw, "hapticIndent2");
  }
  get hapticSteps(): number {
    return num(this.raw, "hapticSteps") ?? 0;
  }
  get stepNames(): string[] {
    const v = this.raw["stepNames"];
    return Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : [];
  }
  /** Buttons only. */
  get ledOnColor(): number | undefined {
    return num(this.raw, "ledOnColor");
  }
  get ledOffColor(): number | undefined {
    return num(this.raw, "ledOffColor");
  }

  get isStepped(): boolean {
    return this.hapticSteps > 0;
  }

  /** Normalize a raw value into 0..1 using this control's own source range. */
  normalizedFromRaw(rawValue: number): number {
    const span = this.maxValue - this.minValue;
    if (span <= 0) return 0;
    return clamp01((rawValue - this.minValue) / span);
  }

  /** Denormalize 0..1 back into this control's source range (rounded). */
  rawFromNormalized(n: number): number {
    return Math.round(this.minValue + clamp01(n) * (this.maxValue - this.minValue));
  }

  /** Step index for a normalized value when hapticSteps > 0, else undefined. */
  stepIndexFor(normalized: number): number | undefined {
    if (!this.isStepped) return undefined;
    return Math.round(clamp01(normalized) * (this.hapticSteps - 1));
  }

  /** Step label if a non-empty name exists for the step, else undefined. */
  stepNameFor(normalized: number): string | undefined {
    const idx = this.stepIndexFor(normalized);
    if (idx === undefined) return undefined;
    const name = this.stepNames[idx];
    return name !== undefined && name !== "" ? name : undefined;
  }

  // --- Edits mutate the raw record so export keeps every other field. ---

  rename(name: string): void {
    this.raw["controlName"] = name;
  }
  setRange(minValue: number, maxValue: number): void {
    this.raw["minValue"] = minValue;
    this.raw["maxValue"] = maxValue;
  }
  /** MIDI learn: rewrite channel (1–16) and CC. Mutates the raw record. */
  setMidi(channel: number, param: number): void {
    const ch = Math.round(channel);
    const cc = Math.round(param);
    this.raw["controlChannel"] = ch < 1 ? 1 : ch > 16 ? 16 : ch;
    this.raw["controlParam"] = cc < 0 ? 0 : cc > 127 ? 127 : cc;
  }
}

/** Canonical controller setup: envelope + ordered knob/button records. */
export class RotoSetup {
  readonly knobs: RotoControl[] = [];
  readonly buttons: RotoControl[] = [];

  constructor(readonly raw: Raw) {
    const index = this.index;
    for (const c of rawArray(raw, "knobs")) {
      this.knobs.push(new RotoControl("knob", index, c));
    }
    for (const c of rawArray(raw, "buttons")) {
      this.buttons.push(new RotoControl("button", index, c));
    }
  }

  get version(): number {
    return num(this.raw, "version") ?? 0;
  }
  get type(): string {
    return str(this.raw, "type") ?? "";
  }
  get name(): string {
    return str(this.raw, "name") ?? "";
  }
  get index(): number {
    return num(this.raw, "index") ?? 0;
  }

  get controls(): RotoControl[] {
    return [...this.knobs, ...this.buttons];
  }

  controlById(id: string): RotoControl | undefined {
    return this.controls.find((c) => c.id === id);
  }

  rename(name: string): void {
    this.raw["name"] = name;
  }
}

function rawArray(raw: Raw, key: string): Raw[] {
  const v = raw[key];
  if (v === undefined) return [];
  if (!Array.isArray(v)) {
    throw new RotoFormatError(`"${key}" must be an array when present`);
  }
  return v.map((item, i) => {
    if (!isRecord(item)) {
      throw new RotoFormatError(`"${key}"[${i}] must be an object`);
    }
    return item;
  });
}

/**
 * Parse ROTO-SETUP v1 JSON text. Throws RotoFormatError with an actionable
 * message on malformed input; the caller's current setup is never touched.
 */
export function parseRotoSetup(text: string): RotoSetup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new RotoFormatError(`invalid JSON: ${(e as Error).message}`);
  }
  if (!isRecord(data)) {
    throw new RotoFormatError(`top level must be a JSON object`);
  }
  if (num(data, "version") !== 1) {
    throw new RotoFormatError(
      `unsupported version ${JSON.stringify(data["version"])}; only observed v1 is supported`,
    );
  }
  if (str(data, "type") !== "MIDI") {
    throw new RotoFormatError(
      `unsupported type ${JSON.stringify(data["type"])}; only observed "MIDI" is supported`,
    );
  }
  if (str(data, "name") === undefined) {
    throw new RotoFormatError(`missing string field "name"`);
  }
  if (num(data, "index") === undefined) {
    throw new RotoFormatError(`missing numeric field "index"`);
  }
  const setup = new RotoSetup(data);
  // Validate identity fields up front so errors are actionable at import time.
  for (const c of setup.controls) {
    void c.controlIndex;
  }
  return setup;
}

/**
 * Serialize back to the observed v1 shape. The raw parsed object (with any
 * in-place edits) is emitted, so unknown fields, key order and array order are
 * preserved exactly; no fields are invented.
 */
export function serializeRotoSetup(setup: RotoSetup): string {
  return JSON.stringify(setup.raw, null, 4);
}
