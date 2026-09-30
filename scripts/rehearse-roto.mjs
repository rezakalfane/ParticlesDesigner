import { chromium } from "playwright";
import assert from "node:assert/strict";
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const input = { id: "roto-in", name: "ROTO-CONTROL", state: "connected", onmidimessage: null };
    window.rotoSent = [];
    const output = {
      id: "roto-out",
      name: "ROTO-CONTROL",
      state: "connected",
      send: (data) => window.rotoSent.push(data),
    };
    Object.defineProperty(navigator, "requestMIDIAccess", {
      value: async () => ({
        inputs: new Map([[input.id, input]]),
        outputs: new Map([[output.id, output]]),
        onstatechange: null,
      }),
    });
    window.rotoFire = (channel, cc, value) =>
      input.onmidimessage?.({ data: [0xb0 + channel - 1, cc, value] });
  });
  await page.goto(process.env.DESIGNER_URL ?? "http://localhost:5180/");
  await page.waitForFunction(() =>
    document.querySelector(".designer-roto")?.textContent.includes("connected"),
  );
  const fire = async (ch, cc, value) =>
    page.evaluate(([c, n, v]) => window.rotoFire(c, n, v), [ch, cc, value]);
  const density = page.getByRole("slider", { name: "Particle density", exact: true });
  const before = await density.inputValue();
  await fire(1, 0, 127);
  assert.equal(await density.inputValue(), before, "foreign channel ignored");
  await fire(10, 71, 127);
  await fire(10, 71, 0);
  assert.equal(
    await page.locator('.designer-roto-pages button[aria-pressed="true"]').textContent(),
    "PARTICLES",
  );
  assert.equal(await density.inputValue(), before, "page announce never changes design");
  await fire(10, 0, 100);
  await page.waitForTimeout(420);
  assert(Math.abs(Number(await density.inputValue()) - 200 / 127) < 0.011);
  await fire(10, 68, 127);
  await fire(10, 68, 0); // Undo.
  assert.equal(await density.inputValue(), before, "one hardware gesture is undoable");
  await fire(10, 69, 127);
  await fire(10, 69, 0);
  assert(Math.abs(Number(await density.inputValue()) - 200 / 127) < 0.011);
  await fire(10, 67, 127);
  assert.equal(await page.locator("#field").evaluate((e) => e.style.visibility), "hidden");
  await page.waitForTimeout(120);
  await fire(10, 67, 0);
  assert.equal(await page.locator("#field").evaluate((e) => e.style.visibility), "visible");
  // Browse empty preset bank/slot, then Apply: reject, never save/open a dialog.
  await fire(9, 4, 127);
  await fire(9, 5, 127);
  const stable = await density.inputValue();
  await fire(9, 64, 127);
  await fire(9, 64, 0);
  assert.equal(await density.inputValue(), stable);
  assert.match(await page.locator("#design-status").textContent(), /Empty slot/);
  // Back to first authored look and explicit Apply.
  await page.waitForTimeout(120);
  await fire(9, 4, 0);
  await fire(9, 5, 0);
  assert.equal(await density.inputValue(), stable);
  await fire(9, 64, 127);
  await fire(9, 64, 0);
  assert.notEqual(await density.inputValue(), stable);
  await page.waitForTimeout(200);
  assert(
    await page.evaluate(
      () =>
        window.rotoSent.length > 0 &&
        window.rotoSent.every((m) => [0xb8, 0xb9, 0xba].includes(m[0])),
    ),
  );
  await page.locator(".designer-roto").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "/tmp/designer-roto.png" });
  assert.deepEqual(errors, []);
  console.log(
    "Designer ROTO: channel isolation, page CC, control write, undo/redo, blackout, browse/apply and feedback passed.",
  );
} finally {
  await browser.close();
}
