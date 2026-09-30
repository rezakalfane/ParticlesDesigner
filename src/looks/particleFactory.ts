import { PARTICLE_LOOKS, type ParticleLook } from "./particleLooks";
import { PARTICLE_STUDIES } from "./particleStudies";
import { BAKED_LOOK_SLOTS } from "./particleBakedLooks";

/** The factory catalog: four banks of sixteen looks. */
export const PARTICLE_FACTORY_BANK_SIZE = 16;
export const PARTICLE_FACTORY_CAPACITY = 4 * PARTICLE_FACTORY_BANK_SIZE;
/**
 * The factory catalog in slot order (index = bank * 16 + slot): the sixteen
 * looks (Bank 1), the Designer studies, then baked Designer presets
 * (`npm run designer:bake`), which replace whatever factory look held their slot.
 */
export const PARTICLE_FACTORY_SLOTS: readonly (ParticleLook | null)[] = (() => {
  const looks = [...PARTICLE_LOOKS, ...PARTICLE_STUDIES];
  if (looks.length > PARTICLE_FACTORY_CAPACITY) throw new Error("Particle factory is full");
  const slots: (ParticleLook | null)[] = Array.from(
    { length: PARTICLE_FACTORY_CAPACITY },
    (_, i) => looks[i] ?? null,
  );
  for (const [key, look] of Object.entries(BAKED_LOOK_SLOTS)) slots[Number(key)] = look;
  return slots;
})();
