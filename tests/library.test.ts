import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  importImpact,
  libraryFileName,
  libraryJSON,
  librarySize,
  parseImport,
} from "../src/designer/library";
import { parseUserSlots, type UserSlots } from "../src/designer/design";
import { LAB_PRESETS } from "../src/designer/presets";
import { PRESET_BANKS, SHAPE_BANKS } from "../src/designer/banks";

const preset = { ...LAB_PRESETS[0], id: "user-63" };
const shape = { name: "My dune", formation: 29, settings: { Expansion: 0.85 } };
const library: UserSlots = {
  version: 1,
  presets: { "63": preset, "1": preset },
  shapes: { "40": shape },
};

describe("saved library import/export", () => {
  it("exports the dev host slots.json format and round-trips", () => {
    const text = libraryJSON(library);
    expect(parseUserSlots(JSON.parse(text))).toEqual(parseUserSlots(library));
    expect(librarySize(library)).toBe(3);
    expect(libraryFileName(new Date("2026-09-30T12:00:00Z"))).toBe(
      "particles-designer-library-2026-09-30.json",
    );
  });
  it("recognizes a library or a single look, and rejects anything else", () => {
    expect(parseImport(JSON.parse(libraryJSON(library))).type).toBe("library");
    const look = parseImport(
      JSON.parse(readFileSync("examples/looks/lissajous-bloom.json", "utf8")),
    );
    expect(look.type === "look" && look.design.name).toBe("Lissajous bloom");
    expect(() => parseImport({ version: 2, presets: {} })).toThrow(/version/);
    expect(() => parseImport({ version: 1, presets: { "99": preset } })).toThrow();
    expect(() => parseImport({ hello: "world" })).toThrow();
  });
  it("reports slots that replace saved work vs cover built-ins", () => {
    const builtIn = { presets: PRESET_BANKS.flat(), shapes: SHAPE_BANKS.flat() };
    const current: UserSlots = { version: 1, presets: { "63": preset }, shapes: {} };
    // 63: saved already; 1: a built-in (Galaxy drift); shape 40: whatever the factory holds there.
    const impact = importImpact(current, library, builtIn);
    expect(impact.replacesSaved).toBe(1);
    expect(impact.coversBuiltIn).toBe(1 + Number(Boolean(builtIn.shapes[40])));
  });
});
