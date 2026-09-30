/**
 * Pointer gestures for a particle view (Designer canvas and embed kit):
 *  - drag: orbit in screen space (the field turns the way you drag, at any tilt/roll);
 *  - Shift+drag or right-drag: roll, twisting around the centre of the view;
 *  - two fingers: twist to roll, pinch to zoom;
 *  - wheel / trackpad pinch: zoom;
 *  - double-click: reset (e.g. back to the look's own viewpoint).
 */
import { ORBIT_SPEED, orbitView, rollView, type ViewAngles } from "./viewRotation";

export interface CameraView extends ViewAngles {
  distance: number;
}
export interface ViewGestureOptions {
  get(): CameraView;
  set(view: CameraView): void;
  /** Drag to orbit/roll. Default true. */
  orbit?: boolean;
  /** Wheel and pinch zoom (captures page scrolling over the element). Default true. */
  zoom?: boolean;
  /** A drag or pinch started / ended (e.g. pause auto-rotation, commit an undo step). */
  onStart?(): void;
  onEnd?(): void;
  /** Double-click. */
  onReset?(): void;
}

export const MIN_DISTANCE = 3;
export const MAX_DISTANCE = 8;
const TAU = Math.PI * 2;
const shortest = (a: number) => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
const clampDistance = (d: number) => Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, d));

/** Attaches the gestures; returns a function that removes them. */
export function attachViewGestures(element: HTMLElement, options: ViewGestureOptions): () => void {
  const orbit = options.orbit ?? true,
    zoom = options.zoom ?? true;
  const pointers = new Map<number, { x: number; y: number }>();
  let rolling = false;
  let active = false;
  const start = () => {
    if (!active) options.onStart?.();
    active = true;
  };
  const end = () => {
    if (active) options.onEnd?.();
    active = false;
  };
  /** Screen angle (counter-clockwise, y up) of a point around the element's centre. */
  const centreAngle = (x: number, y: number) => {
    const r = element.getBoundingClientRect();
    return Math.atan2(-(y - (r.top + r.height / 2)), x - (r.left + r.width / 2));
  };
  const pair = () => {
    const [a, b] = [...pointers.values()];
    return {
      angle: Math.atan2(-(b.y - a.y), b.x - a.x),
      spread: Math.hypot(b.x - a.x, b.y - a.y),
    };
  };
  const down = (e: PointerEvent) => {
    if (!orbit && e.pointerType === "mouse") return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    element.setPointerCapture(e.pointerId);
    rolling = e.shiftKey || e.button === 2;
    start();
  };
  const move = (e: PointerEvent) => {
    const last = pointers.get(e.pointerId);
    if (!last) return;
    const view = options.get();
    if (pointers.size >= 2) {
      const before = pair();
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const after = pair();
      const next: CameraView = orbit
        ? { ...view, ...rollView(view, shortest(after.angle - before.angle)) }
        : { ...view };
      if (zoom && before.spread > 0 && after.spread > 0)
        next.distance = clampDistance(view.distance * (before.spread / after.spread));
      options.set(next);
      return;
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!orbit) return;
    if (rolling || e.shiftKey) {
      const turn = shortest(centreAngle(e.clientX, e.clientY) - centreAngle(last.x, last.y));
      options.set({ ...view, ...rollView(view, turn) });
    } else {
      const next = orbitView(
        view,
        (e.clientX - last.x) * ORBIT_SPEED,
        (e.clientY - last.y) * ORBIT_SPEED,
      );
      options.set({ ...view, ...next });
    }
  };
  const up = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size === 0) {
      rolling = false;
      end();
    }
  };
  const wheel = (e: WheelEvent) => {
    e.preventDefault();
    const view = options.get();
    // Trackpad pinch arrives as ctrl+wheel with small deltas: scale it up.
    const step = e.deltaY * (e.ctrlKey ? 0.02 : 0.003);
    options.set({ ...view, distance: clampDistance(view.distance + step) });
  };
  const dblclick = () => options.onReset?.();
  const contextmenu = (e: Event) => e.preventDefault();

  const previousTouchAction = element.style.touchAction;
  element.style.touchAction = "none";
  element.addEventListener("pointerdown", down);
  element.addEventListener("pointermove", move);
  element.addEventListener("pointerup", up);
  element.addEventListener("pointercancel", up);
  if (orbit) element.addEventListener("contextmenu", contextmenu);
  if (orbit && options.onReset) element.addEventListener("dblclick", dblclick);
  if (zoom) element.addEventListener("wheel", wheel, { passive: false });
  return () => {
    element.style.touchAction = previousTouchAction;
    element.removeEventListener("pointerdown", down);
    element.removeEventListener("pointermove", move);
    element.removeEventListener("pointerup", up);
    element.removeEventListener("pointercancel", up);
    element.removeEventListener("contextmenu", contextmenu);
    element.removeEventListener("dblclick", dblclick);
    element.removeEventListener("wheel", wheel);
  };
}
