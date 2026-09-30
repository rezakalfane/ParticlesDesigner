import { describe, expect, it } from "vitest";
import {
  FAST_MS,
  MAX_QUALITY_LEVEL,
  QUALITY_LEVELS,
  QualityController,
  SLOW_MS,
  parseQualitySetting,
} from "../src/embed/quality";

const VSYNC = 1000 / 60;
/** Relative cost of a level: points, ribbons and fill, as a device would feel them. */
const weight = (level: number) => {
  const l = QUALITY_LEVELS[level];
  return l.particles * (0.5 + 0.5 * l.ribbons) * l.pixels ** 2;
};
/** A GPU that needs `baseMs` per frame at level 0, quantised to a 60 Hz display. */
const gpu = (baseMs: number) => (level: number) => Math.max(VSYNC, baseMs * weight(level));

/** Runs the controller against a device for `seconds`, returning every level change. */
function simulate(
  controller: QualityController,
  seconds: number,
  interval: (level: number, ms: number) => number,
) {
  let now = 0;
  const changes: { at: number; level: number }[] = [];
  while (now < seconds * 1000) {
    const dt = interval(controller.level, now);
    now += dt;
    const level = controller.frame(dt);
    if (level !== undefined) changes.push({ at: now, level });
  }
  return changes;
}

describe("adaptive quality", () => {
  it("has a ladder that only gets lighter", () => {
    for (let i = 1; i < QUALITY_LEVELS.length; i++) {
      expect(QUALITY_LEVELS[i].particles).toBeLessThanOrEqual(QUALITY_LEVELS[i - 1].particles);
      expect(QUALITY_LEVELS[i].ribbons).toBeLessThanOrEqual(QUALITY_LEVELS[i - 1].ribbons);
      expect(QUALITY_LEVELS[i].pixels).toBeLessThanOrEqual(QUALITY_LEVELS[i - 1].pixels);
    }
    expect(QUALITY_LEVELS[0]).toEqual({ particles: 1, ribbons: 1, pixels: 1 });
    expect(SLOW_MS).toBeGreaterThan(FAST_MS);
  });

  it("leaves a device that holds 60 fps alone", () => {
    const controller = new QualityController("auto");
    expect(simulate(controller, 120, () => VSYNC)).toEqual([]);
    expect(controller.level).toBe(0);
  });

  it("ignores one-off stalls (shader compile, tab switch)", () => {
    const controller = new QualityController("auto");
    let frames = 0;
    const changes = simulate(controller, 60, () => (++frames % 100 === 0 ? 700 : VSYNC));
    expect(changes).toEqual([]);
  });

  it("settles on the lightest level a slow device needs, quickly and without hunting", () => {
    const controller = new QualityController("auto");
    const device = gpu(40); // 25 fps as authored
    const changes = simulate(controller, 120, device);
    expect(device(controller.level)).toBeLessThanOrEqual(SLOW_MS);
    expect(controller.level).toBeGreaterThan(0);
    expect(changes[0].at).toBeLessThan(2500); // reacts within the first seconds
    // A level is retried at most once, and never more than a handful of moves in all.
    expect(changes.length).toBeLessThanOrEqual(5);
    expect(changes.filter((c) => c.at > 60_000)).toEqual([]);
  });

  it("measures a device that is very slow, instead of dismissing it as stalling", () => {
    const controller = new QualityController("auto");
    const device = gpu(400); // 2.5 fps as authored
    const changes = simulate(controller, 300, device);
    expect(changes.length).toBeGreaterThan(0);
    expect(controller.level).toBeGreaterThanOrEqual(3);
    expect(device(controller.level)).toBeLessThan(400 * 0.5);
  });

  it("stops at the floor for a device that cannot be helped", () => {
    const controller = new QualityController("auto");
    simulate(controller, 300, gpu(2000));
    expect(controller.level).toBeLessThanOrEqual(MAX_QUALITY_LEVEL);
    expect(controller.level).toBeGreaterThan(0);
  });

  it("keeps full quality on a 30 fps capped display (dropping would not help)", () => {
    const controller = new QualityController("auto");
    const changes = simulate(controller, 120, () => 1000 / 30);
    expect(controller.level).toBe(0);
    expect(controller.adaptive).toBe(false); // gave up: it is not the field's doing
    expect(changes.length).toBeLessThanOrEqual(2); // one trial drop, then undone
    expect(changes.at(-1)?.level).toBe(0);
    expect(changes.filter((c) => c.at > 15_000)).toEqual([]);
  });

  it("recovers when a temporary slowdown is over", () => {
    const controller = new QualityController("auto");
    const heavy = gpu(40),
      light = gpu(8);
    const changes = simulate(controller, 90, (level, ms) =>
      ms < 5000 ? heavy(level) : light(level),
    );
    expect(changes.some((c) => c.level > 0)).toBe(true);
    expect(controller.level).toBe(0);
  });

  it("never retries a level that failed right after being retried", () => {
    // Level 1 is too slow, level 2 is fine. Once light, the controller tries level 1 exactly once more.
    const interval = (level: number) => (level >= 2 ? VSYNC : level === 1 ? 30 : 45);
    const controller = new QualityController("auto");
    const changes = simulate(controller, 300, interval);
    expect(controller.level).toBe(2);
    const toLevelOne = changes.filter((c) => c.level === 1).length;
    expect(toLevelOne).toBeLessThanOrEqual(2);
    expect(changes.filter((c) => c.at > 120_000)).toEqual([]);
  });

  it("does nothing for fixed levels, and can switch at run time", () => {
    const fixed = new QualityController("low");
    expect(fixed.level).toBe(4);
    expect(simulate(fixed, 60, gpu(80))).toEqual([]);
    expect(fixed.level).toBe(4);
    expect(new QualityController("high").level).toBe(0);
    expect(new QualityController("medium").level).toBe(2);
    const auto = new QualityController("low");
    auto.configure("auto");
    expect(auto.adaptive).toBe(true);
    expect(simulate(auto, 60, gpu(40)).length).toBeGreaterThan(0);
    expect(auto.configure("high")).toBe(0);
    expect(auto.adaptive).toBe(false);
  });

  it("forgets its measurements on reset", () => {
    const controller = new QualityController("auto");
    for (let i = 0; i < 25; i++) controller.frame(60); // almost a slow window
    controller.reset();
    for (let i = 0; i < 25; i++) expect(controller.frame(VSYNC)).toBeUndefined();
    expect(controller.level).toBe(0);
  });

  it("parses settings, defaulting to auto", () => {
    expect(parseQualitySetting("low")).toBe("low");
    expect(parseQualitySetting("High")).toBe("auto"); // exact values only
    expect(parseQualitySetting(null)).toBe("auto");
    expect(parseQualitySetting(undefined)).toBe("auto");
  });
});
