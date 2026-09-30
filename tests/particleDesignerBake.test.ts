import { describe, expect, it } from "vitest";
import { BAKED_SHAPE_SLOTS } from "../src/designer/bakedLibrary";
import { BAKED_LOOK_SLOTS as BAKED_PRESET_SLOTS } from "../src/looks/particleBakedLooks";
import { performable } from "../src/looks/particleLooks";
import { LAB_SHAPES, PRESET_BANKS, SHAPE_BANKS } from "../src/designer/banks";
import { parseDesign } from "../src/designer/design";
import { BAKED_FORMATION_START, BAKED_SHAPES } from "../src/engine/bakedShapes";
import { CUSTOM_FORMATION, geometryGLSL } from "../src/engine/customGeometry";
import { PARTICLE_FORMATION_COUNT } from "../src/engine/renderer";

describe("baked Designer library", () => {
  it("adds each baked formula as a built-in shape after the live custom field", () => {
    expect(PARTICLE_FORMATION_COUNT).toBe(BAKED_FORMATION_START + BAKED_SHAPES.length);
    expect(LAB_SHAPES).toHaveLength(PARTICLE_FORMATION_COUNT);
    expect(LAB_SHAPES[CUSTOM_FORMATION].name).toBe("Custom field");
    const names = LAB_SHAPES.map((shape) => shape.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
    for (const shape of BAKED_SHAPES) expect(() => geometryGLSL(shape.geometry)).not.toThrow();
  });
  it("stores baked slots as valid factory designs that never recompile the shader", () => {
    for (const [key, preset] of Object.entries(BAKED_PRESET_SLOTS)) {
      const parsed = parseDesign(preset);
      expect(parsed.formation, preset.name).not.toBe(CUSTOM_FORMATION);
      expect(parsed.geometry, preset.name).toBeUndefined();
      // Banks hold the performable copy (audio, ripple and cycle available).
      expect(PRESET_BANKS[Math.floor(Number(key) / 16)][Number(key) % 16]).toEqual(
        performable(preset),
      );
    }
    for (const [key, shape] of Object.entries(BAKED_SHAPE_SLOTS)) {
      expect(shape.formation, shape.name).not.toBe(CUSTOM_FORMATION);
      expect(shape.formation).toBeLessThan(PARTICLE_FORMATION_COUNT);
      expect(SHAPE_BANKS[Math.floor(Number(key) / 16)][Number(key) % 16]).toBe(shape);
    }
    const ids = PRESET_BANKS.flat().flatMap((preset) => (preset ? [preset.id] : []));
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("still reads mixtures saved before the shapes were baked", () => {
    const old = { ...BAKED_PRESET_SLOTS[Number(Object.keys(BAKED_PRESET_SLOTS)[0])] };
    old.formationWeights = Array.from({ length: CUSTOM_FORMATION + 1 }, (_, i) => Number(i === 3));
    expect(parseDesign(old).formationWeights).toHaveLength(PARTICLE_FORMATION_COUNT);
  });
});
