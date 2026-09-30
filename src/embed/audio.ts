/**
 * Audio for embedded fields: the Designer's band analysis (low 20–250 Hz,
 * mid 250–4000 Hz, high 4–16 kHz, transient = rising low) over Web Audio.
 */

/** Normalized 0..1 levels driving expansion (low), twist (mid), point size (high) and ripples. */
export interface AudioLevels {
  low: number;
  mid: number;
  high: number;
  transient: number;
}
/**
 * - "none": no modulation; "demo": a silent built-in pulse;
 * - "microphone": the default input (asks permission; never routed to the speakers);
 * - an <audio>/<video> element (it keeps playing through the speakers);
 * - a MediaStream (analysis only);
 * - "manual": push your own analysis with `ParticleField.setAudioLevels()`.
 */
export type AudioInput = "none" | "demo" | "microphone" | "manual" | HTMLMediaElement | MediaStream;

const SILENT: AudioLevels = { low: 0, mid: 0, high: 0, transient: 0 };
let shared: AudioContext | undefined;
/** A media element can feed exactly one source node, ever: share it between fields. */
const mediaSources = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();

function context(): AudioContext {
  if (!shared) {
    shared = new AudioContext();
    // Browsers start audio suspended until a user gesture.
    const resume = () => {
      void shared?.resume().catch(() => {});
      if (shared?.state === "running") {
        removeEventListener("pointerdown", resume, true);
        removeEventListener("keydown", resume, true);
      }
    };
    addEventListener("pointerdown", resume, true);
    addEventListener("keydown", resume, true);
  }
  return shared;
}

export class AudioDriver {
  private analyser?: AnalyserNode;
  private bins?: Uint8Array<ArrayBuffer>;
  private node?: AudioNode;
  private ownedStream?: MediaStream;
  private media?: { element: HTMLMediaElement; onPlay: () => void };
  private previousLow = 0;
  private manual: AudioLevels = { ...SILENT };
  private request = 0;
  input: AudioInput = "none";
  /** Human-readable state, e.g. "Microphone access denied". */
  status = "No audio modulation";

  async set(input: AudioInput): Promise<void> {
    const request = ++this.request;
    this.disconnect();
    this.input = input;
    this.status =
      input === "demo"
        ? "Silent demo modulation"
        : input === "manual"
          ? "Manual audio levels"
          : "No audio modulation";
    if (input === "none" || input === "demo" || input === "manual") return;
    const audio = context();
    this.analyser = audio.createAnalyser();
    this.analyser.fftSize = 2048;
    this.bins = new Uint8Array(this.analyser.frequencyBinCount);
    if (input === "microphone") {
      this.status = "Waiting for microphone permission…";
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
          video: false,
        });
        if (request !== this.request) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        this.ownedStream = stream;
        this.node = audio.createMediaStreamSource(stream);
        this.node.connect(this.analyser);
        this.status = "Listening to the microphone";
        void audio.resume().catch(() => {});
      } catch (error) {
        if (request !== this.request) return;
        this.status =
          error instanceof DOMException && error.name === "NotAllowedError"
            ? "Microphone access denied"
            : `Microphone unavailable: ${error instanceof Error ? error.message : String(error)}`;
        throw error;
      }
    } else if (input instanceof MediaStream) {
      this.node = audio.createMediaStreamSource(input);
      this.node.connect(this.analyser);
      this.status = "Listening to a media stream";
    } else {
      let source = mediaSources.get(input);
      if (!source) {
        source = audio.createMediaElementSource(input);
        source.connect(audio.destination);
        mediaSources.set(input, source);
      }
      source.connect(this.analyser);
      this.node = source;
      // Playback is usually a user gesture: the moment the context may start.
      const onPlay = () => void audio.resume().catch(() => {});
      input.addEventListener("play", onPlay);
      this.media = { element: input, onPlay };
      this.status = "Listening to a media element";
    }
  }

  setManual(levels: Partial<AudioLevels>): void {
    this.manual = { ...this.manual, ...levels };
  }

  /** Current raw levels (before gain and reactivity). `timeMs` animates the demo pulse. */
  levels(timeMs: number): AudioLevels {
    if (this.input === "demo") {
      const low = Math.exp(-(((timeMs / 1000) * 2) % 1) * 7) * 0.8;
      return {
        low,
        mid: 0.3 + Math.sin(timeMs / 1300) * 0.2,
        high: Math.pow(Math.max(0, Math.sin(timeMs / 120)), 8) * 0.6,
        transient: low,
      };
    }
    if (this.input === "manual") return this.manual;
    const { analyser, bins } = this;
    if (!analyser || !bins || !shared) return SILENT;
    if (this.media && this.media.element.paused) return SILENT;
    analyser.getByteFrequencyData(bins);
    const rate = shared.sampleRate;
    const band = (from: number, to: number) => {
      const start = Math.max(1, Math.floor((from * analyser.fftSize) / rate));
      const end = Math.min(bins.length, Math.ceil((to * analyser.fftSize) / rate));
      let sum = 0;
      for (let i = start; i < end; i++) sum += (bins[i] / 255) ** 2;
      return Math.sqrt(sum / Math.max(1, end - start));
    };
    const low = band(20, 250);
    const transient = Math.max(0, low - this.previousLow) * 5;
    this.previousLow = low;
    return { low, mid: band(250, 4000), high: band(4000, 16000), transient };
  }

  private disconnect(): void {
    if (this.node && this.analyser) this.node.disconnect(this.analyser);
    if (this.node && !this.media) this.node.disconnect();
    this.node = undefined;
    this.ownedStream?.getTracks().forEach((track) => track.stop());
    this.ownedStream = undefined;
    if (this.media) this.media.element.removeEventListener("play", this.media.onPlay);
    this.media = undefined;
    this.analyser = undefined;
    this.bins = undefined;
    this.previousLow = 0;
  }

  dispose(): void {
    ++this.request;
    this.disconnect();
    this.input = "none";
  }
}
