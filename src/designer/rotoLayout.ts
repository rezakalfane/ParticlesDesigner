import { LAB_BANK_COUNT, bankLabel } from "./banks";
/** One map for hardware exports, decoding, feedback and the Designer page strip. */
export interface DesignerPage {
  name: string;
  section: string;
  knobs: string[];
  actions: string[];
}
const page = (name: string, section: string, knobs: string[], actions: string[]): DesignerPage => ({
  name,
  section,
  knobs,
  actions,
});
export const DESIGNER_SETUPS = [
  {
    channel: 9,
    name: "PD PERFORM",
    pages: [
      page(
        "LOOKS",
        "preset-banks",
        [
          "Preset bank",
          "Preset slot",
          "Motion",
          "Light",
          "Expansion",
          "Audio depth",
          "Shockwave",
          "Ribbon brightness",
        ],
        ["Apply look", "Previous", "Next"],
      ),
      page(
        "SHAPES",
        "shape-banks",
        [
          "Shape bank",
          "Shape slot",
          "Particle density",
          "Particle thickness",
          "Expansion",
          "Particle dispersion",
          "Turbulence",
          "Journey time",
        ],
        ["Apply shape", "Journey", "Particles"],
      ),
      page(
        "GESTURES",
        "controls-cycle",
        [
          "Shockwave",
          "Implosion",
          "Explosion",
          "Recovery time",
          "Attraction",
          "Attractor separation",
          "Attractor orbit",
          "Audio depth",
        ],
        ["Ripple", "Cycle", "Audio cycle"],
      ),
      page(
        "VIEW",
        "controls-view",
        [
          "View horizontal",
          "View vertical",
          "View roll",
          "View distance",
          "Rotation X",
          "Rotation Y",
          "Rotation Z",
          "Systems",
        ],
        ["Reset view"],
      ),
    ],
  },
  {
    channel: 10,
    name: "PD DESIGN",
    pages: [
      page(
        "PARTICLES",
        "controls-particles",
        [
          "Particle density",
          "Particle thickness",
          "Expansion",
          "Particle dispersion",
          "Turbulence",
          "Turbulence scale",
          "Turbulence density",
        ],
        ["Particles"],
      ),
      page(
        "LIGHT",
        "controls-light",
        ["Light", "Color drift", "Color variety", "Halo glow", "Depth softness", "Focus plane"],
        ["Light on"],
      ),
      page(
        "RIBBONS",
        "controls-ribbons",
        ["Ribbon length", "Ribbon brightness", "Trail head size", "Trail thickness"],
        ["Ribbons"],
      ),
      page(
        "ATTRACT",
        "controls-attractors",
        ["Attraction", "Attractor separation", "Attractor orbit"],
        ["Attractors"],
      ),
    ],
  },
  {
    channel: 11,
    name: "PD MOTION",
    pages: [
      page(
        "MOVE",
        "controls-motion",
        ["Motion", "Rotation X", "Rotation Y", "Rotation Z", "Journey time"],
        ["Motion on", "Journey"],
      ),
      page("SHOCK", "controls-shock", ["Shockwave"], ["Shock on", "Ripple"]),
      page(
        "CYCLE",
        "controls-cycle",
        ["Implosion", "Explosion", "Recovery time"],
        ["Cycle on", "Cycle", "Audio cycle"],
      ),
      page(
        "AUDIO",
        "controls-audio",
        ["Input mode", "Input gain", "Audio depth"],
        ["Audio on", "File play"],
      ),
    ],
  },
] as const;
export const designerActions = (p: DesignerPage) => [
  ...Array.from({ length: 3 }, (_, i) => p.actions[i] ?? ""),
  "Blackout",
  "Undo",
  "Redo",
  "Pause",
  p.name,
];
const labels: Record<string, string> = {
  "Preset bank": "Bank",
  "Preset slot": "Look",
  "Shape bank": "Bank",
  "Shape slot": "Shape",
  "Particle density": "Density",
  "Particle thickness": "Thickness",
  "Particle dispersion": "Disperse",
  "Turbulence scale": "TurbScale",
  "Turbulence density": "TurbDens",
  Turbulence: "Turbul",
  "Ribbon brightness": "RibLight",
  "Ribbon length": "RibLength",
  "Trail head size": "HeadSize",
  "Trail thickness": "TrailWid",
  "Attractor separation": "Separate",
  "Attractor orbit": "Orbit",
  "Recovery time": "Recovery",
  "View horizontal": "Yaw",
  "View vertical": "Pitch",
  "View roll": "Roll",
  "View distance": "Distance",
  "Rotation X": "Rot X",
  "Rotation Y": "Rot Y",
  "Rotation Z": "Rot Z",
  "Color variety": "ColVar",
  "Color drift": "ColDrift",
  "Depth softness": "Softness",
  "Focus plane": "Focus",
  "Halo glow": "Halo",
  "Audio depth": "AudDepth",
  "Journey time": "Journey",
  "Input mode": "Input",
  "Input gain": "Gain",
};
export const designerSteps = (key: string) =>
  key.endsWith(" bank")
    ? LAB_BANK_COUNT
    : key.endsWith(" slot")
      ? 16
      : key === "Systems"
        ? 2
        : key === "Input mode"
          ? 4
          : 0;
/** Camera uses standard 14-bit CC pairs; all pairs are reserved before coarse CCs. */
export function designerSetupDocuments() {
  return DESIGNER_SETUPS.map((setup) => {
    let fine = 0;
    const knobs = setup.pages.flatMap((p, pageIndex) =>
      p.knobs.map((key, slot) => {
        const precise = key.startsWith("View ");
        const steps = designerSteps(key);
        return {
          controlIndex: pageIndex * 8 + slot,
          controlMode: precise ? 1 : 0,
          controlChannel: setup.channel,
          controlParam: precise ? fine++ : -1,
          nrpnAddress: 0,
          minValue: 0,
          maxValue: precise ? 16383 : 127,
          controlName: labels[key] ?? key,
          colorScheme: 13,
          hapticMode: steps ? 1 : 0,
          hapticIndent1: 255,
          hapticIndent2: 255,
          hapticSteps: steps,
          stepNames: Array.from({ length: 16 }, (_, i) => {
            const names =
              key === "Preset bank" || key === "Shape bank"
                ? Array.from({ length: LAB_BANK_COUNT }, (_, b) =>
                    bankLabel(key === "Preset bank" ? "preset" : "shape", b),
                  )
                : key === "Systems"
                  ? ["1 field", "4 fields"]
                  : key === "Input mode"
                    ? ["Demo", "Mic", "File", "Off"]
                    : undefined;
            return names ? (names[i] ?? "") : i < steps ? String(i + 1) : "";
          }),
        };
      }),
    );
    let coarse = fine;
    for (const k of knobs) if (k.controlParam < 0) k.controlParam = coarse++;
    if (coarse > 32) throw new Error("Designer coarse CC overlaps fine LSB range");
    const toggles = new Set([
      "Blackout",
      "Pause",
      "Journey",
      "Particles",
      "Light on",
      "Ribbons",
      "Attractors",
      "Motion on",
      "Shock on",
      "Cycle on",
      "Audio on",
      "Audio cycle",
      "File play",
    ]);
    const buttons = setup.pages.flatMap((p, pi) =>
      designerActions(p).flatMap((key, slot) =>
        key
          ? [
              {
                controlIndex: pi * 8 + slot,
                controlMode: 0,
                controlChannel: setup.channel,
                controlParam: 64 + pi * 8 + slot,
                nrpnAddress: 65535,
                minValue: 0,
                maxValue: 127,
                controlName: key,
                colorScheme:
                  slot === 7
                    ? 24
                    : key === "Blackout"
                      ? 14
                      : ["Previous", "Next"].includes(key)
                        ? 9
                        : 13,
                ledOnColor: key === "Blackout" ? 71 : slot === 7 ? 24 : 13,
                ledOffColor: key === "Blackout" ? 72 : 70,
                hapticMode: toggles.has(key) ? 1 : 0,
                hapticSteps: toggles.has(key) ? 2 : 0,
                stepNames: Array(16).fill(""),
              },
            ]
          : [],
      ),
    );
    return { version: 1, type: "MIDI", name: setup.name, index: setup.channel, knobs, buttons };
  });
}
