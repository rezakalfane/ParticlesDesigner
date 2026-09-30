/**
 * <particle-field> — a ParticleField as an HTML element.
 *
 *   <particle-field look="deep-sea" audio="demo" interactive></particle-field>
 *   <particle-field src="/looks/my-design.json"></particle-field>
 *   <particle-field audio="#track">
 *     <script type="application/json">{ …design exported by the Designer… }</script>
 *   </particle-field>
 *
 * Attributes: look (factory id or name), src (design JSON URL), audio ("none",
 * "demo", "microphone" or a CSS selector for an <audio>/<video>), audio-gain,
 * audio-depth (overrides the look's Audio depth and turns its audio response on),
 * interactive, zoom, paused, max-particles, pixel-ratio. The element is a block
 * that fills its CSS size (300×150 by default); `.field` is the ParticleField.
 * Dispatches "particle-field-error" events with `detail` = Error.
 */
import type { AudioInput } from "./audio";
import { ParticleField } from "./field";
import { fetchLook, type LookInput } from "./look";

const STYLE = `:host{display:block;position:relative;width:300px;height:150px;background:#000;overflow:hidden}
canvas{position:absolute;inset:0;display:block;width:100%;height:100%}`;

export class ParticleFieldElement extends HTMLElement {
  static observedAttributes = ["look", "src", "audio", "audio-gain", "audio-depth", "paused"];
  /** The running field (undefined while disconnected). */
  field?: ParticleField;
  private design?: LookInput;

  /** Sets a look object/JSON directly (takes precedence over attributes). */
  set look(value: LookInput) {
    this.design = value;
    void this.field?.setLook(value).catch((error) => this.fail(error));
  }

  connectedCallback(): void {
    const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${STYLE}</style><canvas part="canvas"></canvas>`;
    const inline = this.querySelector('script[type="application/json"]')?.textContent;
    try {
      this.field = new ParticleField(root.querySelector("canvas")!, {
        look: this.design ?? inline ?? this.getAttribute("look") ?? undefined,
        audio: this.audioInput(),
        audioGain: Number(this.getAttribute("audio-gain") ?? 1),
        audioDepth: this.numberAttribute("audio-depth"),
        interactive: this.hasAttribute("interactive"),
        zoom: this.hasAttribute("zoom"),
        autoplay: this.hasAttribute("paused") ? false : undefined,
        maxParticles: this.numberAttribute("max-particles"),
        pixelRatio: this.numberAttribute("pixel-ratio"),
        onError: (error) => this.fail(error),
      });
    } catch (error) {
      this.fail(error);
      return;
    }
    if (!this.design && !inline && this.getAttribute("src"))
      void this.load(this.getAttribute("src")!);
  }

  disconnectedCallback(): void {
    this.field?.destroy();
    this.field = undefined;
  }

  attributeChangedCallback(name: string, previous: string | null, value: string | null): void {
    const field = this.field;
    if (!field || previous === value) return;
    if (name === "look" && value) void field.setLook(value).catch((error) => this.fail(error));
    if (name === "src" && value) void this.load(value);
    if (name === "audio") void field.setAudio(this.audioInput()).catch(() => {});
    if (name === "audio-gain") field.audioGain = Number(value ?? 1);
    if (name === "audio-depth") field.audioDepth = this.numberAttribute("audio-depth");
    if (name === "paused") {
      if (value === null) field.play();
      else field.pause();
    }
  }

  private async load(url: string): Promise<void> {
    try {
      const look = await fetchLook(new URL(url, document.baseURI));
      if (this.getAttribute("src") === url) await this.field?.setLook(look, { transition: false });
    } catch (error) {
      this.fail(error);
    }
  }

  private audioInput(): AudioInput {
    const value = this.getAttribute("audio")?.trim();
    if (!value || value === "none") return "none";
    if (value === "demo" || value === "microphone") return value;
    const media = document.querySelector(value);
    return media instanceof HTMLMediaElement ? media : "none";
  }

  private numberAttribute(name: string): number | undefined {
    const value = this.getAttribute(name);
    return value === null || !Number.isFinite(Number(value)) ? undefined : Number(value);
  }

  private fail(error: unknown): void {
    const err = error instanceof Error ? error : new Error(String(error));
    if (
      !this.dispatchEvent(
        new CustomEvent("particle-field-error", { detail: err, cancelable: true }),
      )
    )
      return;
    console.error("<particle-field>:", err);
  }
}

/** Registers <particle-field> (done automatically on import when possible). */
export function defineParticleFieldElement(name = "particle-field"): void {
  if (!customElements.get(name)) customElements.define(name, ParticleFieldElement);
}
