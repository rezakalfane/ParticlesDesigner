/**
 * Embed kit rehearsal: every example page boots without errors and draws light,
 * look switching (factory ↔ custom formula) works, the web component follows its
 * attributes, destroy() cleans up, and the Designer's Embed dialog produces a
 * snippet that renders. Needs `npm run build:embed` and `npm run dev`.
 */
import { chromium } from "playwright";
import assert from "node:assert/strict";
const base = process.env.DESIGNER_URL ?? "http://localhost:5180/";
// Real GPU (Metal/ANGLE on macOS): headless Chrome otherwise emulates WebGL on the
// CPU (SwiftShader), pegging every core and slowing frames to ~1 fps.
// REHEARSE_SOFTWARE_GL=1 keeps software rendering (e.g. CI without a GPU).
const browser = await chromium.launch({
  headless: true,
  args: process.env.REHEARSE_SOFTWARE_GL
    ? []
    : ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
/** Lit pixel share of a WebGL canvas (preserveDrawingBuffer keeps the last frame readable). */
const litShare = (page, selector, shadow = false) =>
  page.evaluate(
    ([selector, shadow]) => {
      const host = document.querySelector(selector);
      const canvas = shadow
        ? host.shadowRoot.querySelector("canvas")
        : host.tagName === "CANVAS"
          ? host
          : host.querySelector("canvas");
      const probe = document.createElement("canvas");
      probe.width = 160;
      probe.height = 90;
      const ctx = probe.getContext("2d");
      ctx.drawImage(canvas, 0, 0, 160, 90);
      const data = ctx.getImageData(0, 0, 160, 90).data;
      let lit = 0;
      for (let i = 0; i < data.length; i += 4) if (data[i] + data[i + 1] + data[i + 2] > 45) lit++;
      return lit / (160 * 90);
    },
    [selector, shadow],
  );
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => !/Web MIDI/.test(e.message) && errors.push(e.message));
  page.on(
    "console",
    (m) => m.type() === "error" && !/Web MIDI/.test(m.text()) && errors.push(m.text()),
  );
  const visit = async (path, wait = 1500) => {
    errors.length = 0;
    await page.goto(new URL(path, base).href);
    // Pages that create `window.field` may compile a custom shader first (slow in software GL).
    if (path.startsWith("examples/") && !/index|web-component|hero/.test(path))
      await page.waitForFunction(() => window.field, null, { timeout: 30000 });
    await page.waitForTimeout(wait);
  };

  for (const [path, selector, shadow] of [
    ["examples/basic.html", "#particles"],
    ["examples/script-tag.html", "#particles"],
    ["examples/gallery.html", "#particles"],
    ["examples/audio.html", "#particles"],
    ["examples/custom-design.html", "#particles"],
    ["examples/hero.html", "particle-field", true],
  ]) {
    await visit(path);
    const lit = await litShare(page, selector, shadow);
    assert.deepEqual(errors, [], `${path} errors`);
    assert(lit > 0.01, `${path} draws light (lit ${lit.toFixed(3)})`);
    console.log(`  ✓ ${path} (lit ${(lit * 100).toFixed(1)}%)`);
  }

  // Web component: three fields (attribute, src, inline JSON), all lit; attribute change transitions.
  await visit("examples/web-component.html", 2000);
  const fields = await page.$$eval("particle-field", (all) => all.map((f) => Boolean(f.field)));
  assert.deepEqual(fields, [true, true, true], "three <particle-field> instances");
  for (const i of [1, 2, 3]) {
    const lit = await litShare(page, `particle-field:nth-of-type(${i})`, true);
    assert(lit > 0.005, `web component ${i} lit ${lit}`);
  }
  assert.equal(await page.$eval("particle-field", (f) => f.field.look.id), "neon-weave");
  await page.click('[data-look="ember-shell"]');
  await page.waitForTimeout(300);
  assert.equal(await page.$eval("particle-field", (f) => f.field.look.id), "ember-shell");
  assert.equal(
    await page.$$eval("particle-field", (all) => all[1].field.look.name),
    "Lissajous bloom",
  );
  assert.equal(await page.$$eval("particle-field", (all) => all[2].field.look.name), "Rose tide");
  assert.deepEqual(errors, [], "web component errors");
  console.log("  ✓ examples/web-component.html (attribute, src, inline JSON, look change)");

  // Custom formula ↔ factory switching, destroy.
  await visit("examples/custom-design.html");
  await page.click("#factory");
  await page.waitForTimeout(2200);
  assert.equal(await page.evaluate(() => window.field.look.id), "deep-sea");
  await page.click("#custom");
  await page.waitForTimeout(2200);
  assert.equal(await page.evaluate(() => window.field.look.name), "Lissajous bloom");
  assert((await litShare(page, "#particles")) > 0.01, "custom formula lit after switching back");
  await page.evaluate(() => window.field.destroy());
  assert.equal(
    await page.$$eval("#particles canvas", (c) => c.length),
    0,
    "destroy removes its canvas",
  );
  assert.deepEqual(errors, [], "custom design errors");
  console.log("  ✓ custom formula ↔ factory transitions, destroy()");

  // Manual audio levels drive the field.
  await visit("examples/audio.html");
  await page.click('[data-audio="manual"]');
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => window.field.audioStatus), "Manual audio levels");
  // Audio really modulates: demo pulse + audioDepth drives the low band; without the override
  // Electric bloom (Audio depth 0) stays still.
  await page.click('[data-audio="demo"]');
  await page.waitForTimeout(1200);
  const driven = await page.evaluate(async () => {
    let peak = 0;
    for (let i = 0; i < 30; i++) {
      peak = Math.max(peak, window.field.lastVisible.low);
      await new Promise((r) => setTimeout(r, 40));
    }
    window.field.audioDepth = undefined;
    await new Promise((r) => setTimeout(r, 1500));
    return { peak, after: window.field.lastVisible.low };
  });
  assert(driven.peak > 0.1, `audioDepth drives the field (peak low ${driven.peak})`);
  assert(driven.after < 0.01, `look's own depth 0 is silent (low ${driven.after})`);
  console.log("  ✓ manual audio levels; demo audio drives the field only with audioDepth");

  // Designer Embed dialog → snippet renders in a blank page.
  await visit("", 1500);
  await page.click("#embed");
  const snippet = await page.$eval(".embed-dialog textarea", (t) => t.value);
  assert.match(snippet, /<particle-field[^>]*>\s*<script type="application\/json">/);
  await page.keyboard.press("Escape");
  // A fresh page: setContent would keep the Designer's scripts running.
  const blank = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  blank.on("pageerror", (e) => errors.push(e.message));
  errors.length = 0;
  await blank.goto(new URL("examples/index.html", base).href); // same origin, no scripts
  await blank.setContent(
    // The snippet loads the kit from the CDN; test the local build instead.
    snippet.replace(
      /src="https:\/\/cdn\.jsdelivr\.net\/[^"]+\/particles-designer\.js"/,
      `src="${new URL("dist-embed/particles-designer.js", base).href}"`,
    ),
  );
  await blank.waitForFunction(() => document.querySelector("particle-field")?.field);
  await blank.waitForTimeout(1500);
  const lit = await litShare(blank, "particle-field", true);
  assert(lit > 0.01, `Designer snippet renders (lit ${lit})`);
  assert.deepEqual(errors, [], "snippet errors");
  console.log("  ✓ Designer Embed snippet renders standalone");
  console.log("Embed kit rehearsal passed.");
} finally {
  await browser.close();
}
