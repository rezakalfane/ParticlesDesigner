/** Paste-ready HTML for a design (used by the Designer's Embed dialog). Pure. */
import type { Look } from "./look";

/** The design as a portable JSON document (no runtime id; view rounded to 0.01). */
export function lookJSON(look: Look): string {
  const { id: _id, ...design } = look;
  const view = design.view.map((n) => Math.round(n * 100) / 100) as Look["view"];
  return JSON.stringify({ ...design, view }, null, 2);
}

/** A <particle-field> with the design inline; "</" is escaped so the JSON cannot close the script. */
export function embedSnippet(look: Look, src = "particles-designer.js"): string {
  const json = lookJSON(look).replace(/<\//g, "<\\/").replace(/\n/g, "\n    ");
  return `<!-- Particles Designer · ${look.name.replace(/--/g, "—")} -->
<script type="module" src="${src}"></script>
<particle-field style="width: 100%; height: 480px" interactive>
  <script type="application/json">
    ${json}
  </script>
</particle-field>
`;
}
