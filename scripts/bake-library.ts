/**
 * Bakes the Designer's shared saved library (slots.json) into factory code:
 *  - every distinct custom formula (formation 30) becomes a built-in shape
 *    (formation 31+), compiled into the one particle shader — switching to it
 *    never recompiles;
 *  - every saved preset/shape becomes a factory slot at the SAME bank/slot,
 *    replacing the factory item there, pointing at its baked shape;
 *  - baked slots are removed from slots.json (a timestamped backup is kept
 *    next to it), so the factory version shows instead of the saved copy.
 * Re-running merges with earlier bakes; identical formulas are reused.
 * Baked presets join the factory catalog (src/looks/particleBakedLooks.ts);
 * baked shapes stay Designer shape slots.
 *
 *   npm run bake [-- path/to/slots.json]
 *   npm run bake -- --regenerate   # rewrite the generated files only
 */
import { copyFileSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { parseUserSlots, type SavedDesign, type SavedShape } from "../src/designer/design";
import { LAB_PRESETS } from "../src/designer/presets";
import { LAB_SHAPES } from "../src/designer/banks";
import { BAKED_SHAPE_SLOTS } from "../src/designer/bakedLibrary";
import { BAKED_LOOK_SLOTS } from "../src/looks/particleBakedLooks";
import type { ParticleLook } from "../src/looks/particleLooks";
import { BAKED_FORMATION_START, BAKED_SHAPES } from "../src/engine/bakedShapes";
import { CUSTOM_FORMATION, parseGeometry, type CustomGeometry } from "../src/engine/customGeometry";
import { defaultDesignerSlotsFile } from "../server/designerSlots";

const root = resolve(import.meta.dirname, "..");
const regenerate = process.argv.includes("--regenerate");
const file =
  process.argv.slice(2).find((arg) => !arg.startsWith("--")) ?? defaultDesignerSlotsFile();
const slots = regenerate
  ? { version: 1 as const, presets: {}, shapes: {} }
  : parseUserSlots(JSON.parse(readFileSync(file, "utf8")));
const keys = (record: Record<string, unknown>) =>
  Object.keys(record).sort((a, b) => Number(a) - Number(b));
if (!regenerate && !keys(slots.presets).length && !keys(slots.shapes).length) {
  console.log(`Nothing to bake: ${file} has no saved slots.`);
  process.exit(0);
}

// 1. One baked shape per distinct formula (earlier bakes keep their formation numbers).
const shapes = BAKED_SHAPES.map((shape) => ({ ...shape }));
const taken = new Set(
  [...LAB_SHAPES.slice(0, BAKED_FORMATION_START), ...shapes].map((s) => s.name.toLowerCase()),
);
function bakedFormation(geometry: CustomGeometry, name: string): number {
  const clean = parseGeometry(geometry);
  const key = JSON.stringify(clean);
  let index = shapes.findIndex((shape) => JSON.stringify(shape.geometry) === key);
  if (index < 0) {
    let unique = name;
    for (let n = 2; taken.has(unique.toLowerCase()); n++)
      unique = `${name} ${["", "", "II", "III", "IV", "V", "VI"][n] ?? n}`;
    taken.add(unique.toLowerCase());
    index = shapes.push({ name: unique, geometry: clean }) - 1;
  }
  return BAKED_FORMATION_START + index;
}
// Shape slots name the shapes; presets reuse them or add their own.
const formations = new Map<SavedShape | SavedDesign, number>();
for (const kind of ["shapes", "presets"] as const)
  for (const key of keys(slots[kind])) {
    const item = slots[kind][key];
    if (item.formation === CUSTOM_FORMATION && item.geometry)
      formations.set(item, bakedFormation(item.geometry, item.name));
  }
const count = BAKED_FORMATION_START + shapes.length;
function weights(item: SavedShape | SavedDesign, formation: number) {
  if (!item.formationWeights) return undefined;
  const out = Array.from({ length: count }, (_, i) => item.formationWeights![i] ?? 0);
  if (formation !== item.formation) {
    out[formation] += out[CUSTOM_FORMATION];
    out[CUSTOM_FORMATION] = 0;
  }
  return out;
}

// 2. Factory slots at the same positions (replacing what was there).
const presetSlots: Record<number, ParticleLook> = { ...BAKED_LOOK_SLOTS };
const shapeSlots: Record<number, SavedShape> = { ...BAKED_SHAPE_SLOTS };
const slug = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const ids = new Set(LAB_PRESETS.map((p) => p.id));
for (const key of keys(slots.presets)) {
  const { geometry: _geometry, ...item } = slots.presets[key];
  const formation = formations.get(slots.presets[key]) ?? item.formation;
  // A replaced factory slot keeps its id (scripts and ROTO rehearsals address it).
  let id =
    LAB_PRESETS[Number(key)]?.id ?? presetSlots[Number(key)]?.id ?? `baked-${slug(item.name)}`;
  if (!LAB_PRESETS[Number(key)] && ids.has(id)) id = `${id}-${key}`;
  ids.add(id);
  presetSlots[Number(key)] = { ...item, id, formation, formationWeights: weights(item, formation) };
  if (!presetSlots[Number(key)].formationWeights) delete presetSlots[Number(key)].formationWeights;
}
for (const key of keys(slots.shapes)) {
  const item = slots.shapes[key];
  const formation = formations.get(item) ?? item.formation;
  const shape: SavedShape = { name: item.name, formation, settings: item.settings };
  const mixture = weights(item, formation);
  if (mixture) shape.formationWeights = mixture;
  shapeSlots[Number(key)] = shape;
}

// 3. Generated sources.
const header = "// GENERATED by `npm run bake` (scripts/bake-library.ts) — do not edit by hand.\n";
const shapesPath = resolve(root, "src/engine/bakedShapes.ts");
const libraryPath = resolve(root, "src/designer/bakedLibrary.ts");
const looksPath = resolve(root, "src/looks/particleBakedLooks.ts");
writeFileSync(
  shapesPath,
  `${header}import type { CustomGeometry } from "./customGeometry";
/** Baked shapes follow the built-in shapes (0..29) and the live custom field (30). */
export const BAKED_FORMATION_START = ${BAKED_FORMATION_START};
/** Designer custom formulas baked into built-in shapes: formation 31 + index. */
export const BAKED_SHAPES: readonly { name: string; geometry: CustomGeometry }[] = ${JSON.stringify(shapes)};
`,
);
writeFileSync(
  looksPath,
  `${header}import type { ParticleLook } from "./particleLooks";
/**
 * Saved Designer presets promoted to shared factory slots (slot index = bank * 16 + slot),
 * replacing the factory look there. Used by the Designer preset banks.
 */
export const BAKED_LOOK_SLOTS: Readonly<Record<number, ParticleLook>> = ${JSON.stringify(presetSlots)};
`,
);
writeFileSync(
  libraryPath,
  `${header}import type { SavedShape } from "./design";
/** Saved Designer shapes promoted to factory shape slots (slot index = bank * 16 + slot). */
export const BAKED_SHAPE_SLOTS: Readonly<Record<number, SavedShape>> = ${JSON.stringify(shapeSlots)};
`,
);
execFileSync(
  resolve(root, "node_modules/.bin/prettier"),
  ["--write", shapesPath, looksPath, libraryPath],
  { stdio: "ignore" },
);
if (regenerate) {
  console.log(`Regenerated the baked files (${shapes.length} shapes).`);
  process.exit(0);
}

// 4. Retire the baked copies from the shared library (backup first).
const backup = `${file}.before-bake-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
copyFileSync(file, backup);
const tmp = `${file}.${process.pid}.tmp`;
writeFileSync(tmp, JSON.stringify({ version: 1, presets: {}, shapes: {} }, null, 2));
renameSync(tmp, file);

console.log(
  `Baked ${shapes.length - BAKED_SHAPES.length} new shape(s) (${shapes.length} total), ` +
    `${keys(slots.presets).length} preset slot(s), ${keys(slots.shapes).length} shape slot(s).`,
);
for (const [i, shape] of shapes.entries())
  console.log(`  formation ${BAKED_FORMATION_START + i}: ${shape.name}`);
console.log(`Backup of the saved library: ${backup}`);
