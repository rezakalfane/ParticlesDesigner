/**
 * Adaptive quality for embedded fields. A ladder of levels trades particles, ribbons and
 * resolution for frame time; the controller watches how long frames take and steps along it.
 * Pure (no DOM, no clock): it is fed frame intervals, so its behaviour is exactly testable.
 *
 * Rules that keep it from making things worse:
 *  - a drop is kept only if it actually helps: when lowering quality does not improve frame
 *    time (a 30 fps battery-saver cap, a busy page), it reverts and stops adapting;
 *  - a better level is retried only after sustained good frames, and a level that fails right
 *    after being retried is never tried again;
 *  - sustained slowness (a phone at 3 fps) is measured, not dismissed as a stall.
 */
export interface QualityLevel {
  /** Share of the authored particle count drawn. */
  particles: number;
  /** Share of the ribbon budget (0 = no ribbons). */
  ribbons: number;
  /** Share of the canvas pixel ratio. */
  pixels: number;
}

/** Level 0 is the look as authored; each step is lighter. */
export const QUALITY_LEVELS: readonly QualityLevel[] = [
  { particles: 1, ribbons: 1, pixels: 1 },
  { particles: 0.8, ribbons: 0.5, pixels: 1 },
  { particles: 0.6, ribbons: 0.25, pixels: 0.85 },
  { particles: 0.45, ribbons: 0, pixels: 0.75 },
  { particles: 0.3, ribbons: 0, pixels: 0.65 },
  { particles: 0.2, ribbons: 0, pixels: 0.55 },
];
export const MAX_QUALITY_LEVEL = QUALITY_LEVELS.length - 1;

export type QualitySetting = "auto" | "high" | "medium" | "low";
/** Fixed settings pin a level; "auto" adapts. */
export const FIXED_QUALITY_LEVEL: Record<Exclude<QualitySetting, "auto">, number> = {
  high: 0,
  medium: 2,
  low: 4,
};

/** Mean frame interval above which quality drops (about 42 fps). */
export const SLOW_MS = 24;
/** Mean frame interval below which a better level may be tried (about 52 fps or better). */
export const FAST_MS = 19;
const STALL_MS = 250; // a single longer interval is a hiccup (shader compile, tab switch)…
const STALL_STREAK = 3; // …unless it keeps happening: then the device really is that slow
const FIRST_WINDOW = 30; // frames measured before the first decision (react quickly)
const WINDOW = 45; // frames per later decision
const SETTLE_FRAMES = 6; // ignored after a change (canvas resize, program warm-up)…
const SETTLE_MS = 1200; // …or for this long, whichever comes first (slow devices)
const MAX_WINDOW_MS = 2500; // a window ends after this long even if it has fewer frames…
const MIN_SAMPLES = 6; // …provided it has at least this many
const GOOD_WINDOWS_TO_UPGRADE = 6; // about six seconds of headroom
const PROBATION_MS = 5000; // a level that fails this soon after being retried is banned
const MIN_GAIN = 0.08; // a drop must cut the mean frame time by this share to be kept

export function parseQualitySetting(value: unknown): QualitySetting {
  return value === "high" || value === "medium" || value === "low" ? value : "auto";
}

export class QualityController {
  level: number;
  /** True while the controller may still change the level. */
  adaptive: boolean;
  private setting: QualitySetting;
  /** Best level still allowed (raised when a retried level fails again). */
  private minLevel = 0;
  private samples: number[] = [];
  private skip = SETTLE_FRAMES;
  private skipMs = SETTLE_MS;
  private windowMs = 0;
  private evaluated = false;
  private stalls = 0;
  private good = 0;
  private clock = 0;
  private upgradedAt = Number.NEGATIVE_INFINITY;
  /** Set when a drop is on trial: the level it came from and the mean it had to beat. */
  private trial: { from: number; mean: number } | undefined;

  constructor(setting: QualitySetting = "auto") {
    this.setting = setting;
    this.adaptive = setting === "auto";
    this.level = setting === "auto" ? 0 : FIXED_QUALITY_LEVEL[setting];
  }

  /** Switches between auto and a fixed level; returns the (possibly new) level. */
  configure(setting: QualitySetting): number {
    this.setting = setting;
    this.adaptive = setting === "auto";
    if (setting !== "auto") this.level = FIXED_QUALITY_LEVEL[setting];
    this.minLevel = 0;
    this.trial = undefined;
    this.reset();
    return this.level;
  }

  /** Forget the current measurements (tab hidden, field paused, scrolled offscreen). */
  reset(): void {
    this.samples = [];
    this.windowMs = 0;
    this.skip = SETTLE_FRAMES;
    this.skipMs = SETTLE_MS;
    this.stalls = 0;
    this.good = 0;
  }

  /**
   * Feeds the interval (ms) between two consecutive rendered frames. Returns the new
   * level when it changed, otherwise undefined.
   */
  frame(intervalMs: number): number | undefined {
    if (!this.adaptive || !(intervalMs > 0)) return undefined;
    this.clock += Math.min(intervalMs, STALL_MS);
    let interval = intervalMs;
    if (interval > STALL_MS) {
      if (++this.stalls < STALL_STREAK) {
        this.skip = Math.max(this.skip, 2);
        return undefined; // a hiccup: ignore it
      }
      interval = Math.min(interval, 1000); // sustained: this is the real frame time
    } else this.stalls = 0;
    if (this.skip > 0 && this.skipMs > 0) {
      this.skip--;
      this.skipMs -= interval;
      return undefined;
    }
    this.skip = 0;
    this.samples.push(interval);
    this.windowMs += interval;
    const full = this.samples.length >= (this.evaluated ? WINDOW : FIRST_WINDOW);
    if (!full && !(this.windowMs >= MAX_WINDOW_MS && this.samples.length >= MIN_SAMPLES))
      return undefined;

    const sorted = [...this.samples].sort((a, b) => a - b);
    const kept = sorted.slice(0, Math.max(1, Math.ceil(sorted.length * 0.95))); // shed GC spikes
    const mean = kept.reduce((sum, value) => sum + value, 0) / kept.length;
    this.samples = [];
    this.windowMs = 0;
    this.evaluated = true;
    return this.decide(mean);
  }

  private decide(mean: number): number | undefined {
    // A drop on trial: keep it only if it helped, otherwise undo it and stop adapting.
    if (this.trial) {
      const { from, mean: before } = this.trial;
      this.trial = undefined;
      if (mean > SLOW_MS && mean > before * (1 - MIN_GAIN)) {
        this.adaptive = false;
        return this.move(from);
      }
    }
    if (mean > SLOW_MS && this.level < MAX_QUALITY_LEVEL) {
      // A level that was just retried and is already too slow is banned for good.
      if (this.clock - this.upgradedAt < PROBATION_MS)
        this.minLevel = Math.max(this.minLevel, this.level + 1);
      const steps = mean > SLOW_MS * 4 ? 3 : mean > SLOW_MS * 2 ? 2 : 1;
      this.trial = { from: this.level, mean };
      return this.move(Math.min(MAX_QUALITY_LEVEL, this.level + steps));
    }
    if (mean < FAST_MS && this.level > this.minLevel) {
      if (++this.good >= GOOD_WINDOWS_TO_UPGRADE) {
        this.upgradedAt = this.clock;
        return this.move(this.level - 1);
      }
      return undefined;
    }
    this.good = 0;
    return undefined;
  }

  private move(level: number): number | undefined {
    const changed = level !== this.level;
    this.level = level;
    this.samples = [];
    this.windowMs = 0;
    this.skip = SETTLE_FRAMES;
    this.skipMs = SETTLE_MS;
    this.good = 0;
    return changed ? level : undefined;
  }
}
