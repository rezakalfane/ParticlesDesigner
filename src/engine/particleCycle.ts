/** Clock-injected performance gesture. No RAF, audio, registry or persistence. */
export interface CycleSettings {
  implosion: number;
  explosion: number;
  recoveryMs: number;
}
export interface CycleState {
  collapse: number;
  explosion: number;
  phase: "Ready" | "Collapsing" | "Exploding" | "Reforming";
}
const unit = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);
const ease = (v: number) => {
  const x = unit(v);
  return x * x * (3 - 2 * x);
};
export class ParticleCycle {
  private start: number | null = null;
  private settings: CycleSettings = { implosion: 0, explosion: 0, recoveryMs: 2000 };
  trigger(timeMs: number, settings: CycleSettings): boolean {
    if (!Number.isFinite(timeMs) || this.at(timeMs).phase !== "Ready") return false;
    this.start = timeMs;
    this.settings = {
      implosion: unit(settings.implosion),
      explosion: unit(settings.explosion),
      recoveryMs: Number.isFinite(settings.recoveryMs)
        ? Math.max(800, Math.min(6000, settings.recoveryMs))
        : 2000,
    };
    return true;
  }
  at(timeMs: number): CycleState {
    const ready: CycleState = { collapse: 0, explosion: 0, phase: "Ready" };
    if (this.start === null) return ready;
    const age = timeMs - this.start;
    if (age < 0 || !Number.isFinite(age)) {
      this.start = null;
      return ready;
    }
    if (age < 650)
      return {
        collapse: ease(age / 650) * this.settings.implosion,
        explosion: 0,
        phase: "Collapsing",
      };
    if (age < 900) {
      const release = ease((age - 650) / 250);
      return {
        collapse: (1 - release) * this.settings.implosion,
        explosion: release * this.settings.explosion,
        phase: "Exploding",
      };
    }
    if (age < 900 + this.settings.recoveryMs)
      return {
        collapse: 0,
        explosion: (1 - ease((age - 900) / this.settings.recoveryMs)) * this.settings.explosion,
        phase: "Reforming",
      };
    this.start = null;
    return ready;
  }
}
