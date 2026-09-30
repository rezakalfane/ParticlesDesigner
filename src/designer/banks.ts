import { BAKED_SHAPE_SLOTS } from "./bakedLibrary";
import { PARTICLE_FACTORY_SLOTS } from "../looks/particleFactory";
import { BAKED_FORMATION_START, BAKED_SHAPES } from "../engine/bakedShapes";
export const LAB_BANK_COUNT = 4;
export const LAB_BANK_SIZE = 16;
export function makeLabBanks<T>(items: readonly T[]): (T | null)[][] {
  if (items.length > LAB_BANK_COUNT * LAB_BANK_SIZE)
    throw new Error("Particle lab bank capacity exceeded");
  return Array.from({ length: LAB_BANK_COUNT }, (_, bank) =>
    Array.from({ length: LAB_BANK_SIZE }, (_, slot) => items[bank * LAB_BANK_SIZE + slot] ?? null),
  );
}
export const LAB_SHAPES = [
  "Vortex",
  "Orbital",
  "Tidal",
  "Helix",
  "Galaxy",
  "Trefoil",
  "Möbius",
  "Bloom",
  "Cage",
  "Shell",
  "Veil",
  "Lattice",
  "Starburst",
  "Aurora",
  "Jellyfish",
  "Dunes",
  "Solar system",
  "Earth & Moon",
  "Jovian giant",
  "Saturn",
  "Black hole",
  "Cosmic lotus",
  "Celestial eye",
  "Astral portal",
  "Eclipse crown",
  "Aether storm",
  "Liquid mercury",
  "Astral flame",
  "Silken currents",
  "Flowing dunes",
  "Custom field",
  ...BAKED_SHAPES.map((shape) => shape.name),
].map((name, formation) => ({ name, formation }));
/** Baked slots (saved designs promoted by `npm run designer:bake`) replace factory slots. */
function withBakedSlots<T, B>(banks: (T | null)[][], baked: Readonly<Record<number, B>>) {
  const result: (T | B | null)[][] = banks.map((bank) => [...bank]);
  for (const [key, item] of Object.entries(baked))
    result[Math.floor(Number(key) / LAB_BANK_SIZE)][Number(key) % LAB_BANK_SIZE] = item;
  return result;
}
/** Factory shape buttons cover the built-in shapes; baked shapes appear through their slots. */
export const SHAPE_BANKS = withBakedSlots(
  makeLabBanks(LAB_SHAPES.slice(0, BAKED_FORMATION_START)),
  BAKED_SHAPE_SLOTS,
);
/** Preset banks are the factory catalog (src/looks/particleFactory.ts). */
export const PRESET_BANKS = makeLabBanks(PARTICLE_FACTORY_SLOTS);
