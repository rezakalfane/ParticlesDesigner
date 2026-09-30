import { describe, expect, it } from "vitest";
import { particleCount } from "../src/engine/renderer";
import { PARTICLE_LOOKS } from "../src/looks/particleLooks";
import { PRESET_BANKS, SHAPE_BANKS } from "../src/designer/banks";
import { LAB_PRESETS } from "../src/designer/presets";
import { PARTICLE_FACTORY_SLOTS } from "../src/looks/particleFactory";

describe("shared Particle Field Designer library", () => {
  it("extends Designer density without changing existing counts or the default cap", () => {
    expect(particleCount(0.95, 200000)).toBe(95050);
    expect(particleCount(1, 200000)).toBe(100000);
    expect(particleCount(2, 200000)).toBe(200000);
    expect(particleCount(2)).toBe(100000);
    expect(particleCount(3, 200000)).toBe(200000);
  });
  it("keeps celestial studies in Designer bank two without changing saved factory slots", () => {
    expect(PRESET_BANKS[1].slice(0, 5).map((p) => p?.name)).toEqual([
      "Solar system",
      "Earth & Moon",
      "Jovian giant",
      "Saturn",
      "Infinite black hole",
    ]);
    expect(SHAPE_BANKS[1].slice(0, 5).map((p) => p?.formation)).toEqual([16, 17, 18, 19, 20]);
    expect(PRESET_BANKS[1][9]).toMatchObject({ name: "Aether storm", formation: 25 });
    expect(SHAPE_BANKS[1][9]?.formation).toBe(25);
    expect(PRESET_BANKS[1][12]).toMatchObject({ name: "Silken currents", formation: 28 });
    expect(SHAPE_BANKS[1][12]?.formation).toBe(28);
    expect(PRESET_BANKS[1].slice(10, 12).map((p) => p?.name)).toEqual([
      "Liquid mercury",
      "Astral flame",
    ]);
    // Slot 12 now holds the baked custom Astral flame (npm run bake).
    expect(SHAPE_BANKS[1].slice(10, 12).map((p) => p?.formation)).toEqual([26, 31]);
  });
  it("appends mystical Designer studies without replacing celestial slots", () => {
    expect(PRESET_BANKS[1].slice(5, 9).map((p) => p?.name)).toEqual([
      "Cosmic lotus",
      "Celestial eye",
      "Astral portal",
      "Eclipse crown",
    ]);
    expect(SHAPE_BANKS[1].slice(5, 9).map((p) => p?.formation)).toEqual([21, 22, 23, 24]);
  });
  it("uses one factory catalog", () => {
    expect(LAB_PRESETS.slice(0, PARTICLE_LOOKS.length)).toEqual(PARTICLE_LOOKS);
    expect(PRESET_BANKS.flat().map((look) => look?.name ?? null)).toEqual(
      PARTICLE_FACTORY_SLOTS.map((look) => look?.name ?? null),
    );
  });
});
