import { describe, expect, it } from "vitest";
import { ParticleCycle } from "../src/engine/particleCycle";

describe("standalone particle performance cycle", () => {
  const settings = { implosion: 0.9, explosion: 0.65, recoveryMs: 2000 };
  it("collapses, bursts and returns exactly to the authored formation", () => {
    const cycle = new ParticleCycle();
    expect(cycle.trigger(1000, settings)).toBe(true);
    expect(cycle.at(1000)).toEqual({ collapse: 0, explosion: 0, phase: "Collapsing" });
    expect(cycle.at(1650)).toEqual({ collapse: 0.9, explosion: 0, phase: "Exploding" });
    expect(cycle.at(1900)).toEqual({ collapse: 0, explosion: 0.65, phase: "Reforming" });
    expect(cycle.at(3900)).toEqual({ collapse: 0, explosion: 0, phase: "Ready" });
  });
  it("rejects retriggering, freezes at identical time, and snapshots controls", () => {
    const cycle = new ParticleCycle();
    const controls = { ...settings };
    cycle.trigger(0, controls);
    controls.explosion = 0;
    expect(cycle.trigger(500, settings)).toBe(false);
    expect(cycle.at(500)).toEqual(cycle.at(500));
    expect(cycle.at(900).explosion).toBe(0.65);
    expect(cycle.trigger(3000, settings)).toBe(true);
  });
  it("resets on a backward clock jump and bounds invalid inputs", () => {
    const cycle = new ParticleCycle();
    expect(cycle.trigger(NaN, settings)).toBe(false);
    cycle.trigger(100, { implosion: 3, explosion: -1, recoveryMs: Infinity });
    expect(cycle.at(750).collapse).toBe(1);
    expect(cycle.at(50).phase).toBe("Ready");
  });
});
