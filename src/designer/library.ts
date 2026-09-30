/**
 * Saved-library import/export (pure). The export is exactly the slots.json format
 * of the dev host, so a downloaded library also works with `npm run bake -- file.json`.
 */
import { parseDesign, parseUserSlots, type SavedDesign, type UserSlots } from "./design";

export type ImportResult =
  { type: "library"; slots: UserSlots } | { type: "look"; design: SavedDesign };

/** A whole library (presets/shapes by slot) or one look exported by Embed → Download JSON. */
export function parseImport(raw: unknown): ImportResult {
  if (raw && typeof raw === "object" && ("presets" in raw || "shapes" in raw))
    return { type: "library", slots: parseUserSlots(raw) };
  return { type: "look", design: parseDesign(raw) };
}

export function libraryJSON(slots: UserSlots): string {
  return JSON.stringify(
    { version: 1, presets: slots.presets, shapes: slots.shapes } satisfies UserSlots,
    null,
    2,
  );
}

export function libraryFileName(date = new Date()): string {
  return `particles-designer-library-${date.toISOString().slice(0, 10)}.json`;
}

export const librarySize = (slots: UserSlots) =>
  Object.keys(slots.presets).length + Object.keys(slots.shapes).length;

/** How an incoming library lands: slots replacing saved work vs covering built-ins. */
export function importImpact(
  current: UserSlots,
  incoming: UserSlots,
  builtIn: { presets: (unknown | null)[]; shapes: (unknown | null)[] },
): { replacesSaved: number; coversBuiltIn: number } {
  let replacesSaved = 0,
    coversBuiltIn = 0;
  for (const kind of ["presets", "shapes"] as const)
    for (const key of Object.keys(incoming[kind])) {
      if (current[kind][key]) replacesSaved++;
      else if (builtIn[kind][Number(key)]) coversBuiltIn++;
    }
  return { replacesSaved, coversBuiltIn };
}
