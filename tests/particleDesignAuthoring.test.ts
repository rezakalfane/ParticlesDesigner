import { describe, it, expect } from "vitest";
import { parseDesign, loadUserSlots, DESIGN_STORAGE } from "../src/designer/design";
import { LAB_PRESETS } from "../src/designer/presets";
import { DesignHistory } from "../src/designer/history";

describe("Designer authoring", () => {
  const saved = LAB_PRESETS.find((p) => p.id === "sahara-drift")!;
  it("rejects untrusted values before any state change", () => {
    expect(parseDesign(saved).formation).toBe(29);
    expect(() => parseDesign({ ...saved, formation: 99 })).toThrow();
    expect(() => parseDesign({ ...saved, settings: { Light: Infinity } })).toThrow();
    expect(() => parseDesign({ ...saved, settings: { code: 1 } })).toThrow();
    expect(() => parseDesign({ ...saved, view: [0, 0, 0, 100] })).toThrow();
    expect(() => parseDesign({ ...saved, groups: { audio: "false" } })).toThrow();
  });
  it("round-trips local preset and shape slots", () => {
    const slots = {
      version: 1,
      presets: { 40: saved },
      shapes: { 41: { name: "Sands", formation: 29, settings: { Expansion: 1.2 } } },
    };
    const read = loadUserSlots({
      getItem: (key) => (key === DESIGN_STORAGE ? JSON.stringify(slots) : null),
    });
    expect(read.presets[40].view).toEqual(saved.view);
    expect(read.shapes[41].settings).toEqual({ Expansion: 1.2 });
    expect(() => loadUserSlots({ getItem: () => '{"version":2}' })).toThrow();
  });
  it("keeps immutable bounded undo/redo and discards the redo branch after an edit", () => {
    const history = new DesignHistory<{ light: number }>(3);
    const v = { light: 0 };
    history.push(v);
    v.light = 1;
    history.push(v);
    history.push(v);
    expect(history.undo()).toEqual({ light: 0 });
    expect(history.redo()).toEqual({ light: 1 });
    history.push({ light: 2 });
    history.push({ light: 3 });
    expect(history.undo()).toEqual({ light: 2 });
    history.push({ light: 4 });
    expect(history.canRedo).toBe(false);
    expect(history.undo()).toEqual({ light: 2 });
    expect(history.undo()).toEqual({ light: 1 });
    expect(history.undo()).toBeUndefined();
  });
});

import { compileExpression, parseGeometry } from "../src/engine/customGeometry";
describe("generated procedural geometry", () => {
  it("compiles only bounded scalar math, never statements or external code", () => {
    expect(compileExpression("sin(a*tau+t)*2")).toContain("sin");
    expect(compileExpression("1/(b-0.5)")).toContain("shapeDivide");
    for (const bad of [
      "while(true){}",
      "a;discard",
      "gl_Position.x",
      "sin(a,b)",
      "foo(a)",
      "1e99",
      "(".repeat(30) + "a" + ")".repeat(30),
    ])
      expect(() => compileExpression(bad)).toThrow();
    expect(parseGeometry({ x: "a", y: "b", z: "c" })).toEqual({ x: "a", y: "b", z: "c" });
    expect(() => parseGeometry({ x: "a", y: "b" })).toThrow();
  });
  it("retains generated geometry through local preset and shape storage", () => {
    const geometry = { x: "sin(a*tau)", y: "2*b-1", z: "cos(a*tau)" };
    const preset = { ...LAB_PRESETS[0], formation: 30, geometry };
    const slots = {
      version: 1,
      presets: { 50: preset },
      shapes: { 51: { name: "Custom", formation: 30, geometry } },
    };
    const restored = loadUserSlots({ getItem: () => JSON.stringify(slots) });
    expect(restored.presets[50].geometry).toEqual(geometry);
    expect(restored.shapes[51].geometry).toEqual(geometry);
    expect(() => parseDesign({ ...preset, geometry: null })).toThrow();
  });
});
