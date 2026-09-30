/**
 * Particles Designer embed kit: play Designer looks in any web page.
 *
 *   import { ParticleField } from "particles-designer";
 *   const field = new ParticleField("#hero", { look: "deep-sea", audio: "demo" });
 *
 * Importing also registers the <particle-field> element.
 */
import { defineParticleFieldElement } from "./element";

export { ParticleField, type ParticleFieldOptions } from "./field";
export { ParticleFieldElement, defineParticleFieldElement } from "./element";
export { LOOKS, DEFAULT_LOOK, resolveLook, fetchLook, type Look, type LookInput } from "./look";
export { embedSnippet, lookJSON } from "./snippet";
export type { AudioInput, AudioLevels } from "./audio";

if (typeof customElements !== "undefined") defineParticleFieldElement();
