/**
 * Screen-space camera control over the renderer's view angles. The shader rotates
 * p.xz by yaw, then p.yz by pitch, then p.xy by roll (each `rot(a)` is +a in its
 * plane), i.e. R = Z(roll) · X(pitch) · Y(yaw). Pointer drags are applied as
 * rotations in screen space (left of R) and converted back to yaw/pitch/roll, so
 * a drag always turns what you see the way you drag, whatever the current tilt or
 * roll, while looks, sliders and ROTO keep using plain angles. Pure math.
 */
export interface ViewAngles {
  yaw: number;
  pitch: number;
  roll: number;
}
type Mat3 = [number, number, number, number, number, number, number, number, number];

const mul = (a: Mat3, b: Mat3): Mat3 => {
  const m = new Array(9).fill(0) as Mat3;
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++)
      for (let k = 0; k < 3; k++) m[r * 3 + c] += a[r * 3 + k] * b[k * 3 + c];
  return m;
};
/** Rotation by +a in the (x,z), (y,z) and (x,y) planes, as the shader's rot(a). */
const rotY = (a: number): Mat3 => {
  const c = Math.cos(a),
    s = Math.sin(a);
  return [c, 0, -s, 0, 1, 0, s, 0, c];
};
const rotX = (a: number): Mat3 => {
  const c = Math.cos(a),
    s = Math.sin(a);
  return [1, 0, 0, 0, c, -s, 0, s, c];
};
const rotZ = (a: number): Mat3 => {
  const c = Math.cos(a),
    s = Math.sin(a);
  return [c, -s, 0, s, c, 0, 0, 0, 1];
};

/** The view rotation (row-major 3×3, column vectors): R = Z(roll) · X(pitch) · Y(yaw). */
export function viewMatrix({ yaw, pitch, roll }: ViewAngles): Mat3 {
  return mul(rotZ(roll), mul(rotX(pitch), rotY(yaw)));
}

const TAU = Math.PI * 2;
/** Shortest signed angle from a to b. */
const delta = (a: number, b: number) => ((((b - a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;

/**
 * Angles for a rotation matrix. Of the two equivalent solutions, returns the one
 * closest to `near` (and unwrapped next to it), so dragging over the top does not
 * make the angles jump by 180°.
 */
export function viewAngles(m: Mat3, near: ViewAngles = { yaw: 0, pitch: 0, roll: 0 }): ViewAngles {
  const sp = Math.max(-1, Math.min(1, m[7]));
  const pitch = Math.asin(sp);
  let a: ViewAngles;
  if (Math.abs(Math.cos(pitch)) < 1e-6) {
    // Straight up/down: yaw and roll share an axis; keep yaw, solve roll.
    const yaw = near.yaw;
    const r = mul(m, rotY(-yaw));
    a = { yaw, pitch, roll: Math.atan2(r[3], r[0]) };
  } else a = { yaw: Math.atan2(m[6], m[8]), pitch, roll: Math.atan2(-m[1], m[4]) };
  const b = { yaw: a.yaw + Math.PI, pitch: Math.PI - a.pitch, roll: a.roll + Math.PI };
  const cost = (v: ViewAngles) =>
    Math.abs(delta(near.yaw, v.yaw)) +
    Math.abs(delta(near.pitch, v.pitch)) +
    Math.abs(delta(near.roll, v.roll));
  const best = cost(b) < cost(a) ? b : a;
  return {
    yaw: near.yaw + delta(near.yaw, best.yaw),
    pitch: near.pitch + delta(near.pitch, best.pitch),
    roll: near.roll + delta(near.roll, best.roll),
  };
}

/**
 * Orbits in screen space: `dx` turns around the screen's vertical axis, `dy` tilts
 * around its horizontal axis (radians; same directions as the old yaw/pitch drag
 * when the view is level).
 */
export function orbitView(view: ViewAngles, dx: number, dy: number): ViewAngles {
  return viewAngles(mul(rotX(dy), mul(rotY(dx), viewMatrix(view))), view);
}

/** Rolls around the screen axis (counter-clockwise on screen for positive angles). */
export function rollView(view: ViewAngles, angle: number): ViewAngles {
  return { ...view, roll: view.roll + angle };
}

/** Pointer drag sensitivity, radians per CSS pixel. */
export const ORBIT_SPEED = 0.005;
