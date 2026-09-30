import { PARTICLE_LOOKS, type ParticleLook } from "../looks/particleLooks";
import { PARTICLE_STUDIES } from "../looks/particleStudies";
export type LabPreset = ParticleLook;
/** The Designer's factory looks: the shared catalog, in bank order before bakes. */
export const LAB_PRESETS: readonly LabPreset[] = [...PARTICLE_LOOKS, ...PARTICLE_STUDIES];
