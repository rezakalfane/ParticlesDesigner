/**
 * ParticleField: a Designer look playing on any canvas, without the Designer UI.
 * The frame step mirrors the Designer (src/designer/main.ts `frame`): same motion,
 * rotation, attractor orbit, cycle, audio smoothing, group bypass and 1.8 s
 * look transitions, so a look renders as it does in the tool.
 */
import { ParticleRenderer, PARTICLE_FORMATION_COUNT, type ParticleDrive } from "../engine/renderer";
import { ParticleCycle } from "../engine/particleCycle";
import { DEFAULT_GEOMETRY, type CustomGeometry } from "../engine/customGeometry";
import { attachViewGestures } from "../engine/viewGestures";
import {
  QUALITY_LEVELS,
  QualityController,
  parseQualitySetting,
  type QualitySetting,
} from "./quality";
import { AudioDriver, type AudioInput, type AudioLevels } from "./audio";
import {
  DEFAULT_LOOK,
  lookState,
  resolveLook,
  type Look,
  type LookInput,
  type LookState,
} from "./look";

export interface ParticleFieldOptions {
  /** Factory look id or name, a Designer design (object or JSON). Default "deep-sea". */
  look?: LookInput;
  /** Audio modulation source. Default "none". */
  audio?: AudioInput;
  /** Input gain applied to audio levels before the look's Audio depth. Default 1. */
  audioGain?: number;
  /**
   * Overrides the look's Audio depth (0..2) and switches its audio response on
   * (every factory look already reacts; use this to tune or silence it). Default: the look's.
   */
  audioDepth?: number;
  /**
   * Drag to orbit the camera (in screen space), Shift/right-drag or two-finger twist to
   * roll, double-click to return to the look's viewpoint. Default false.
   */
  interactive?: boolean;
  /** Wheel, trackpad pinch and two-finger pinch zoom (captures page scrolling over the field). Default false. */
  zoom?: boolean;
  /**
   * "auto" (default) watches frame times and lowers particles, ribbons and resolution when
   * the device cannot hold ~60 fps, raising them again when there is headroom (and giving up
   * if lowering does not help, e.g. a 30 fps battery-saver cap). "high" always draws the look
   * as authored; "medium" and "low" pin a lighter level. See `qualityLevel`, `setQuality()`.
   */
  quality?: QualitySetting;
  /** Called when the quality level changes (0 = as authored; higher is lighter). */
  onQualityChange?: (level: number) => void;
  /**
   * Image URL shown in place of the field when WebGL2 is unavailable (otherwise the canvas
   * stays empty). Check `field.supported` to swap in your own fallback instead.
   */
  poster?: string;
  /** Particle ceiling; looks above it are capped. Default 200,000. */
  maxParticles?: number;
  /** Highest device pixel ratio used. Default 1.5. */
  pixelRatio?: number;
  /** Canvas resolution ceiling in device pixels. Default [1920, 1080]. */
  maxResolution?: [number, number];
  /** Start animating immediately. Default true (false under prefers-reduced-motion). */
  autoplay?: boolean;
  /** Stop rendering while the field is offscreen or the tab hidden. Default true. */
  pauseWhenHidden?: boolean;
  /** Look-to-look transition duration in seconds. Default 1.8. */
  transitionSeconds?: number;
  /** Called with rendering or audio errors (the field keeps its last state). */
  onError?: (error: Error) => void;
}

type Target = HTMLCanvasElement | HTMLElement | string;
const clamp = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);
/** Values the Designer substitutes when a whole group is switched off. */
const BYPASS: Record<string, Partial<ParticleDrive>> = {
  particles: { density: 0.44, thickness: 0.25, spread: 0.65, dispersion: 0, turbulence: 0 },
  light: { glow: 0.55, hue: 0, colorVariety: 1, halo: 0, softness: 0, focus: 0.5 },
};
const NOT_TRANSITIONED = new Set<string>([
  "formation",
  "motionTime",
  "customMix",
  "attractorAngle",
  "low",
  "mid",
  "high",
  "ripple",
  "collapse",
  "explosion",
]);
const ANGLES = new Set<string>(["yaw", "pitch", "roll"]);
const weightsFor = (state: LookState) =>
  Array.from(
    { length: PARTICLE_FORMATION_COUNT },
    (_, i) => state.formationWeights?.[i] ?? Number(i === state.formation),
  );

export class ParticleField {
  readonly canvas: HTMLCanvasElement;
  private readonly options: Required<
    Omit<
      ParticleFieldOptions,
      "look" | "audio" | "onError" | "audioDepth" | "quality" | "onQualityChange" | "poster"
    >
  > &
    Pick<ParticleFieldOptions, "onError" | "audioDepth" | "onQualityChange" | "poster">;
  private renderer?: ParticleRenderer;
  private readonly audio = new AudioDriver();
  private readonly cycleClock = new ParticleCycle();
  private state: LookState;
  private current: Look;
  private geometry: CustomGeometry | undefined;
  private drive: ParticleDrive;
  private lastVisible?: ParticleDrive;
  private transition?: { from: ParticleDrive; elapsed: number };
  private time = 0;
  private last = 0;
  private raf = 0;
  private burst = 0;
  private cycleArmed = true;
  private isPaused: boolean;
  private visible = true;
  private dirty = true;
  private dragging = false;
  private readonly quality: QualityController;
  /** Time of the previous rendered frame; undefined after any gap (pause, hidden, idle). */
  private lastRenderAt: number | undefined;
  private failed = false;
  private lookRequest = 0;
  private readonly ownsCanvas: boolean;
  private readonly cleanup: (() => void)[] = [];
  private destroyed = false;

  constructor(target: Target, options: ParticleFieldOptions = {}) {
    const element =
      typeof target === "string" ? document.querySelector<HTMLElement>(target) : target;
    if (!element) throw new Error(`ParticleField: no element matches "${target}".`);
    this.ownsCanvas = !(element instanceof HTMLCanvasElement);
    this.canvas = this.ownsCanvas
      ? document.createElement("canvas")
      : (element as HTMLCanvasElement);
    if (this.ownsCanvas) {
      this.canvas.style.cssText = "display:block;width:100%;height:100%";
      element.append(this.canvas);
    }
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.options = {
      audioGain: options.audioGain ?? 1,
      audioDepth: options.audioDepth,
      interactive: options.interactive ?? false,
      zoom: options.zoom ?? false,
      maxParticles: options.maxParticles ?? 200_000,
      pixelRatio: options.pixelRatio ?? 1.5,
      maxResolution: options.maxResolution ?? [1920, 1080],
      autoplay: options.autoplay ?? !reduced,
      pauseWhenHidden: options.pauseWhenHidden ?? true,
      transitionSeconds: options.transitionSeconds ?? 1.8,
      onError: options.onError,
      onQualityChange: options.onQualityChange,
      poster: options.poster,
    };
    this.quality = new QualityController(parseQualitySetting(options.quality));
    this.isPaused = !this.options.autoplay;
    this.current = resolveLook(options.look ?? DEFAULT_LOOK);
    this.state = lookState(this.current);
    this.geometry = this.state.geometry;
    this.drive = {
      ...(this.state.drive as ParticleDrive),
      formation: this.state.formation,
      formationWeights: weightsFor(this.state),
      customMix: 1,
      motionTime: 0,
      collapse: 0,
      explosion: 0,
      attractorAngle: 0,
      low: 0,
      mid: 0,
      high: 0,
      ripple: 0,
    };
    this.startRenderer();
    this.listen();
    this.resize();
    if (options.audio) void this.setAudio(options.audio);
    this.last = performance.now();
    this.schedule();
  }

  /** The look currently shown (or being transitioned to). */
  get look(): Look {
    return this.current;
  }
  get paused(): boolean {
    return this.isPaused;
  }
  /** Audio state, e.g. "Listening to the microphone" or "Microphone access denied". */
  get audioStatus(): string {
    return this.audio.status;
  }
  /** False when WebGL2 could not start (see `poster` and `onError`). */
  get supported(): boolean {
    return !this.failed;
  }
  /** Current quality level: 0 draws the look as authored, higher is lighter. */
  get qualityLevel(): number {
    return this.quality.level;
  }
  /** Switches between "auto" and a fixed quality at run time. */
  setQuality(setting: QualitySetting): void {
    this.quality.configure(parseQualitySetting(setting));
    this.applyQuality();
  }
  /** Particles drawn in the last frame. */
  get particleCount(): number {
    return this.renderer?.count ?? 0;
  }

  /**
   * Switches to another look with the Designer's smooth transition (or instantly).
   * Custom-geometry looks compile in the background first, so the page never freezes.
   */
  async setLook(input: LookInput, { transition = true } = {}): Promise<void> {
    const look = resolveLook(input);
    const state = lookState(look);
    const request = ++this.lookRequest;
    if (state.geometry && this.renderer) await this.prepare(state.geometry);
    if (request !== this.lookRequest || this.destroyed) return;
    if (transition && this.lastVisible)
      this.transition = { from: { ...this.lastVisible }, elapsed: 0 };
    else this.transition = undefined;
    if (state.geometry && JSON.stringify(state.geometry) !== JSON.stringify(this.geometry)) {
      try {
        this.renderer?.setGeometry(state.geometry, this.geometry ?? DEFAULT_GEOMETRY);
        this.drive.customMix = transition ? 0 : 1;
        this.geometry = state.geometry;
      } catch (error) {
        this.fail(error);
        return;
      }
    }
    this.current = look;
    this.state = state;
    Object.assign(this.drive, state.drive);
    this.drive.palette = state.drive.palette;
    if (!transition) {
      this.drive.formation = state.formation;
      this.drive.formationWeights = weightsFor(state);
      this.renderer?.clearTrails();
    }
    this.dirty = true;
  }

  /** Changes the audio source. Rejects if the microphone is refused (status explains why). */
  async setAudio(input: AudioInput): Promise<void> {
    try {
      await this.audio.set(input);
    } catch (error) {
      this.fail(error);
      throw error;
    }
  }
  /** Feeds your own analysis when audio is "manual" (0..1 each). */
  setAudioLevels(levels: Partial<AudioLevels>): void {
    this.audio.setManual(levels);
  }
  set audioGain(value: number) {
    this.options.audioGain = value;
  }
  get audioGain(): number {
    return this.options.audioGain;
  }
  /** Audio depth override (undefined = the look's own Audio depth and audio switch). */
  set audioDepth(value: number | undefined) {
    this.options.audioDepth = value;
  }
  get audioDepth(): number | undefined {
    return this.options.audioDepth;
  }

  /** Launches a shockwave (when the look has shockwaves enabled). */
  ripple(): void {
    if (this.state.groups.shock) this.burst = 1;
  }
  /** Launches the collapse → explode → reform cycle. False if disabled, paused or already running. */
  cycle(): boolean {
    if (!this.state.groups.cycle || this.isPaused) return false;
    const { implosion, explosion, recovery } = this.state.cycle;
    return this.cycleClock.trigger(this.time, {
      implosion,
      explosion,
      recoveryMs: 800 + recovery * 5200,
    });
  }
  play(): void {
    this.isPaused = false;
    this.last = performance.now();
    this.gap();
    this.schedule();
  }
  /** Returns the camera to the current look's own viewpoint (also: double-click). */
  resetView(): void {
    const { yaw, pitch, roll, distance } = this.state.drive;
    Object.assign(this.drive, { yaw, pitch, roll, distance });
    this.dirty = true;
  }
  /** Freezes motion; the last frame stays visible and the camera can still be dragged. */
  pause(): void {
    this.isPaused = true;
  }
  /** Stops rendering, releases the GPU program and audio, and removes a canvas it created. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.cleanup.forEach((dispose) => dispose());
    this.audio.dispose();
    this.renderer?.dispose();
    this.renderer = undefined;
    if (this.ownsCanvas) this.canvas.remove();
  }

  private startRenderer(): void {
    try {
      this.renderer = new ParticleRenderer(
        this.canvas,
        this.options.maxParticles,
        this.geometry ?? DEFAULT_GEOMETRY,
      );
      this.failed = false;
      this.applyScales();
    } catch (error) {
      this.renderer = undefined;
      this.failed = true;
      if (this.options.poster) {
        // A canvas without a context is transparent: the poster shows through.
        const style = this.canvas.style;
        style.backgroundImage = `url("${this.options.poster.replace(/["\\]/g, "")}")`;
        style.backgroundSize = "cover";
        style.backgroundPosition = "center";
      }
      this.fail(error);
    }
  }

  /** Applies the current quality level to the renderer and the canvas size. */
  private applyQuality(): void {
    this.applyScales();
    this.lastRenderAt = undefined;
    this.resize();
    this.dirty = true;
    this.options.onQualityChange?.(this.quality.level);
    this.schedule();
  }
  private applyScales(): void {
    if (!this.renderer) return;
    const level = QUALITY_LEVELS[this.quality.level];
    this.renderer.countScale = level.particles;
    this.renderer.ribbonScale = level.ribbons;
  }

  private prepare(geometry: CustomGeometry): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        if (this.destroyed || !this.renderer) return resolve();
        try {
          if (this.renderer.prepareGeometry(geometry, this.geometry ?? DEFAULT_GEOMETRY))
            return resolve();
        } catch {
          return resolve(); // setGeometry reports the compile error
        }
        setTimeout(check, 16);
      };
      check();
    });
  }

  private fail(error: unknown): void {
    const err = error instanceof Error ? error : new Error(String(error));
    if (this.options.onError) this.options.onError(err);
    else console.error("ParticleField:", err);
  }

  private on<E extends Event = Event>(
    target: EventTarget,
    type: string,
    handler: (event: E) => void,
    options?: AddEventListenerOptions,
  ): void {
    target.addEventListener(type, handler as EventListener, options);
    this.cleanup.push(() => target.removeEventListener(type, handler as EventListener, options));
  }

  private listen(): void {
    const canvas = this.canvas;
    const resizer = new ResizeObserver(() => this.resize());
    resizer.observe(canvas);
    this.cleanup.push(() => resizer.disconnect());
    if (this.options.pauseWhenHidden) {
      const observer = new IntersectionObserver(([entry]) => {
        this.visible = entry.isIntersecting;
        this.last = performance.now();
        this.gap();
        this.schedule();
      });
      observer.observe(canvas);
      this.cleanup.push(() => observer.disconnect());
      this.on(document, "visibilitychange", () => {
        this.last = performance.now();
        this.gap();
        this.schedule();
      });
    }
    this.on(canvas, "webglcontextlost", (event) => event.preventDefault());
    this.on(canvas, "webglcontextrestored", () => {
      this.renderer?.dispose();
      this.startRenderer();
      this.dirty = true;
      this.schedule();
    });
    if (this.options.interactive || this.options.zoom) {
      // Drag: orbit in screen space · Shift/right-drag or two-finger twist: roll ·
      // wheel or pinch: zoom · double-click: back to the look's viewpoint.
      if (this.options.interactive) canvas.style.cursor = "grab";
      this.cleanup.push(
        attachViewGestures(canvas, {
          orbit: this.options.interactive,
          zoom: this.options.zoom,
          get: () => ({
            yaw: this.drive.yaw,
            pitch: this.drive.pitch,
            roll: this.drive.roll,
            distance: this.drive.distance,
          }),
          set: (view) => {
            Object.assign(this.drive, view);
            this.dirty = true;
          },
          onStart: () => {
            this.dragging = true;
            if (this.options.interactive) canvas.style.cursor = "grabbing";
          },
          onEnd: () => {
            this.dragging = false;
            if (this.options.interactive) canvas.style.cursor = "grab";
          },
          onReset: () => this.resetView(),
        }),
      );
    }
  }

  private resize(): void {
    const width = this.canvas.clientWidth || 300,
      height = this.canvas.clientHeight || 150;
    const [maxWidth, maxHeight] = this.options.maxResolution;
    const ratio =
      Math.min(devicePixelRatio, this.options.pixelRatio, maxWidth / width, maxHeight / height) *
      QUALITY_LEVELS[this.quality.level].pixels;
    const w = Math.max(1, Math.round(width * ratio)),
      h = Math.max(1, Math.round(height * ratio));
    if (w === this.canvas.width && h === this.canvas.height) return;
    this.canvas.width = w;
    this.canvas.height = h;
    this.dirty = true;
    this.schedule();
  }

  /** Frame timing restarts after any gap in rendering. */
  private gap(): void {
    this.lastRenderAt = undefined;
    this.quality.reset();
  }

  private get running(): boolean {
    return !this.destroyed && (!this.options.pauseWhenHidden || (this.visible && !document.hidden));
  }

  private schedule(): void {
    if (this.raf || !this.running || this.failed) return;
    this.raf = requestAnimationFrame((now) => {
      this.raf = 0;
      this.frame(now);
    });
  }

  private frame(now: number): void {
    if (!this.running) return;
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    const { drive, state } = this;
    const depth = this.options.audioDepth;
    const groups = depth === undefined ? state.groups : { ...state.groups, audio: true };
    const reactivity = depth ?? state.reactivity;
    const gain = this.options.audioGain;
    const raw = this.audio.levels(this.time);
    const low = clamp(raw.low * gain),
      mid = clamp(raw.mid * gain),
      high = clamp(raw.high * gain),
      transient = clamp(raw.transient * gain);
    if (!this.isPaused) {
      this.time += dt * 1000;
      drive.customMix = Math.min(1, (drive.customMix ?? 1) + dt / 1.8);
      if (groups.motion) drive.motionTime += dt * 1000 * (0.15 + state.speed * 1.8);
      if (groups.attractors) drive.attractorAngle += dt * state.orbit * 0.8;
      if (transient < 0.12) this.cycleArmed = true;
      if (transient > 0.3 && this.cycleArmed) {
        this.cycleArmed = false;
        if (groups.audio && state.cycleAudio) this.cycle();
      }
      const cycle = this.cycleClock.at(this.time);
      drive.collapse = cycle.collapse;
      drive.explosion = cycle.explosion;
      const blend = 1 - Math.exp(-dt * 2);
      drive.formation += (state.formation - drive.formation) * blend;
      const target = weightsFor(state);
      drive.formationWeights = target.map(
        (weight, i) => (drive.formationWeights?.[i] ?? 0) * (1 - blend) + weight * blend,
      );
      const smoothing = 1 - Math.exp(-dt * 9);
      drive.low += (low * reactivity - drive.low) * smoothing;
      drive.mid += (mid * reactivity - drive.mid) * smoothing;
      drive.high += (high * reactivity - drive.high) * smoothing;
      this.burst *= Math.exp(-dt * 2.8);
      drive.ripple += (Math.max(this.burst, transient * reactivity) - drive.ripple) * smoothing;
      if (!this.dragging && groups.motion) {
        const turn = dt * 0.6;
        drive.pitch = (drive.pitch + turn * state.rotation.x) % (Math.PI * 2);
        drive.yaw = (drive.yaw + turn * state.rotation.y) % (Math.PI * 2);
        drive.roll = (drive.roll + turn * state.rotation.z) % (Math.PI * 2);
      }
    }
    const animating = !this.isPaused || this.transition !== undefined || this.dirty;
    if (this.renderer && animating) {
      const visible = { ...drive };
      if (!groups.particles) Object.assign(visible, BYPASS.particles);
      if (!groups.light) Object.assign(visible, BYPASS.light);
      if (!groups.ribbons) visible.trail = 0;
      if (!groups.attractors) visible.attraction = 0;
      if (!groups.cycle) Object.assign(visible, { collapse: 0, explosion: 0 });
      if (!groups.audio) Object.assign(visible, { low: 0, mid: 0, high: 0, ripple: this.burst });
      if (!groups.shock) Object.assign(visible, { shock: 0, ripple: 0 });
      if (this.transition) {
        this.transition.elapsed += dt;
        const t = Math.min(
          1,
          this.transition.elapsed / Math.max(0.001, this.options.transitionSeconds),
        );
        const eased = t * t * (3 - 2 * t);
        const from = this.transition.from as unknown as Record<string, unknown>;
        const to = visible as unknown as Record<string, unknown>;
        for (const key of Object.keys(to)) {
          if (NOT_TRANSITIONED.has(key)) continue;
          const start = from[key],
            end = to[key];
          if (typeof start !== "number" || typeof end !== "number") continue;
          const delta = ANGLES.has(key)
            ? ((end - start + Math.PI * 3) % (Math.PI * 2)) - Math.PI
            : end - start;
          to[key] = start + delta * eased;
        }
        if (t === 1) this.transition = undefined;
      }
      this.lastVisible = { ...visible };
      this.renderer.render(this.time, visible);
      this.dirty = false;
      if (this.lastRenderAt !== undefined && this.quality.adaptive) {
        if (this.quality.frame(now - this.lastRenderAt) !== undefined) this.applyQuality();
      }
      this.lastRenderAt = now;
    } else if (this.lastRenderAt !== undefined) this.gap();
    this.schedule();
  }
}
