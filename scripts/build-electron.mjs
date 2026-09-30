// Bundles electron/main.ts (+ host and server handlers) into dist-electron/main.mjs.
import { build } from "esbuild";

await build({
  entryPoints: ["electron/main.ts"],
  outfile: "dist-electron/main.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  external: ["electron"],
  logLevel: "info",
});
