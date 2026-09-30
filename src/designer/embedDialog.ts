/** Embed dialog: paste-ready <particle-field> snippet and design JSON download. */
import type { SavedDesign } from "./design";
import { embedSnippet, lookJSON } from "../embed/snippet";

export function createEmbedDialog() {
  const dialog = document.createElement("dialog");
  dialog.className = "slot-dialog embed-dialog";
  dialog.setAttribute("aria-labelledby", "embed-dialog-title");
  dialog.innerHTML = `<form method="dialog">
    <h2 id="embed-dialog-title">Embed this look</h2>
    <p>Paste into any page: the kit loads from the jsDelivr CDN. Or download the design and load it with
    <code>&lt;particle-field src="…"&gt;</code> or <code>fetchLook()</code>.</p>
    <textarea readonly spellcheck="false" aria-label="Embed snippet"></textarea>
    <div class="slot-dialog-actions">
      <span class="embed-status" role="status"></span>
      <button type="button" data-action="download">Download JSON</button>
      <button type="button" data-action="copy">Copy snippet</button>
      <button type="submit">Close</button>
    </div>
  </form>`;
  document.body.append(dialog);
  const text = dialog.querySelector("textarea")!;
  const status = dialog.querySelector<HTMLElement>(".embed-status")!;
  let design: SavedDesign | undefined;
  dialog.querySelector<HTMLButtonElement>('[data-action="copy"]')!.onclick = async () => {
    try {
      await navigator.clipboard.writeText(text.value);
      status.textContent = "Copied";
    } catch {
      text.select();
      status.textContent = "Press ⌘C to copy";
    }
  };
  dialog.querySelector<HTMLButtonElement>('[data-action="download"]')!.onclick = () => {
    if (!design) return;
    const url = URL.createObjectURL(new Blob([lookJSON(design)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${
      design.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "particle-look"
    }.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = "Downloaded";
  };
  return (current: SavedDesign) => {
    design = current;
    text.value = embedSnippet(current);
    status.textContent = "";
    dialog.showModal();
    text.scrollTop = 0;
  };
}
