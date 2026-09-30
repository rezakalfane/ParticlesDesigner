import { describe, expect, it } from "vitest";
import {
  orbitView,
  rollView,
  viewAngles,
  viewMatrix,
  type ViewAngles,
} from "../src/engine/viewRotation";

/** The shader, literally: p.xz*=rot(yaw); p.yz*=rot(pitch); p.xy*=rot(roll) (GLSL row-vector × mat2). */
function shader(v: [number, number, number], { yaw, pitch, roll }: ViewAngles) {
  const rot = (u: number, w: number, a: number) => [
    u * Math.cos(a) - w * Math.sin(a),
    u * Math.sin(a) + w * Math.cos(a),
  ];
  let [x, y, z] = v;
  [x, z] = rot(x, z, yaw);
  [y, z] = rot(y, z, pitch);
  [x, y] = rot(x, y, roll);
  return [x, y, z];
}
const apply = (m: number[], v: number[]) =>
  [0, 1, 2].map((r) => m[r * 3] * v[0] + m[r * 3 + 1] * v[1] + m[r * 3 + 2] * v[2]);
const close = (a: number[], b: number[]) => a.forEach((x, i) => expect(x).toBeCloseTo(b[i], 9));
const views: ViewAngles[] = [
  { yaw: 0, pitch: 0, roll: 0 },
  { yaw: 0.4, pitch: 0.65, roll: 0 },
  { yaw: -2.1, pitch: 1.2, roll: Math.PI / 2 },
  { yaw: 3, pitch: -0.7, roll: -2.5 },
];

describe("view rotation", () => {
  it("matches the shader's rotation order and signs", () => {
    for (const view of views)
      for (const v of [
        [1, 0, 0],
        [0, 1, 0],
        [0.3, -0.4, 0.8],
      ] as [number, number, number][])
        close(apply(viewMatrix(view), v), shader(v, view));
  });
  it("round-trips angles, picking the solution nearest the previous angles", () => {
    for (const view of views) {
      const back = viewAngles(viewMatrix(view), view);
      close([back.yaw, back.pitch, back.roll], [view.yaw, view.pitch, view.roll]);
      close(viewMatrix(back), viewMatrix(view));
    }
    // The dual solution describes the same orientation.
    const dual = { yaw: 0.4 + Math.PI, pitch: Math.PI - 0.65, roll: Math.PI };
    close(viewMatrix(dual), viewMatrix({ yaw: 0.4, pitch: 0.65, roll: 0 }));
  });
  it("orbits like the old drag when the view is level", () => {
    const next = orbitView({ yaw: 0.3, pitch: 0, roll: 0 }, 0.1, 0.2);
    expect(next.yaw).toBeCloseTo(0.4, 9);
    expect(next.pitch).toBeCloseTo(0.2, 9);
    expect(next.roll).toBeCloseTo(0, 9);
  });
  it("a horizontal drag moves the front of the field horizontally on screen, at any tilt or roll", () => {
    for (const view of views) {
      // The object point currently at the screen centre, facing the viewer.
      const m = viewMatrix(view);
      const front = [m[6], m[7], m[8]]; // Rᵀ·(0,0,1): third row
      const moved = apply(viewMatrix(orbitView(view, 0.2, 0)), front);
      expect(moved[1]).toBeCloseTo(0, 9); // no vertical drift on screen
      expect(moved[0]).toBeCloseTo(-Math.sin(0.2), 9);
      const tilted = apply(viewMatrix(orbitView(view, 0, 0.2)), front);
      expect(tilted[0]).toBeCloseTo(0, 9); // vertical drag: no horizontal drift
    }
  });
  it("stays continuous when dragging over the top (no 180° angle jumps)", () => {
    let view: ViewAngles = { yaw: 0.5, pitch: 1.4, roll: 0.2 };
    for (let i = 0; i < 40; i++) {
      const next = orbitView(view, 0, 0.02);
      // Near the pole yaw and roll may swing quickly (gimbal), but never flip by ~π.
      for (const k of ["yaw", "pitch", "roll"] as const)
        expect(Math.abs(next[k] - view[k]), k).toBeLessThan(Math.PI / 2);
      // The orientation itself moves smoothly.
      const a = viewMatrix(view),
        b = viewMatrix(next);
      expect(Math.max(...a.map((x, j) => Math.abs(x - b[j])))).toBeLessThan(0.05);
      view = next;
    }
  });
  it("tilting a level view over the top keeps yaw and roll (pitch simply passes 90°)", () => {
    let view: ViewAngles = { yaw: 0.5, pitch: 1.4, roll: 0 };
    for (let i = 0; i < 40; i++) view = orbitView(view, 0, 0.02);
    expect(view.pitch).toBeCloseTo(1.4 + 0.8, 6);
    expect(view.yaw).toBeCloseTo(0.5, 6);
    expect(view.roll).toBeCloseTo(0, 6);
  });
  it("rolls around the screen axis", () => {
    const view = { yaw: 0.4, pitch: 0.65, roll: 0.1 };
    const rolled = rollView(view, 0.3);
    expect(rolled).toEqual({ yaw: 0.4, pitch: 0.65, roll: 0.4 });
    // Counter-clockwise on screen (y up): the screen-right point moves up.
    const m = viewMatrix(view);
    const right = [m[0], m[1], m[2]]; // Rᵀ·(1,0,0): first row
    const after = apply(viewMatrix(rolled), right);
    expect(after[1]).toBeCloseTo(Math.sin(0.3), 9);
  });
});
