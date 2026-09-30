import { parseGeometry, CUSTOM_FORMATION, type CustomGeometry } from "../engine/customGeometry";
import type { LabPreset } from "./presets";
import { PARTICLE_LOOK_GROUPS, type ParticleLookGroups } from "../looks/particleLooks";
import { LAB_SHAPES } from "./banks";

/** Optional inspiration photo sent with a prompt: a downscaled image data URL. */
export const DESIGN_IMAGE_MAX_CHARS = 2_000_000;
/** Longest side of the inspiration photo after in-browser downscaling. */
export const DESIGN_IMAGE_MAX_SIDE = 1024;
/** The same bounded vocabulary is used for AI responses and saved designs. */
export const DESIGN_RANGES: Record<string, readonly [number, number]> = {
  "Particle density": [0, 2],
  "Particle thickness": [0, 1],
  Expansion: [0, 4],
  "Particle dispersion": [0, 1],
  Turbulence: [0, 1],
  "Turbulence scale": [0.1, 8],
  "Turbulence density": [0, 1],
  Light: [0, 1],
  "Color variety": [0, 5],
  "Color drift": [0, 1],
  "Halo glow": [0, 1],
  "Depth softness": [0, 1],
  "Focus plane": [0, 1],
  "Ribbon brightness": [0, 1],
  "Ribbon length": [0, 8],
  "Trail head size": [1, 4],
  "Trail thickness": [0.25, 16],
  Motion: [0, 1],
  "Audio depth": [0, 2],
  Attraction: [0, 1],
  "Attractor separation": [0, 1],
  "Attractor orbit": [0, 1],
  "Rotation X": [0, 1],
  "Rotation Y": [0, 1],
  "Rotation Z": [0, 1],
  Shockwave: [0, 1],
  Implosion: [0, 1],
  Explosion: [0, 1],
  "Recovery time": [0, 1],
};
export const DESIGN_GROUPS = PARTICLE_LOOK_GROUPS;
export type DesignGroups = ParticleLookGroups;
export type SavedDesign = LabPreset & { geometry?: CustomGeometry };
export type SavedShape = {
  geometry?: CustomGeometry;
  name: string;
  formation: number;
  settings?: Record<string, number>;
  formationWeights?: number[];
};
export const SHAPE_SETTINGS = [
  "Expansion",
  "Particle dispersion",
  "Turbulence",
  "Turbulence scale",
  "Turbulence density",
  "Attraction",
  "Attractor separation",
  "Attractor orbit",
];
const number = (v: unknown, min: number, max: number): number => {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max)
    throw new Error("Design contains an invalid number.");
  return v;
};
export function parseDesign(raw: unknown): SavedDesign {
  if (!raw || typeof raw !== "object") throw new Error("Invalid design.");
  const v = raw as Record<string, unknown>;
  if (
    typeof v.name !== "string" ||
    !v.name.trim() ||
    v.name.length > 80 ||
    typeof v.description !== "string" ||
    v.description.length > 600
  )
    throw new Error("Invalid design name or description.");
  const formation = number(v.formation, 0, LAB_SHAPES.length - 1);
  if (!Number.isInteger(formation) || !Array.isArray(v.view) || v.view.length !== 4)
    throw new Error("Invalid shape or viewpoint.");
  const view = v.view.map((n, i) =>
    number(n, i === 3 ? 3 : -180, i === 3 ? 8 : 180),
  ) as SavedDesign["view"];
  if (!v.settings || typeof v.settings !== "object" || Array.isArray(v.settings))
    throw new Error("Invalid settings.");
  const settings: Record<string, number> = {};
  for (const [key, value] of Object.entries(v.settings)) {
    if (!DESIGN_RANGES[key]) throw new Error("Unknown particle control.");
    settings[key] = number(value, ...DESIGN_RANGES[key]);
  }
  const design: SavedDesign = {
    id: "user-design",
    name: v.name.trim(),
    description: v.description,
    formation,
    view,
    settings,
  };
  for (const key of ["audioEnabled", "attractorsEnabled", "shockEnabled", "cycleAudio"] as const) {
    if (v[key] !== undefined) {
      if (typeof v[key] !== "boolean") throw new Error("Invalid effect switch.");
      design[key] = v[key];
    }
  }
  if (v.groups !== undefined) {
    const groups = v.groups as Record<string, unknown>;
    if (!groups || DESIGN_GROUPS.some((k) => typeof groups[k] !== "boolean"))
      throw new Error("Invalid effect groups.");
    design.groups = Object.fromEntries(DESIGN_GROUPS.map((k) => [k, groups[k]])) as DesignGroups;
  }
  if (v.formationWeights !== undefined) {
    // Mixtures saved before shapes were baked are shorter; missing shapes weigh zero.
    if (
      !Array.isArray(v.formationWeights) ||
      v.formationWeights.length < CUSTOM_FORMATION + 1 ||
      v.formationWeights.length > LAB_SHAPES.length
    )
      throw new Error("Invalid shape mixture.");
    const weights = LAB_SHAPES.map((_, i) =>
      number((v.formationWeights as unknown[])[i] ?? 0, 0, 1),
    );
    const total = weights.reduce((a, b) => a + b, 0);
    if (total < 0.001) throw new Error("Empty shape mixture.");
    design.formationWeights = weights.map((n) => n / total);
  }
  if (v.palette != null) {
    if (
      !Array.isArray(v.palette) ||
      v.palette.length < 1 ||
      v.palette.length > 6 ||
      v.palette.some((color) => typeof color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(color))
    )
      throw new Error("Invalid design palette.");
    design.palette = [...v.palette];
  }
  if (v.geometry != null) design.geometry = parseGeometry(v.geometry);
  if (formation === CUSTOM_FORMATION && !design.geometry)
    throw new Error("Custom shapes need geometry.");
  return design;
}
export const DESIGN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    palette: {
      anyOf: [
        { type: "null" },
        {
          type: "array",
          minItems: 1,
          maxItems: 6,
          items: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
        },
      ],
    },
    geometry: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          properties: { x: { type: "string" }, y: { type: "string" }, z: { type: "string" } },
          required: ["x", "y", "z"],
        },
      ],
    },
    name: { type: "string" },
    description: { type: "string" },
    formation: { type: "integer", minimum: 0, maximum: LAB_SHAPES.length - 1 },
    view: { type: "array", items: { type: "number" }, minItems: 4, maxItems: 4 },
    settings: {
      type: "object",
      additionalProperties: false,
      properties: Object.fromEntries(
        Object.entries(DESIGN_RANGES).map(([k, [minimum, maximum]]) => [
          k,
          { type: "number", minimum, maximum },
        ]),
      ),
      required: Object.keys(DESIGN_RANGES),
    },
    groups: {
      type: "object",
      additionalProperties: false,
      properties: Object.fromEntries(DESIGN_GROUPS.map((k) => [k, { type: "boolean" }])),
      required: [...DESIGN_GROUPS],
    },
  },
  required: [
    "name",
    "description",
    "formation",
    "view",
    "settings",
    "groups",
    "geometry",
    "palette",
  ],
};

export const DESIGN_STORAGE = "particles-designer.slots.v1";
export type UserSlots = {
  version: 1;
  presets: Record<string, SavedDesign>;
  shapes: Record<string, SavedShape>;
};
const SLOT_KEY = /^(?:[0-9]|[1-5][0-9]|6[0-3])$/;
export type SlotKind = keyof Omit<UserSlots, "version">;
/** Validates one saved slot (throws on invalid data). */
export function parseSlotItem(kind: "presets", key: string, value: unknown): SavedDesign;
export function parseSlotItem(kind: "shapes", key: string, value: unknown): SavedShape;
export function parseSlotItem(
  kind: SlotKind,
  key: string,
  value: unknown,
): SavedDesign | SavedShape;
export function parseSlotItem(kind: SlotKind, key: string, value: unknown) {
  if (!SLOT_KEY.test(key)) throw new Error("Invalid slot.");
  if (kind === "presets") return { ...parseDesign(value), id: `user-${key}` };
  const shape = value as SavedShape;
  const parsed = parseDesign({
    ...shape,
    description: "Saved shape",
    view: [0, 0, 0, 4.2],
    settings: shape.settings ?? {},
  });
  return {
    geometry: parsed.geometry,
    name: parsed.name,
    formation: parsed.formation,
    settings: parsed.settings,
    formationWeights: parsed.formationWeights,
  };
}
/** Validates a whole saved library (browser storage or the dev-server file). */
export function parseUserSlots(raw: unknown): UserSlots {
  const empty: UserSlots = { version: 1, presets: {}, shapes: {} };
  const data = raw as Partial<Record<SlotKind, Record<string, unknown>>> & { version?: unknown };
  if (data?.version !== 1) throw new Error("Unsupported Designer library version.");
  for (const [key, value] of Object.entries(data.presets ?? {}))
    empty.presets[key] = parseSlotItem("presets", key, value);
  for (const [key, value] of Object.entries(data.shapes ?? {}))
    empty.shapes[key] = parseSlotItem("shapes", key, value);
  return empty;
}
export function loadUserSlots(storage: Pick<Storage, "getItem">): UserSlots {
  const text = storage.getItem(DESIGN_STORAGE);
  return text ? parseUserSlots(JSON.parse(text)) : { version: 1, presets: {}, shapes: {} };
}
