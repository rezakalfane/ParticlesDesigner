/**
 * ControlEvent: the single event contract shared by VirtualRoto (mouse/UI),
 * the future PhysicalRoto (MIDI), and test fakes. The engine never knows
 * which source produced an event.
 */
import { RotoControl, RotoControlKind } from "./setup";

export type ControlSource = "virtual" | "physical";

export interface ControlEvent {
  /** Which adapter produced the event. */
  readonly source: ControlSource;
  /** Logical identity: `setupIndex:kind:controlIndex`. */
  readonly controlId: string;
  readonly kind: RotoControlKind;
  /** Normalized 0..1 value (engine-facing). */
  readonly value: number;
  /** Raw value in the control's own source range (preserved for export/UI). */
  readonly rawValue: number;
  /** Milliseconds; injected by the source so tests stay deterministic. */
  readonly timestamp: number;
  /** Button state, when the event comes from a button. */
  readonly pressed?: boolean;
  /** Step index when the control has hapticSteps > 0. */
  readonly stepIndex?: number;
  /** Detent count when the control has hapticSteps > 0 (Phase 10 "detent" scale). */
  readonly stepCount?: number;
}

export function makeControlEvent(
  source: ControlSource,
  control: RotoControl,
  rawValue: number,
  timestamp: number,
  pressed?: boolean,
): ControlEvent {
  const value = control.normalizedFromRaw(rawValue);
  const stepIndex = control.stepIndexFor(value);
  return {
    source,
    controlId: control.id,
    kind: control.kind,
    value,
    rawValue,
    timestamp,
    ...(pressed !== undefined ? { pressed } : {}),
    ...(stepIndex !== undefined ? { stepIndex } : {}),
    ...(stepIndex !== undefined ? { stepCount: control.hapticSteps } : {}),
  };
}

/** Two events are logically equal when source and timestamp are ignored. */
export function sameLogicalEvent(a: ControlEvent, b: ControlEvent): boolean {
  return (
    a.controlId === b.controlId &&
    a.kind === b.kind &&
    a.value === b.value &&
    a.rawValue === b.rawValue &&
    a.pressed === b.pressed &&
    a.stepIndex === b.stepIndex &&
    a.stepCount === b.stepCount
  );
}

export type ControlEventHandler = (ev: ControlEvent) => void;

/** Common adapter interface for VirtualRoto and (future) PhysicalRoto. */
export interface RotoEventSource {
  readonly source: ControlSource;
  onEvent(cb: ControlEventHandler): void;
}
