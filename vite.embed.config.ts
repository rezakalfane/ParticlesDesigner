import { resolve } from "node:path";
import { defineConfig } from "vite";

/**
 * The embed kit (src/embed) as a library in dist-embed/:
 *  - particles-designer.js       ES module (import { ParticleField } from …)
 *  - particles-designer.iife.js  classic <script>, global `ParticlesDesigner`
 * Both register <particle-field>. Types: dist-embed/types (tsconfig.embed.json).
 */
export default defineConfig({
  publicDir: false,
  build: {
    outDir: "dist-embed",
    target: "es2022",
    lib: {
      entry: resolve(__dirname, "src/embed/index.ts"),
      name: "ParticlesDesigner",
      formats: ["es", "iife"],
      fileName: (format) =>
        format === "es" ? "particles-designer.js" : "particles-designer.iife.js",
    },
  },
});
