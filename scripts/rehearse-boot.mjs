/**
 * Boot rehearsal: reloading the Designer never shows unstyled HTML. Samples frames
 * from the first moments of a hard reload (cache off) and requires every frame to be
 * dark (an unstyled page is white), the boot splash to name the app, and the splash
 * to be gone once the field is drawing. Needs `npm run dev` (or DESIGNER_URL).
 * BOOT_EXPECT_SPLASH=0 only measures (used to show the flash before the splash existed).
 */
import { chromium } from "playwright";
import assert from "node:assert/strict";
const url = process.env.DESIGNER_URL ?? "http://localhost:5180/";
const expectSplash = process.env.BOOT_EXPECT_SPLASH !== "0";
const browser = await chromium.launch({
  headless: true,
  args: process.env.REHEARSE_SOFTWARE_GL
    ? []
    : ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
try {
  const context = await browser.newContext({ viewport: { width: 1000, height: 640 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => !/Web MIDI/.test(e.message) && errors.push(e.message));
  await page.goto(url);
  await page.waitForTimeout(1500);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  // Mean brightness (0..255) of a small JPEG of the viewport, per frame.
  const probe = await context.newPage();
  const brightness = async (buffer) =>
    probe.evaluate(async (b64) => {
      const image = new Image();
      image.src = `data:image/jpeg;base64,${b64}`;
      await image.decode();
      const c = document.createElement("canvas");
      c.width = 32;
      c.height = 20;
      const x = c.getContext("2d");
      x.drawImage(image, 0, 0, 32, 20);
      const d = x.getImageData(0, 0, 32, 20).data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum += (d[i] + d[i + 1] + d[i + 2]) / 3;
      return sum / (d.length / 4);
    }, buffer.toString("base64"));
  const frames = [];
  const navigation = page.reload({ waitUntil: "commit" }).catch(() => {});
  const t0 = Date.now();
  while (Date.now() - t0 < 2600) {
    const shot = await page.screenshot({ type: "jpeg", quality: 40 }).catch(() => null);
    if (shot) frames.push({ at: Date.now() - t0, luma: await brightness(shot) });
  }
  await navigation;
  const bright = frames.filter((f) => f.luma > 120);
  console.log(
    `  ${frames.length} frames sampled; brightest ${Math.max(...frames.map((f) => f.luma)).toFixed(0)}/255` +
      (bright.length
        ? `; ${bright.length} unstyled-looking frame(s) at ${bright.map((f) => f.at + "ms").join(", ")}`
        : ""),
  );
  if (expectSplash) {
    assert.deepEqual(bright, [], "no white/unstyled frames while loading");
    // The splash names the app, and is removed once the field draws.
    await page.reload({ waitUntil: "commit" });
    await page
      .waitForSelector("#boot-splash", { state: "attached", timeout: 3000 })
      .catch(() => {});
    await page.waitForFunction(() => !document.getElementById("boot-splash"), null, {
      timeout: 15000,
    });
    assert.match(await page.evaluate(() => document.title), /Particles Designer/);
    const lit = await page.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = 64;
      c.height = 36;
      const x = c.getContext("2d");
      x.drawImage(document.getElementById("field"), 0, 0, 64, 36);
      const d = x.getImageData(0, 0, 64, 36).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 45) n++;
      return n / 2304;
    });
    assert(lit > 0.01, `the field is drawing once the splash is gone (lit ${lit})`);
    assert.deepEqual(errors, [], "page errors");
    console.log("Boot rehearsal passed: no unstyled frames, splash removed, field drawing.");
  }
} finally {
  await browser.close();
}
