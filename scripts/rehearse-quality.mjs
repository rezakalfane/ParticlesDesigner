/**
 * Adaptive-quality rehearsal in a real browser:
 *  - a slow device (Chrome's software renderer, 200k particles) makes quality: "auto" lower the
 *    level, the particle count and the canvas size, and frames get faster;
 *  - "high" never changes; "low"/"medium" pin their level; setQuality() switches at run time;
 *  - <particle-field quality> follows its attribute and reports "particle-field-quality";
 *  - without WebGL2, `supported` is false, onError fires once and the poster shows.
 * Needs `npm run build:embed` and `npm run dev` (or DESIGNER_URL). Takes about a minute.
 */
import { chromium } from "playwright";
import assert from "node:assert/strict";
const base = process.env.DESIGNER_URL ?? "http://localhost:5180/";
const kit = new URL("dist-embed/particles-designer.js", base).href;
const gpuArgs = ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"];
const softwareArgs = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"];

/** A blank same-origin page with the kit imported as window.kit. */
async function openPage(browser, init) {
  const context = await browser.newContext({ viewport: { width: 900, height: 560 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  if (init) await page.addInitScript(init);
  await page.goto(new URL("examples/index.html", base).href);
  await page.setContent(
    `<style>body{margin:0}#host{width:640px;height:360px}</style><div id="host"></div>`,
  );
  await page.evaluate(async (url) => {
    window.kit = await import(url);
    window.fps = (ms) =>
      new Promise((resolve) => {
        let frames = 0;
        const start = performance.now();
        const tick = (now) => {
          frames++;
          if (now - start >= ms) resolve(frames / ((now - start) / 1000));
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    // Every factory look at the densest setting: the heaviest thing the kit can be asked to draw.
    const galaxy = kit.LOOKS.find((look) => look.id === "galaxy-drift");
    window.heavy = { ...galaxy, settings: { ...galaxy.settings, "Particle density": 2 } };
  }, kit);
  return { context, page, errors };
}

const gpu = await chromium.launch({ headless: true, args: gpuArgs });
const software = await chromium.launch({ headless: true, args: softwareArgs });
try {
  // 1. A slow device: auto quality adapts and the field gets faster.
  {
    const { context, page, errors } = await openPage(software);
    const start = await page.evaluate(async () => {
      window.levels = [];
      window.field = new kit.ParticleField("#host", {
        look: heavy,
        pixelRatio: 1,
        onQualityChange: (level) => levels.push(level),
      });
      const before = await fps(2500);
      return { fps: before, particles: field.particleCount, width: field.canvas.width };
    });
    const deadline = Date.now() + 70_000;
    let level = 0;
    while (Date.now() < deadline && level < 2) {
      await page.waitForTimeout(1000);
      level = await page.evaluate(() => field.qualityLevel);
    }
    const after = await page.evaluate(async () => {
      await new Promise((r) => setTimeout(r, 1500));
      const rate = await fps(3000);
      return {
        fps: rate,
        level: field.qualityLevel,
        particles: field.particleCount,
        width: field.canvas.width,
        levels,
      };
    });
    console.log(
      `  slow device: ${start.fps.toFixed(1)} → ${after.fps.toFixed(1)} fps, level ${after.level},` +
        ` ${start.particles} → ${after.particles} particles, canvas ${start.width} → ${after.width}px, changes ${after.levels}`,
    );
    assert(after.level >= 1, "auto quality lowered the level on a slow device");
    assert(after.particles < start.particles, "fewer particles are drawn");
    assert(after.fps > start.fps * 1.25, `frames got faster (${start.fps} → ${after.fps})`);
    assert.deepEqual(errors, []);
    await context.close();
  }

  // 2. Pinned levels and run-time switching (on the real GPU).
  {
    const { context, page, errors } = await openPage(gpu);
    const result = await page.evaluate(async () => {
      const out = {};
      const make = (quality) => {
        document.querySelector("#host").replaceChildren();
        return new kit.ParticleField("#host", { look: "galaxy-drift", quality, pixelRatio: 1 });
      };
      const settle = () => new Promise((r) => setTimeout(r, 600));
      const high = make("high");
      await settle();
      out.high = {
        level: high.qualityLevel,
        particles: high.particleCount,
        width: high.canvas.width,
      };
      high.destroy();
      const low = make("low");
      await settle();
      out.low = { level: low.qualityLevel, particles: low.particleCount, width: low.canvas.width };
      low.setQuality("medium");
      await settle();
      out.medium = {
        level: low.qualityLevel,
        particles: low.particleCount,
        width: low.canvas.width,
      };
      low.setQuality("high");
      await settle();
      out.back = { level: low.qualityLevel, particles: low.particleCount, width: low.canvas.width };
      low.destroy();
      // A fast device under auto stays at full quality for a while.
      const auto = make("auto");
      await new Promise((r) => setTimeout(r, 6000));
      out.auto = { level: auto.qualityLevel, particles: auto.particleCount };
      auto.destroy();
      return out;
    });
    console.log("  pinned levels:", JSON.stringify(result));
    assert.equal(result.high.level, 0);
    assert.equal(result.low.level, 4);
    assert(result.low.particles < result.high.particles * 0.4, "low draws far fewer particles");
    assert(result.low.width < result.high.width, "low renders at a lower resolution");
    assert.equal(result.medium.level, 2);
    assert(
      result.medium.particles < result.high.particles &&
        result.medium.particles > result.low.particles,
    );
    assert.equal(result.back.level, 0);
    assert.equal(result.back.particles, result.high.particles, "high restores the authored count");
    assert.equal(result.back.width, result.high.width);
    assert.equal(result.auto.level, 0, "a fast device keeps full quality");
    assert.deepEqual(errors, []);
    await context.close();
  }

  // 3. The element: attribute, events.
  {
    const { context, page, errors } = await openPage(gpu);
    const result = await page.evaluate(async () => {
      document.body.innerHTML =
        '<particle-field id="pf" look="deep-sea" quality="low" style="width:400px;height:240px"></particle-field>';
      const element = document.querySelector("#pf");
      await new Promise((r) => setTimeout(r, 800));
      const events = [];
      element.addEventListener("particle-field-quality", (e) => events.push(e.detail));
      const before = element.field.qualityLevel;
      element.setAttribute("quality", "high");
      await new Promise((r) => setTimeout(r, 400));
      return { before, after: element.field.qualityLevel, events };
    });
    console.log("  element:", JSON.stringify(result));
    assert.equal(result.before, 4);
    assert.equal(result.after, 0);
    assert.deepEqual(result.events, [0], "quality change is announced");
    assert.deepEqual(errors, []);
    await context.close();
  }

  // 4. No WebGL2: reported once, poster shows, nothing throws, no busy loop.
  {
    const { context, page, errors } = await openPage(gpu, () => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
        return type === "webgl2" ? null : original.call(this, type, ...rest);
      };
    });
    const poster =
      "data:image/svg+xml;utf8," +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="#123456"/></svg>',
      );
    const result = await page.evaluate(async (posterUrl) => {
      const errorsSeen = [];
      const field = new kit.ParticleField("#host", {
        look: "deep-sea",
        poster: posterUrl,
        onError: (e) => errorsSeen.push(e.message),
      });
      await new Promise((r) => setTimeout(r, 500));
      const element = document.createElement("particle-field");
      element.setAttribute("poster", posterUrl);
      let elementErrors = 0;
      element.addEventListener("particle-field-error", () => elementErrors++);
      document.body.append(element);
      await new Promise((r) => setTimeout(r, 500));
      return {
        supported: field.supported,
        errorsSeen,
        background: field.canvas.style.backgroundImage.slice(0, 30),
        particles: field.particleCount,
        elementSupported: element.field?.supported,
        elementErrors,
      };
    }, poster);
    console.log("  no WebGL2:", JSON.stringify(result));
    assert.equal(result.supported, false);
    assert.equal(result.errorsSeen.length, 1);
    assert.match(result.errorsSeen[0], /WebGL2/);
    assert.match(result.background, /^url\("data:image\/svg/);
    assert.equal(result.particles, 0);
    assert.equal(result.elementSupported, false);
    assert.equal(result.elementErrors, 1);
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log("Adaptive quality rehearsal passed.");
} finally {
  await gpu.close();
  await software.close();
}
