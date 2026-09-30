/**
 * Static site for GitHub Pages (or any static host), in dist/:
 *   /             the Designer (static build: no AI generation; slots stay in the browser)
 *   /examples/    embed examples (unchanged, they load ../dist-embed/)
 *   /dist-embed/  the embed kit
 * Run after `npm run build` and `npm run build:embed` (see `npm run build:site`).
 */
import { cpSync, existsSync, writeFileSync } from "node:fs";

for (const required of ["dist/index.html", "dist-embed/particles-designer.js"])
  if (!existsSync(required))
    throw new Error(`Missing ${required}: build the app and the kit first.`);
cpSync("examples", "dist/examples", { recursive: true });
cpSync("dist-embed", "dist/dist-embed", { recursive: true });
// Serve files as-is (no Jekyll processing on classic GitHub Pages).
writeFileSync("dist/.nojekyll", "");
console.log("Site ready in dist/: Designer, examples/, dist-embed/.");
