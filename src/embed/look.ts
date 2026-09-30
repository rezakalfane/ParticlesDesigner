/**
 * Look resolution and look → runtime state, mirroring the Designer's
 * `applyLabPreset` so an embedded field renders a look exactly as the Designer does.
 * Pure: no DOM, WebGL or audio.
 */
import { parseDesign, type SavedDesign } from "../designer/design";
import { PARTICLE_FACTORY_SLOTS } from "../looks/particleFactory";
import { PARTICLE_LOOK_GROUPS, type ParticleLook } from "../looks/particleLooks";
import { CUSTOM_FORMATION, type CustomGeometry } from "../engine/customGeometry";
import type { ParticleDrive } from "../engine/renderer";

/** A look as exported by the Designer (Embed → Download JSON) or a factory look. */
export type Look = SavedDesign;
/** A factory look id or name, a Look object, or its JSON text. */
export type LookInput = string | Look | ParticleLook;
export type LookGroups = Record<(typeof PARTICLE_LOOK_GROUPS)[number], boolean>;

/** Every factory look in bank order (Bank 1 slot 1 first). */
export const LOOKS: readonly Look[] = PARTICLE_FACTORY_SLOTS.filter(
  (look): look is ParticleLook => look !== null,
);
export const DEFAULT_LOOK = "deep-sea";

/** Resolves a factory id/name, a JSON string or an object into a validated Look. */
export function resolveLook(input: LookInput): Look {
  if (typeof input === "string") {
    const text = input.trim();
    if (text.startsWith("{")) return parseDesign(JSON.parse(text));
    const key = text.toLowerCase();
    const found = LOOKS.find((look) => look.id === text || look.name.toLowerCase() === key);
    if (!found) throw new Error(`Unknown particle look "${input}". See LOOKS for available ids.`);
    return found;
  }
  return parseDesign(input);
}

/** Fetches and validates a design JSON file exported by the Designer. */
export async function fetchLook(url: string | URL, init?: RequestInit): Promise<Look> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`Could not load particle look ${url} (${response.status}).`);
  return parseDesign(await response.json());
}

/**
 * The Designer's slider start values; a look's `settings` override them, and
 * Attraction, Audio depth and the rotations default to 0 when a look omits them.
 */
const SETTING_DEFAULTS: Record<string, number> = {
  Expansion: 0.65,
  "Particle dispersion": 0,
  Turbulence: 0.25,
  "Turbulence scale": 1,
  "Turbulence density": 1,
  Light: 0.55,
  "Halo glow": 0.4,
  "Depth softness": 0.35,
  "Focus plane": 0.5,
  "Ribbon brightness": 0.75,
  "Ribbon length": 0.75,
  "Trail head size": 1,
  "Trail thickness": 1,
  Shockwave: 0.7,
  "Particle density": 0.44,
  "Particle thickness": 0.25,
  Implosion: 0.9,
  Explosion: 0.65,
  "Recovery time": 0.45,
  Attraction: 0,
  "Attractor separation": 0.65,
  "Attractor orbit": 0.3,
  "Color drift": 0,
  "Color variety": 1,
  Motion: 0.45,
  "Rotation X": 0,
  "Rotation Y": 0,
  "Rotation Z": 0,
  "Audio depth": 0,
};
const DRIVE_SETTINGS: Record<string, keyof ParticleDrive> = {
  Expansion: "spread",
  "Particle dispersion": "dispersion",
  Turbulence: "turbulence",
  "Turbulence scale": "turbulenceScale",
  "Turbulence density": "turbulenceDensity",
  Light: "glow",
  "Halo glow": "halo",
  "Depth softness": "softness",
  "Focus plane": "focus",
  "Ribbon brightness": "trail",
  "Ribbon length": "ribbonLength",
  "Trail head size": "headSize",
  "Trail thickness": "trailWidth",
  Shockwave: "shock",
  "Particle density": "density",
  "Particle thickness": "thickness",
  Attraction: "attraction",
  "Attractor separation": "separation",
  "Color drift": "hue",
  "Color variety": "colorVariety",
};

/** Everything a runtime needs to play a look. */
export interface LookState {
  /** Static drive values (settings, view, palette); animated fields are left to the runtime. */
  drive: Partial<ParticleDrive>;
  formation: number;
  formationWeights?: number[];
  geometry?: CustomGeometry;
  groups: LookGroups;
  cycleAudio: boolean;
  /** Motion speed, audio reactivity, attractor orbit and auto-rotation rates (0..1). */
  speed: number;
  reactivity: number;
  orbit: number;
  rotation: { x: number; y: number; z: number };
  cycle: { implosion: number; explosion: number; recovery: number };
}

export function lookState(look: Look): LookState {
  const settings = { ...SETTING_DEFAULTS, ...look.settings };
  const drive: Partial<ParticleDrive> = {
    yaw: (look.view[0] * Math.PI) / 180,
    pitch: (look.view[1] * Math.PI) / 180,
    roll: (look.view[2] * Math.PI) / 180,
    distance: look.view[3],
    palette: look.palette?.flatMap((color) =>
      [1, 3, 5].map((at) => parseInt(color.slice(at, at + 2), 16) / 255),
    ),
  };
  for (const [name, key] of Object.entries(DRIVE_SETTINGS))
    (drive as Record<string, unknown>)[key] = settings[name];
  const groups = Object.fromEntries(
    PARTICLE_LOOK_GROUPS.map((group) => [
      group,
      look.groups?.[group] ??
        (group === "shock"
          ? (look.shockEnabled ?? false)
          : group === "audio"
            ? (look.audioEnabled ?? true)
            : group === "attractors"
              ? (look.attractorsEnabled ?? true)
              : true),
    ]),
  ) as LookGroups;
  return {
    drive,
    formation: look.formation,
    formationWeights: look.formationWeights,
    geometry: look.formation === CUSTOM_FORMATION ? look.geometry : undefined,
    groups,
    cycleAudio: look.cycleAudio ?? false,
    speed: settings.Motion,
    reactivity: settings["Audio depth"],
    orbit: settings["Attractor orbit"],
    rotation: { x: settings["Rotation X"], y: settings["Rotation Y"], z: settings["Rotation Z"] },
    cycle: {
      implosion: settings.Implosion,
      explosion: settings.Explosion,
      recovery: settings["Recovery time"],
    },
  };
}
