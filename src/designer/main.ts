import { connectDesignerRoto } from "./roto";
import { createSlotDialog, createSlotMenu, onLongPress } from "./dialog";
import { createEmbedDialog } from "./embedDialog";
import {
  importImpact,
  libraryFileName,
  libraryJSON,
  librarySize,
  parseImport,
  type ImportResult,
} from "./library";
import { DEFAULT_GEOMETRY, type CustomGeometry } from "../engine/customGeometry";
import {
  parseDesign,
  loadUserSlots,
  parseUserSlots,
  DESIGN_STORAGE,
  DESIGN_GROUPS,
  SHAPE_SETTINGS,
  type SavedDesign,
  type SavedShape,
  type DesignGroups,
  type UserSlots,
  DESIGN_IMAGE_MAX_CHARS,
  DESIGN_IMAGE_MAX_SIDE,
} from "./design";
import { DesignHistory } from "./history";
import "./style.css";
import { SHAPE_BANKS, PRESET_BANKS, LAB_BANK_COUNT, LAB_BANK_SIZE, bankLabel } from "./banks";
import { BAKED_SHAPE_SLOTS } from "./bakedLibrary";
import { BAKED_LOOK_SLOTS } from "../looks/particleBakedLooks";
import {
  ParticleRenderer,
  PARTICLE_FORMATION_COUNT,
  particleCount,
  type ParticleDrive,
} from "../engine/renderer";
import { ParticleCycle } from "../engine/particleCycle";

/** The journey sweeps the built-in shapes and the live custom field, not baked formulas. */
const JOURNEY_LAST_FORMATION = 30;
const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = el<HTMLCanvasElement>("field");
const status = el("status");
const input = el<HTMLSelectElement>("input");
const audio = el<HTMLAudioElement>("audio");
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const drive: ParticleDrive = {
  formation: 0,
  formationWeights: Array.from({ length: PARTICLE_FORMATION_COUNT }, (_, i) => Number(i === 0)),
  spread: 0.65,
  dispersion: 0,
  turbulence: 0.25,
  turbulenceScale: 1,
  turbulenceDensity: 1,
  glow: 0.55,
  trail: 0.75,
  ribbonLength: 0.75,
  headSize: 1,
  trailWidth: 1,
  shock: 0.7,
  density: 0.44,
  thickness: 0.25,
  halo: 0.4,
  softness: 0.35,
  focus: 0.5,
  motionTime: 0,
  collapse: 0,
  explosion: 0,
  attraction: 0.7,
  separation: 0.65,
  attractorAngle: 0,
  hue: 0,
  colorVariety: 1,
  low: 0,
  mid: 0,
  high: 0,
  ripple: 0,
  yaw: 0,
  pitch: 0.65,
  roll: 0,
  distance: 4.2,
};
let selectedShapeSlot: number | undefined = 0;
let customWeights: number[] | undefined;
let customGeometry: CustomGeometry | undefined;
let currentPalette: string[] | undefined;
let currentName = "My particle field";
let currentDescription = "A custom particle design.";
let formation = 0,
  speed = 0.45,
  reactivity = 1.0,
  paused = reduced;
const rotation = { x: 0.22, y: 0.35, z: 0.12 };
let attractorOrbit = 0.3;
const cycle = new ParticleCycle();
const cycleSettings = { implosion: 0.9, explosion: 0.65, recovery: 0.45 };
let cycleArmed = true;
let renderer: ParticleRenderer | undefined;
let lastVisible: ParticleDrive | undefined;
let selectionTransition: { from: ParticleDrive; elapsed: number } | undefined;
function beginSelectionTransition() {
  if (lastVisible) selectionTransition = { from: { ...lastVisible }, elapsed: 0 };
}
let companions: ParticleRenderer[] = [];
const systems = el<HTMLSelectElement>("systems");
let context: AudioContext | undefined;
let analyser: AnalyserNode | undefined;
let bins: Uint8Array<ArrayBuffer> | undefined;
let mediaNode: MediaElementAudioSourceNode | undefined;
let microphoneStream: MediaStream | undefined;
let microphoneNode: MediaStreamAudioSourceNode | undefined;
let microphoneStatus = "";
let audioRequest = 0;
let objectUrl: string | undefined;
let fileError = "";
let inputGain = 1;
el<HTMLInputElement>("input-gain").oninput = (event) => {
  inputGain = Number((event.target as HTMLInputElement).value);
  el("input-gain-value").textContent = `${inputGain.toFixed(2)}×`;
};
const clamp = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);
const controls: [string, number, (value: number) => void][] = [
  ["Expansion", drive.spread, (v) => (drive.spread = v)],
  ["Particle dispersion", drive.dispersion ?? 0, (v) => (drive.dispersion = v)],
  ["Turbulence", drive.turbulence, (v) => (drive.turbulence = v)],
  ["Turbulence scale", 1, (v) => (drive.turbulenceScale = v)],
  ["Turbulence density", 1, (v) => (drive.turbulenceDensity = v)],
  ["Light", drive.glow, (v) => (drive.glow = v)],
  ["Halo glow", drive.halo, (v) => (drive.halo = v)],
  ["Depth softness", drive.softness, (v) => (drive.softness = v)],
  ["Focus plane", drive.focus, (v) => (drive.focus = v)],
  ["Ribbon brightness", drive.trail, (v) => (drive.trail = v)],
  ["Ribbon length", drive.ribbonLength, (v) => (drive.ribbonLength = v)],
  ["Trail head size", drive.headSize ?? 1, (v) => (drive.headSize = v)],
  ["Trail thickness", drive.trailWidth ?? 1, (v) => (drive.trailWidth = v)],
  ["Shockwave", drive.shock, (v) => (drive.shock = v)],
  ["Particle density", drive.density, (v) => (drive.density = v)],
  ["Particle thickness", drive.thickness, (v) => (drive.thickness = v)],
  ["Implosion", cycleSettings.implosion, (v) => (cycleSettings.implosion = v)],
  ["Explosion", cycleSettings.explosion, (v) => (cycleSettings.explosion = v)],
  ["Recovery time", cycleSettings.recovery, (v) => (cycleSettings.recovery = v)],
  ["Attraction", drive.attraction, (v) => (drive.attraction = v)],
  ["Attractor separation", drive.separation, (v) => (drive.separation = v)],
  ["Attractor orbit", attractorOrbit, (v) => (attractorOrbit = v)],
  ["Color drift", drive.hue, (v) => (drive.hue = v)],
  ["Color variety", drive.colorVariety ?? 1, (v) => (drive.colorVariety = v)],
  ["Motion", speed, (v) => (speed = v)],
  ["Rotation X", rotation.x, (v) => (rotation.x = v)],
  ["Rotation Y", rotation.y, (v) => (rotation.y = v)],
  ["Rotation Z", rotation.z, (v) => (rotation.z = v)],
  ["Audio depth", reactivity, (v) => (reactivity = v)],
];
const controlGroups: Record<string, string[]> = {
  particles: [
    "Particle density",
    "Particle thickness",
    "Expansion",
    "Particle dispersion",
    "Turbulence",
    "Turbulence scale",
    "Turbulence density",
  ],
  light: ["Light", "Color drift", "Color variety", "Halo glow", "Depth softness", "Focus plane"],
  ribbons: ["Ribbon length", "Ribbon brightness", "Trail head size", "Trail thickness"],
  attractors: ["Attraction", "Attractor separation", "Attractor orbit"],
  motion: ["Motion", "Rotation X", "Rotation Y", "Rotation Z"],
  shock: ["Shockwave"],
  cycle: ["Implosion", "Explosion", "Recovery time"],
  audio: ["Audio depth"],
};
const enabled: Record<string, boolean> = Object.fromEntries(
  Object.keys(controlGroups).map((key) => [key, true]),
);
type ViewKey = "yaw" | "pitch" | "roll" | "distance";
const viewControls: { key: ViewKey; range: HTMLInputElement; output: HTMLOutputElement }[] = [];
for (const [key, name, axis] of [
  ["yaw", "View horizontal", "Y"],
  ["pitch", "View vertical", "X"],
  ["roll", "View roll", "Z"],
  ["distance", "View distance", null],
] as const) {
  const label = document.createElement("label");
  label.className = "control";
  const text = document.createElement("span");
  text.textContent = name;
  const output = document.createElement("output");
  const range = document.createElement("input");
  range.type = "range";
  range.min = key === "distance" ? "3" : "-180";
  range.max = key === "distance" ? "8" : "180";
  range.step = key === "distance" ? "0.01" : "0.1";
  range.setAttribute("aria-label", name);
  range.oninput = () => {
    drive[key] = Number(range.value) * (key === "distance" ? 1 : Math.PI / 180);
    if (axis) {
      const spin = document.querySelector<HTMLInputElement>(
        `input[aria-label="Rotation ${axis}"]`,
      )!;
      spin.value = "0";
      spin.dispatchEvent(new Event("input"));
    }
    syncViewControls();
  };
  label.append(text, output, range);
  el("controls-view").append(label);
  viewControls.push({ key, range, output });
}
function syncViewControls() {
  for (const { key, range, output } of viewControls) {
    const value =
      key === "distance"
        ? drive[key]
        : (((((drive[key] * 180) / Math.PI + 180) % 360) + 360) % 360) - 180;
    const formatted = value.toFixed(key === "distance" ? 2 : 1);
    // Do not round-trip user input: DOM is a readout of the existing camera state.
    if (Math.abs(Number(range.value) - value) > 0.05) range.value = formatted;
    output.value = key === "distance" ? `${formatted}×` : `${formatted}°`;
  }
}
syncViewControls();

for (const [group, names] of Object.entries(controlGroups)) {
  for (const name of names) {
    const [, initial, update] = controls.find(([label]) => label === name)!;
    const label = document.createElement("label");
    const text = document.createElement("span");
    text.textContent = name;
    const output = document.createElement("output");
    const format = (value: number) =>
      name === "Turbulence scale" || name === "Trail head size" || name === "Trail thickness"
        ? `${value.toFixed(2)}×`
        : name === "Color variety"
          ? `${(value + 1).toFixed(1)} colors`
          : name === "Ribbon length"
            ? `${(value * 2.16).toFixed(2)} s`
            : name === "Recovery time"
              ? `${(0.8 + value * 5.2).toFixed(2)} s`
              : name === "Particle density"
                ? particleCount(value, 200_000).toLocaleString()
                : name === "Particle thickness"
                  ? `${(0.35 + value * 2.65).toFixed(2)}×`
                  : value.toFixed(2);
    output.value = format(initial);
    const range = document.createElement("input");
    range.type = "range";
    range.min =
      name === "Turbulence scale"
        ? "0.1"
        : name === "Trail head size"
          ? "1"
          : name === "Trail thickness"
            ? "0.25"
            : "0";
    range.max =
      name === "Turbulence scale"
        ? "8"
        : name === "Color variety"
          ? "5"
          : name === "Expansion" || name === "Trail head size"
            ? "4"
            : name === "Trail thickness"
              ? "16"
              : name === "Ribbon length"
                ? "8"
                : name === "Audio depth" || name === "Particle density"
                  ? "2"
                  : "1";
    range.step = "0.01";
    range.value = String(initial);
    range.setAttribute("aria-label", name);
    range.oninput = () => {
      const v = Number(range.value);
      update(v);
      output.value = format(v);
    };
    label.className = "control";
    label.append(text, output, range);
    el(`controls-${group}`).append(label);
  }
  const fieldset = el(`controls-${group}`).closest("fieldset")!;
  const legend = fieldset.querySelector("legend")!;
  const toggle = document.createElement("input");
  toggle.type = "checkbox";
  toggle.checked = true;
  toggle.setAttribute("role", "switch");
  toggle.setAttribute("aria-label", `Enable ${legend.textContent}`);
  toggle.className = "category-toggle";
  legend.prepend(toggle);
  toggle.onchange = () => {
    enabled[group] = toggle.checked;
    fieldset.classList.toggle("category-disabled", !toggle.checked);
    fieldset
      .querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>(
        "input, select, button",
      )
      .forEach((control) => {
        if (control !== toggle) control.disabled = !toggle.checked;
      });
  };
}
let journeySeconds = 75;
let journeyPhase = 0;
el<HTMLInputElement>("journey-time").oninput = (event) => {
  journeySeconds = Number((event.target as HTMLInputElement).value);
  el<HTMLOutputElement>("journey-time-value").value = `${journeySeconds} s`;
};
el<HTMLInputElement>("journey").onchange = () => {
  // Start at the visible shape; duration edits only change phase velocity.
  journeyPhase = Math.acos(
    Math.max(-1, Math.min(1, 1 - drive.formation / (JOURNEY_LAST_FORMATION / 2))),
  );
};
function chooseForm(value: number) {
  beginSelectionTransition();
  el<HTMLInputElement>("journey").checked = false;
  formation = value;
  customWeights = undefined;
  selectedShapeSlot = undefined;
  refreshShapeSelection();
}
function refreshShapeSelection() {
  document
    .querySelectorAll<HTMLButtonElement>("#lab-shapes [data-shape-slot]")
    .forEach((button) => {
      button.setAttribute(
        "aria-pressed",
        String(Number(button.dataset.shapeSlot) === selectedShapeSlot),
      );
    });
}
const slotDialog = createSlotDialog();
const slotMenu = createSlotMenu();
function mountBanks<T extends { name: string }>(
  navId: string,
  gridId: string,
  kind: string,
  banks: (T | null)[][],
  userKind: "presets" | "shapes",
  builtIns: readonly (readonly (NoInfer<T> | null)[])[],
  makeButton: (item: T) => HTMLButtonElement,
  save: (bank: number, slot: number, overwriteName?: string) => Promise<T | undefined>,
): () => void {
  let selectedBank = 0;
  const nav = el(navId),
    grid = el(gridId);
  const tabs = banks.map((_, bank) => {
    const button = document.createElement("button");
    button.textContent = bankLabel(kind === "Shape" ? "shape" : "preset", bank);
    button.setAttribute("aria-label", `${kind} bank ${bank + 1}`);
    button.onclick = () => {
      selectedBank = bank;
      render();
    };
    nav.append(button);
    return button;
  });
  /** Deletes a saved slot (host + browser); the built-in it covered comes back. */
  async function remove(bank: number, slot: number) {
    const item = banks[bank][slot];
    if (!item) return;
    const builtIn = builtIns[bank][slot];
    const confirmed = await slotDialog({
      title: `Delete ${kind.toLowerCase()}?`,
      description: `Delete “${item.name}” from ${bankLabel(kind === "Shape" ? "shape" : "preset", bank)}, slot ${slot + 1}? ${
        builtIn ? `The built-in “${builtIn.name}” comes back.` : "The slot becomes empty."
      } This cannot be undone.`,
      action: "Delete",
    });
    if (!confirmed) return;
    if (!(await deleteSavedSlot(userKind, String(bank * 16 + slot)))) return;
    banks[bank][slot] = builtIn ?? null;
    render();
    el("design-status").textContent =
      `Deleted “${item.name}”.` + (builtIn ? ` Built-in “${builtIn.name}” restored.` : "");
  }
  /** Replaces an occupied slot with the current design (asks for the name). */
  async function replace(bank: number, slot: number) {
    const item = banks[bank][slot];
    if (!item) return;
    const confirmed = await slotDialog({
      title: `Replace ${kind.toLowerCase()}?`,
      name: item.name,
      description: `Replace “${item.name}” in ${bankLabel(kind === "Shape" ? "shape" : "preset", bank)}, slot ${slot + 1} with the current design?`,
      action: "Replace",
    });
    if (!confirmed) return;
    const saved = await save(bank, slot, confirmed);
    if (saved) {
      banks[bank][slot] = saved;
      render();
    }
  }
  function render() {
    tabs.forEach((tab, bank) => tab.setAttribute("aria-pressed", String(bank === selectedBank)));
    grid.setAttribute("aria-label", `${kind} bank ${selectedBank + 1} slots`);
    grid.replaceChildren(
      ...banks[selectedBank].map((item, slot) => {
        const button = item === null ? document.createElement("button") : makeButton(item);
        button.dataset.slot = String(slot + 1).padStart(2, "0");
        if (kind === "Shape") {
          button.dataset.shapeSlot = String(selectedBank * 16 + slot);
          button.setAttribute(
            "aria-pressed",
            String(selectedShapeSlot === selectedBank * 16 + slot),
          );
        }
        if (item === null) {
          button.textContent = `Empty ${String(slot + 1).padStart(2, "0")}`;
          button.title = "Save current design here";
          button.onclick = async () => {
            const saved = await save(selectedBank, slot);
            if (saved) {
              banks[selectedBank][slot] = saved;
              render();
            }
          };
          button.className = "lab-empty-slot";
        } else {
          const load = button.onclick;
          const bank = selectedBank;
          const isSaved = Boolean(userSlots[userKind][String(bank * 16 + slot)]);
          // Corner badge: hollow = built-in, filled = saved (hover shows × to delete).
          button.classList.add(isSaved ? "slot-saved" : "slot-builtin");
          const badge = document.createElement("span");
          badge.className = "slot-badge";
          badge.setAttribute("aria-hidden", "true");
          button.append(badge);
          const origin = isSaved
            ? `${hostSlots ? "Saved in the host library" : "Saved in this browser"} · × or Delete key to remove`
            : "Built-in";
          button.title = `${button.title ? button.title + " · " : ""}${origin} · Shift+click to replace with the current design`;
          if (isSaved) {
            button.setAttribute("aria-keyshortcuts", "Delete");
            button.onkeydown = (event) => {
              if (event.key !== "Delete" && event.key !== "Backspace") return;
              event.preventDefault();
              void remove(bank, slot);
            };
          }
          button.onclick = async (event) => {
            if (isSaved && (event.target as Element).closest(".slot-badge")) {
              event.preventDefault();
              void remove(bank, slot);
              return;
            }
            if (!event.shiftKey) {
              load?.call(button, event);
              if (kind === "Shape") {
                selectedShapeSlot = bank * 16 + slot;
                refreshShapeSelection();
                commitDesign();
              }
              return;
            }
            void replace(bank, slot);
          };
          // Touch screens: long-press for Replace / Delete (the Shift+click and × equivalents).
          onLongPress(button, async () => {
            const choice = await slotMenu({
              title: item.name,
              description: `${bankLabel(kind === "Shape" ? "shape" : "preset", bank)}, slot ${slot + 1} · ${isSaved ? (hostSlots ? "saved in the host library" : "saved in this browser") : "built-in"}`,
              canDelete: isSaved,
            });
            if (choice === "replace") void replace(bank, slot);
            if (choice === "delete") void remove(bank, slot);
          });
        }
        return button;
      }),
    );
  }
  render();
  return render;
}
let userSlots: UserSlots = { version: 1, presets: {}, shapes: {} };
/** This browser's own backup copy (never replaced by the host library). */
let localSlots: UserSlots = userSlots;
let storageReady = true;
try {
  userSlots = loadUserSlots(localStorage);
  localSlots = userSlots;
} catch {
  storageReady = false;
  el("design-status").textContent =
    "Saved slots could not be read. Existing data has been preserved.";
}
const shapeBanks: (SavedShape | null)[][] = SHAPE_BANKS.map((bank) => [...bank]);
const presetBanks: (SavedDesign | null)[][] = PRESET_BANKS.map((bank) => [...bank]);
for (const [slot, item] of Object.entries(userSlots.shapes)) {
  const n = Number(slot);
  shapeBanks[Math.floor(n / 16)][n % 16] = item;
}
for (const [slot, item] of Object.entries(userSlots.presets)) {
  const n = Number(slot);
  presetBanks[Math.floor(n / 16)][n % 16] = item;
}
/** The dev server keeps ONE shared library (every device and address);
 *  browser storage stays a local backup and the fallback without a host. */
// Relative, so a host serving the Designer under a sub-path also serves its APIs there.
const SLOTS_API = "api/slots";
const GENERATE_API = "api/generate";
/** False on static hosting (e.g. GitHub Pages): AI generation needs the local dev host. */
let aiAvailable = true;
let hostSlots = false;
function putHostSlot(
  kind: "shapes" | "presets",
  key: string,
  item: SavedShape | SavedDesign | null,
) {
  return fetch(SLOTS_API, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, slot: key, item }),
  }).then((response) => {
    if (!response.ok) throw new Error(String(response.status));
  });
}
/** Writes (or with null, removes) one slot in this browser's copy. */
function storeLocally(
  kind: "shapes" | "presets",
  key: string,
  item: SavedShape | SavedDesign | null,
) {
  if (!storageReady) return false;
  const entries = { ...localSlots[kind] } as Record<string, SavedShape | SavedDesign>;
  if (item) entries[key] = item;
  else delete entries[key];
  const next = { ...localSlots, [kind]: entries } as UserSlots;
  try {
    localStorage.setItem(DESIGN_STORAGE, JSON.stringify(next));
    localSlots = next;
    return true;
  } catch {
    return false;
  }
}
async function persistSlot(
  kind: "shapes" | "presets",
  bank: number,
  slot: number,
  item: SavedShape | SavedDesign,
): Promise<boolean> {
  const key = String(bank * 16 + slot);
  const next = { ...userSlots, [kind]: { ...userSlots[kind], [key]: item } };
  let savedOnHost = false;
  if (hostSlots) {
    try {
      await putHostSlot(kind, key, item);
      savedOnHost = true;
    } catch {
      /* fall back to this browser below */
    }
  }
  const savedLocally = storeLocally(kind, key, item);
  if (!savedOnHost && !savedLocally) {
    el("design-status").textContent = storageReady
      ? "Could not save: the host and browser storage are unavailable."
      : "Storage is unavailable; the slot was not saved.";
    return false;
  }
  userSlots = next;
  el("design-status").textContent =
    `${item.name} saved in ${bankLabel(kind === "shapes" ? "shape" : "preset", bank)}, slot ${slot + 1}` +
    (savedOnHost ? "." : " in this browser only (the host library is unavailable).");
  return true;
}
/** Removes a saved slot everywhere it is kept (host library and this browser's copy,
 *  so the browser copy is never re-uploaded). */
async function deleteSavedSlot(kind: "shapes" | "presets", key: string): Promise<boolean> {
  if (hostSlots) {
    try {
      await putHostSlot(kind, key, null);
    } catch {
      el("design-status").textContent = "Could not delete: the host library is unavailable.";
      return false;
    }
  }
  if (!storeLocally(kind, key, null) && !hostSlots) {
    el("design-status").textContent = "Could not delete: browser storage is unavailable.";
    return false;
  }
  const entries = { ...userSlots[kind] } as Record<string, SavedShape | SavedDesign>;
  delete entries[key];
  userSlots = { ...userSlots, [kind]: entries } as UserSlots;
  return true;
}
const renderShapeBanks = mountBanks(
  "shape-banks",
  "lab-shapes",
  "Shape",
  shapeBanks,
  "shapes",
  SHAPE_BANKS,
  (shape) => {
    const button = document.createElement("button");
    button.textContent = shape.name;
    button.dataset.form = String(shape.formation);
    button.setAttribute("aria-pressed", String(shape.formation === formation));
    const geometry = shape.formation === 30 ? (shape.geometry ?? DEFAULT_GEOMETRY) : undefined;
    button.onpointerenter = () => warmGeometry(geometry);
    button.onclick = async () => {
      if (!(await geometryReady(geometry))) return;
      setGeometry(geometry);
      chooseForm(shape.formation);
      customWeights = shape.formationWeights;
      for (const [key, value] of Object.entries(shape.settings ?? {})) setControl(key, value);
      currentName = shape.name;
    };
    return button;
  },
  async (bank, slot, overwriteName) => {
    const name =
      overwriteName ??
      (await slotDialog({
        title: "Save shape",
        description: "Save this geometry to reuse with other colors and viewpoints.",
        name: currentName,
        action: "Save shape",
      }));
    if (!name) return;
    const current = captureDesign();
    const shape: SavedShape = {
      name: name.slice(0, 80),
      formation: current.formation,
      formationWeights: current.formationWeights,
      geometry: current.geometry,
      settings: Object.fromEntries(SHAPE_SETTINGS.map((key) => [key, current.settings[key]])),
    };
    return (await persistSlot("shapes", bank, slot, shape)) ? shape : undefined;
  },
);
/** Applies a look. The audio input is left alone (default: No modulation). */
function applyLabPreset(preset: SavedDesign) {
  setGeometry(preset.formation === 30 ? (preset.geometry ?? DEFAULT_GEOMETRY) : undefined);
  currentPalette = preset.palette;
  drive.palette = currentPalette?.flatMap((color) =>
    [1, 3, 5].map((at) => parseInt(color.slice(at, at + 2), 16) / 255),
  );
  currentName = preset.name;
  currentDescription = preset.description;
  chooseForm(preset.formation);
  customWeights = preset.formationWeights;
  systems.value = "1";
  systems.dispatchEvent(new Event("change"));
  for (const toggle of document.querySelectorAll<HTMLInputElement>(".category-toggle")) {
    const group = DESIGN_GROUPS.find((key) =>
      toggle.closest("fieldset")!.querySelector(`#controls-${key}`),
    );
    const checked =
      (group && preset.groups?.[group]) ??
      (toggle.closest("fieldset")!.querySelector("#controls-shock")
        ? (preset.shockEnabled ?? false)
        : toggle.closest("fieldset")!.querySelector("#controls-audio")
          ? (preset.audioEnabled ?? true)
          : toggle.closest("fieldset")!.querySelector("#controls-attractors")
            ? (preset.attractorsEnabled ?? true)
            : true);
    if (toggle.checked !== checked) {
      toggle.checked = checked;
      toggle.dispatchEvent(new Event("change"));
    }
  }
  const settings = {
    ...Object.fromEntries(controls.map(([name, value]) => [name, value])),
    Attraction: 0,
    "Audio depth": 0,
    "Rotation X": 0,
    "Rotation Y": 0,
    "Rotation Z": 0,
    ...preset.settings,
  };
  for (const [name, value] of Object.entries(settings)) {
    const slider = document.querySelector<HTMLInputElement>(`input[aria-label="${name}"]`)!;
    slider.value = String(value);
    slider.dispatchEvent(new Event("input"));
  }
  drive.yaw = (preset.view[0] * Math.PI) / 180;
  drive.pitch = (preset.view[1] * Math.PI) / 180;
  drive.roll = (preset.view[2] * Math.PI) / 180;
  drive.distance = preset.view[3];
  syncViewControls();
  el<HTMLInputElement>("journey-time").value = "75";
  el("journey-time").dispatchEvent(new Event("input"));
  el<HTMLInputElement>("cycle-audio").checked = preset.cycleAudio ?? false;
}
const renderPresetBanks = mountBanks(
  "preset-banks",
  "lab-presets",
  "Preset",
  presetBanks,
  "presets",
  PRESET_BANKS,
  (preset) => {
    const button = document.createElement("button");
    button.id = `${preset.id}-preset`;
    button.textContent = preset.name;
    button.title = preset.description;
    const geometry = preset.formation === 30 ? (preset.geometry ?? DEFAULT_GEOMETRY) : undefined;
    button.onpointerenter = () => warmGeometry(geometry);
    button.onclick = async () => {
      if (!(await geometryReady(geometry))) return;
      applyLabPreset(preset);
      commitDesign();
    };
    return button;
  },
  async (bank, slot, overwriteName) => {
    const name =
      overwriteName ??
      (await slotDialog({
        title: "Save preset",
        description: "Save the complete look, including geometry, color, movement and viewpoint.",
        name: currentName,
        action: "Save preset",
      }));
    if (!name) return;
    const preset = { ...captureDesign(), name: name.slice(0, 80), id: `user-${bank}-${slot}` };
    return (await persistSlot("presets", bank, slot, preset)) ? preset : undefined;
  },
);
/** Loads the shared host library and uploads slots saved only in this
 *  browser (the pre-host library) that the host does not have yet. */
async function syncHostSlots() {
  let host: UserSlots;
  try {
    const response = await fetch(SLOTS_API, { cache: "no-store" });
    if (!response.ok) throw new Error(String(response.status));
    host = parseUserSlots(await response.json());
  } catch {
    warmSavedGeometries();
    return; // static build or older host: keep the browser library
  }
  hostSlots = true;
  let uploaded = 0,
    differing = 0;
  for (const kind of ["presets", "shapes"] as const) {
    for (const [key, item] of Object.entries(userSlots[kind])) {
      const remote = host[kind][key];
      // Already promoted to a factory slot by a bake: keep this browser's copy local.
      const baked = (kind === "presets" ? BAKED_LOOK_SLOTS : BAKED_SHAPE_SLOTS)[Number(key)];
      if (!remote && baked?.name === item.name) continue;
      if (remote) {
        if (JSON.stringify(remote) !== JSON.stringify(item)) differing++;
        continue;
      }
      try {
        await putHostSlot(kind, key, item);
        (host[kind] as Record<string, SavedShape | SavedDesign>)[key] = item;
        uploaded++;
      } catch {
        /* stays in this browser; retried on the next load */
      }
    }
  }
  userSlots = host;
  PRESET_BANKS.forEach((bank, b) => (presetBanks[b] = [...bank]));
  SHAPE_BANKS.forEach((bank, b) => (shapeBanks[b] = [...bank]));
  for (const [key, item] of Object.entries(host.presets))
    presetBanks[Math.floor(Number(key) / 16)][Number(key) % 16] = item;
  for (const [key, item] of Object.entries(host.shapes))
    shapeBanks[Math.floor(Number(key) / 16)][Number(key) % 16] = item;
  renderPresetBanks();
  renderShapeBanks();
  warmSavedGeometries();
  if (uploaded || differing)
    el("design-status").textContent = [
      uploaded
        ? `${uploaded} saved slot${uploaded === 1 ? "" : "s"} from this browser moved to the shared host library.`
        : "",
      differing
        ? `${differing} slot${differing === 1 ? " differs" : "s differ"} from the host library; the host version is shown (this browser keeps its copy).`
        : "",
    ]
      .filter(Boolean)
      .join(" ");
}
void syncHostSlots();
function downloadText(text: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
el("library-export").onclick = () => {
  const count = librarySize(userSlots);
  if (!count) {
    el("design-status").textContent = "Nothing saved yet: save a preset or shape first.";
    return;
  }
  downloadText(libraryJSON(userSlots), libraryFileName());
  el("design-status").textContent =
    `Exported ${count} saved slot${count === 1 ? "" : "s"}. Import the file here or in another browser.`;
};
el("library-import").onclick = () => el("library-file").click();
el<HTMLInputElement>("library-file").onchange = async (event) => {
  const picker = event.target as HTMLInputElement;
  const file = picker.files?.[0];
  picker.value = "";
  if (!file) return;
  let result: ImportResult;
  try {
    result = parseImport(JSON.parse(await file.text()));
  } catch (error) {
    el("design-status").textContent =
      `Could not import ${file.name}: ${error instanceof Error ? error.message : "invalid file"}`;
    return;
  }
  if (result.type === "look") {
    const design = result.design;
    if (!(await geometryReady(design.formation === 30 ? design.geometry : undefined))) return;
    commitDesign();
    applyLabPreset(design);
    commitDesign();
    el("design-status").textContent =
      `Imported “${design.name}”. Click an empty preset slot to save it.`;
    return;
  }
  const incoming = result.slots;
  const count = librarySize(incoming);
  if (!count) {
    el("design-status").textContent = `${file.name} has no saved slots.`;
    return;
  }
  const presets = Object.keys(incoming.presets).length,
    shapes = Object.keys(incoming.shapes).length;
  const impact = importImpact(userSlots, incoming, {
    presets: PRESET_BANKS.flat(),
    shapes: SHAPE_BANKS.flat(),
  });
  const confirmed = await slotDialog({
    title: "Import library?",
    description:
      `${file.name}: ${presets} preset${presets === 1 ? "" : "s"} and ${shapes} shape${shapes === 1 ? "" : "s"}, into the same banks and slots.` +
      (impact.replacesSaved
        ? ` ${impact.replacesSaved} will replace slot${impact.replacesSaved === 1 ? "" : "s"} you already saved.`
        : "") +
      (impact.coversBuiltIn
        ? ` ${impact.coversBuiltIn} will cover built-in slot${impact.coversBuiltIn === 1 ? "" : "s"} (delete them later to bring the built-ins back).`
        : ""),
    action: "Import",
  });
  if (!confirmed) return;
  let failed = 0;
  for (const kind of ["presets", "shapes"] as const) {
    const banks: (SavedShape | SavedDesign | null)[][] =
      kind === "presets" ? presetBanks : shapeBanks;
    for (const [key, item] of Object.entries(incoming[kind]) as [
      string,
      SavedShape | SavedDesign,
    ][]) {
      let savedOnHost = false;
      if (hostSlots)
        savedOnHost = await putHostSlot(kind, key, item).then(
          () => true,
          () => false,
        );
      if (!storeLocally(kind, key, item) && !savedOnHost) {
        failed++;
        continue;
      }
      userSlots = { ...userSlots, [kind]: { ...userSlots[kind], [key]: item } } as UserSlots;
      banks[Math.floor(Number(key) / 16)][Number(key) % 16] = item;
    }
  }
  renderPresetBanks();
  renderShapeBanks();
  warmSavedGeometries();
  el("design-status").textContent =
    `Imported ${count - failed} of ${count} slot${count === 1 ? "" : "s"} ${hostSlots ? "into the host library" : "into this browser"}.` +
    (failed ? ` ${failed} could not be saved.` : "");
};
function prepareAnalyser() {
  context ??= new AudioContext();
  if (!analyser) {
    analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    bins = new Uint8Array(analyser.frequencyBinCount);
  }
  return { context, analyser };
}
function stopMicrophone() {
  microphoneNode?.disconnect();
  microphoneNode = undefined;
  microphoneStream?.getTracks().forEach((track) => track.stop());
  microphoneStream = undefined;
}
async function startMicrophone(request: number) {
  microphoneStatus = "Allow microphone access in your browser…";
  try {
    const graph = prepareAnalyser();
    await graph.context.resume();
    if (request !== audioRequest || input.value !== "microphone") return;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      video: false,
    });
    if (request !== audioRequest || input.value !== "microphone") {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    microphoneStream = stream;
    microphoneNode = graph.context.createMediaStreamSource(stream);
    // Analysis only: the microphone never connects to the speakers.
    microphoneNode.connect(graph.analyser);
    const track = stream.getAudioTracks()[0];
    microphoneStatus = `Listening · ${track?.label || "Mac microphone"}`;
    track?.addEventListener("ended", () => {
      if (microphoneStream !== stream) return;
      stopMicrophone();
      microphoneStatus =
        "Microphone disconnected. Select another input, then Mac microphone to retry.";
    });
  } catch (error) {
    if (request !== audioRequest) return;
    stopMicrophone();
    microphoneStatus =
      error instanceof DOMException && error.name === "NotAllowedError"
        ? "Microphone access denied. Allow it in browser settings, then select Mac microphone again."
        : `Microphone unavailable: ${error instanceof Error ? error.message : String(error)}`;
  }
}
function modeChanged() {
  const request = ++audioRequest;
  stopMicrophone();
  analyser?.disconnect();
  mediaNode?.disconnect();
  previousLow = 0;
  if (input.value === "microphone") void startMicrophone(request);
  if (input.value === "file" && mediaNode && analyser && context) {
    mediaNode.connect(analyser);
    analyser.connect(context.destination);
    void context.resume().catch(() => {});
  }
  if (input.value !== "file") audio.pause();
}
input.onchange = modeChanged;
el<HTMLInputElement>("file").onchange = async (event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  audio.pause();
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = URL.createObjectURL(file);
  audio.src = objectUrl;
  input.value = "file";
  modeChanged();
  fileError = "";
  try {
    const graph = prepareAnalyser();
    mediaNode ??= graph.context.createMediaElementSource(audio);
    mediaNode.disconnect();
    graph.analyser.disconnect();
    mediaNode.connect(graph.analyser);
    graph.analyser.connect(graph.context.destination);
    const request = audioRequest;
    await graph.context.resume();
    if (request === audioRequest && input.value === "file") await audio.play();
  } catch (error) {
    fileError = `Audio could not start: ${String(error)}`;
  }
};
audio.addEventListener(
  "error",
  () => (fileError = "This audio file could not be decoded. Choose another file."),
);
function toggleControls() {
  const hidden = document.body.classList.toggle("clean");
  el("panel").inert = hidden;
  el("reveal").hidden = !hidden;
  // Never focus Show controls: a focused button would swallow Space/Enter.
  if (hidden) (document.activeElement as HTMLElement | null)?.blur();
}
el("hide").onclick = toggleControls;
el("reveal").onclick = toggleControls;
function togglePause() {
  paused = !paused;
  el("pause").textContent = paused ? "Resume" : "Pause";
}
el("pause").textContent = paused ? "Resume" : "Pause";
el("pause").onclick = togglePause;
let burst = 0;
function triggerCycle() {
  if (!enabled.cycle) return;
  if (paused) {
    el("cycle-status").textContent = "Resume motion before launching a cycle";
    return;
  }
  if (!cycle.trigger(time, { ...cycleSettings, recoveryMs: 800 + cycleSettings.recovery * 5200 })) {
    el("cycle-status").textContent = "Cycle in progress — let it reform before launching again";
  }
}
el("cycle").onclick = triggerCycle;
el("burst").onclick = () => {
  if (enabled.shock) burst = 1;
};
async function fullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    status.textContent = "Fullscreen is unavailable in this browser.";
  }
}
el("fullscreen").onclick = () => void fullscreen();
window.addEventListener("keydown", (event) => {
  if ((event.target as HTMLElement).closest("input,textarea,select,button,audio") || event.repeat)
    return;
  if (event.code === "Space") {
    event.preventDefault();
    if (enabled.shock) burst = 1;
  }
  if (event.key.toLowerCase() === "e") triggerCycle();
  if (event.key.toLowerCase() === "h") toggleControls();
  if (event.key.toLowerCase() === "f") void fullscreen();
  if (["1", "2", "3", "4", "5", "6", "7", "8", "9"].includes(event.key)) {
    chooseForm(Number(event.key) - 1);
    commitDesign();
  }
});
let pointer: { x: number; y: number } | undefined;
canvas.onpointerdown = (e) => {
  pointer = { x: e.clientX, y: e.clientY };
  canvas.setPointerCapture(e.pointerId);
};
canvas.onpointermove = (e) => {
  if (!pointer) return;
  drive.yaw += (e.clientX - pointer.x) * 0.005;
  drive.pitch += (e.clientY - pointer.y) * 0.005;
  pointer = { x: e.clientX, y: e.clientY };
};
canvas.onpointerup = canvas.onpointercancel = () => (pointer = undefined);
canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    drive.distance = Math.max(3, Math.min(8, drive.distance + e.deltaY * 0.003));
  },
  { passive: false },
);
function resize() {
  const ratio = Math.min(devicePixelRatio, 1.5, 1920 / innerWidth, 1080 / innerHeight);
  canvas.width = Math.max(1, Math.round(innerWidth * ratio));
  canvas.height = Math.max(1, Math.round(innerHeight * ratio));
}
window.addEventListener("resize", resize);
resize();
canvas.addEventListener("webglcontextlost", (e) => {
  e.preventDefault();
  status.textContent = "GPU context lost. Waiting for recovery…";
});
canvas.addEventListener("webglcontextrestored", () => {
  renderer?.dispose();
  companions.forEach((item) => item.dispose());
  companions = [];
  startRenderer();
});
function updateSystems() {
  companions.forEach((item) => item.dispose());
  companions = [];
  if (systems.value === "4") {
    try {
      for (let i = 0; i < 3; i++)
        companions.push(new ParticleRenderer(canvas, 200_000, customGeometry ?? DEFAULT_GEOMETRY));
    } catch (error) {
      companions.forEach((item) => item.dispose());
      companions = [];
      systems.value = "1";
      status.textContent = `Four systems could not start: ${String(error)}`;
    }
  }
}
systems.onchange = updateSystems;
function startRenderer() {
  try {
    renderer = new ParticleRenderer(canvas, 200_000, customGeometry ?? DEFAULT_GEOMETRY);
    updateSystems();
  } catch (e) {
    status.textContent = String(e);
  }
}
startRenderer();
let last = performance.now(),
  time = 0,
  raf = 0,
  frames = 0,
  reportAt = last,
  previousLow = 0;
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  let low = 0,
    mid = 0,
    high = 0,
    transient = 0;
  let message = "No audio modulation";
  if (input.value === "demo") {
    low = Math.exp(-(((time / 1000) * 2) % 1) * 7) * 0.8;
    mid = 0.3 + Math.sin(time / 1300) * 0.2;
    high = Math.pow(Math.max(0, Math.sin(time / 120)), 8) * 0.6;
    transient = low;
    message = "Silent demo modulation";
  } else if (input.value === "file" || input.value === "microphone") {
    const microphone = input.value === "microphone";
    message = microphone
      ? microphoneStatus
      : fileError || (audio.paused ? "Load an audio file or press play" : "Audio file playing");
    const receiving = microphone ? Boolean(microphoneStream?.active) : !audio.paused;
    if (analyser && bins && context && receiving) {
      analyser.getByteFrequencyData(bins);
      const band = (from: number, to: number) => {
        const start = Math.max(1, Math.floor((from * analyser!.fftSize) / context!.sampleRate));
        const end = Math.min(
          bins!.length,
          Math.ceil((to * analyser!.fftSize) / context!.sampleRate),
        );
        let sum = 0;
        for (let i = start; i < end; i++) sum += (bins![i] / 255) ** 2;
        return Math.sqrt(sum / Math.max(1, end - start));
      };
      low = band(20, 250);
      mid = band(250, 4000);
      high = band(4000, 16000);
      transient = Math.max(0, low - previousLow) * 5;
      previousLow = low;
    }
  }
  low = clamp(low * inputGain);
  mid = clamp(mid * inputGain);
  high = clamp(high * inputGain);
  transient = clamp(transient * inputGain);
  if (!paused && !document.hidden) {
    time += dt * 1000;
    drive.customMix = Math.min(1, (drive.customMix ?? 1) + dt / 1.8);
    if (enabled.motion) drive.motionTime += dt * 1000 * (0.15 + speed * 1.8);
    if (enabled.attractors) drive.attractorAngle += dt * attractorOrbit * 0.8;
    if (transient < 0.12) cycleArmed = true;
    if (transient > 0.3 && cycleArmed) {
      cycleArmed = false;
      if (enabled.audio && el<HTMLInputElement>("cycle-audio").checked) triggerCycle();
    }
    const state = cycle.at(time);
    drive.collapse = state.collapse;
    drive.explosion = state.explosion;
    el("cycle-status").textContent = state.phase;
    const journey = el<HTMLInputElement>("journey").checked;
    if (journey && enabled.motion)
      journeyPhase = (journeyPhase + (dt * Math.PI * 2) / journeySeconds) % (Math.PI * 2);
    const targetFormation = journey
      ? (JOURNEY_LAST_FORMATION / 2) * (1 - Math.cos(journeyPhase))
      : formation;
    drive.formation += (targetFormation - drive.formation) * (1 - Math.exp(-dt * 2));
    // Manual choice blends the visible mixture straight to the chosen shape.
    // Immutable arrays preserve ribbon history and interrupted selections.
    const targetWeights = Array.from({ length: PARTICLE_FORMATION_COUNT }, (_, i) =>
      journey
        ? Math.max(0, 1 - Math.abs(i - targetFormation))
        : (customWeights?.[i] ?? Number(i === formation)),
    );
    const blend = 1 - Math.exp(-dt * 2);
    drive.formationWeights = targetWeights.map(
      (weight, i) => (drive.formationWeights?.[i] ?? 0) * (1 - blend) + weight * blend,
    );
    const smoothing = 1 - Math.exp(-dt * 9);
    drive.low += (clamp(low) * reactivity - drive.low) * smoothing;
    drive.mid += (clamp(mid) * reactivity - drive.mid) * smoothing;
    drive.high += (clamp(high) * reactivity - drive.high) * smoothing;
    burst *= Math.exp(-dt * 2.8);
    drive.ripple += (Math.max(burst, clamp(transient) * reactivity) - drive.ripple) * smoothing;
    if (!pointer && enabled.motion) {
      // Independent slow tumbling; dragging temporarily takes over the view.
      const turn = dt * 0.6;
      drive.pitch = (drive.pitch + turn * rotation.x) % (Math.PI * 2);
      drive.yaw = (drive.yaw + turn * rotation.y) % (Math.PI * 2);
      drive.roll = (drive.roll + turn * rotation.z) % (Math.PI * 2);
    }
  }
  if (!document.hidden && renderer) {
    syncViewControls();
    const visible = { ...drive };
    if (!enabled.particles)
      Object.assign(visible, {
        density: 0.44,
        thickness: 0.25,
        spread: 0.65,
        dispersion: 0,
        turbulence: 0,
      });
    if (!enabled.light)
      Object.assign(visible, {
        glow: 0.55,
        hue: 0,
        colorVariety: 1,
        halo: 0,
        softness: 0,
        focus: 0.5,
      });
    if (!enabled.ribbons) visible.trail = 0;
    if (!enabled.attractors) visible.attraction = 0;
    if (!enabled.cycle) Object.assign(visible, { collapse: 0, explosion: 0 });
    if (!enabled.audio) Object.assign(visible, { low: 0, mid: 0, high: 0, ripple: burst });
    if (!enabled.shock) Object.assign(visible, { shock: 0, ripple: 0 });
    if (selectionTransition) {
      selectionTransition.elapsed += dt;
      const t = Math.min(1, selectionTransition.elapsed / 1.8);
      const eased = t * t * (3 - 2 * t);
      const from = selectionTransition.from;
      for (const key of Object.keys(visible) as (keyof ParticleDrive)[]) {
        if (
          [
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
          ].includes(key)
        )
          continue;
        const start = from[key],
          end = visible[key];
        if (typeof start !== "number" || typeof end !== "number") continue;
        const delta = ["yaw", "pitch", "roll"].includes(key)
          ? ((end - start + Math.PI * 3) % (Math.PI * 2)) - Math.PI
          : end - start;
        (visible as unknown as Record<string, unknown>)[key] = start + delta * eased;
      }
      if (t === 1) selectionTransition = undefined;
    }
    lastVisible = { ...visible };
    if (companions.length === 3) {
      const all = [renderer, ...companions];
      const total = particleCount(visible.density, 200_000);
      const halfW = Math.floor(canvas.width / 2),
        halfH = Math.floor(canvas.height / 2);
      all.forEach((item, i) => {
        const left = i % 2 === 0;
        const top = i < 2;
        item.render(
          time,
          {
            ...visible,
            formation: i === 0 ? drive.formation : [0, 1, 2, 3][i],
            formationWeights: i === 0 ? drive.formationWeights : undefined,
            hue: enabled.light ? (visible.hue + i * 0.23) % 1 : 0,
            yaw: drive.yaw * (i % 2 === 0 ? 1 : -1) + i * 0.8,
            pitch: drive.pitch + i * 0.4,
            roll: drive.roll * (i % 2 === 0 ? 1 : -1),
          },
          {
            x: left ? 0 : halfW,
            y: top ? halfH : 0,
            width: left ? halfW : canvas.width - halfW,
            height: top ? canvas.height - halfH : halfH,
            count: Math.floor(total / 4) + (i < total % 4 ? 1 : 0),
          },
        );
      });
    } else renderer.render(time, visible);
  }
  frames++;
  if (now - reportAt > 500) {
    const active = renderer ? [renderer, ...companions] : [];
    const count = active.reduce((sum, item) => sum + item.count, 0);
    const gpuMs =
      active.length && active.every((item) => item.gpuMs !== null)
        ? active.reduce((sum, item) => sum + item.gpuMs!, 0)
        : null;
    el("stats").textContent =
      `${renderer ? `${count.toLocaleString()} particles / ${active.length} system${active.length === 1 ? "" : "s"}` : "Renderer unavailable"} / ${Math.round((frames * 1000) / (now - reportAt))} fps / ${gpuMs != null ? `GPU ${gpuMs.toFixed(1)} ms · ${Math.round((gpuMs / 16.67) * 100)}% of 60 fps budget` : "GPU timing unavailable"}`;
    if (renderer && !canvas.getContext("webgl2")?.isContextLost())
      status.textContent = paused ? "Motion paused — Resume to animate" : message;
    for (const [id, value] of [
      ["low", low],
      ["mid", mid],
      ["high", high],
    ] as const)
      el<HTMLMeterElement>(id).value = clamp(value);
    reportAt = now;
    frames = 0;
  }
  raf = requestAnimationFrame(frame);
}
raf = requestAnimationFrame(frame);
window.addEventListener("pagehide", () => {
  ++audioRequest;
  stopMicrophone();
  cancelAnimationFrame(raf);
  renderer?.dispose();
  companions.forEach((item) => item.dispose());
  audio.pause();
  void context?.close();
  if (objectUrl) URL.revokeObjectURL(objectUrl);
});

function setGeometry(geometry: CustomGeometry | undefined) {
  // Keep the outgoing custom formula alive while its formation weight fades out.
  if (!geometry || JSON.stringify(geometry) === JSON.stringify(customGeometry)) return;
  // Switch programs in place (prepared ones are instant). A failed candidate keeps the old field.
  renderer?.setGeometry(geometry, customGeometry ?? DEFAULT_GEOMETRY);
  drive.customMix = 0;
  customGeometry = geometry;
  updateSystems();
  warmQueue.length = 0; // queued pairs started from the outgoing shape
}
/**
 * Custom shapes are compiled into the particle shader (together with the shape
 * they fade from), which takes long enough to freeze the page. Clicks wait for
 * a background compile instead, and idle time pre-compiles every saved custom
 * shape against the current one so most switches are instant.
 */
let readyToken = 0;
function geometryReady(geometry: CustomGeometry | undefined): Promise<boolean> {
  const token = ++readyToken;
  const previous = customGeometry ?? DEFAULT_GEOMETRY;
  if (!renderer || !geometry || JSON.stringify(geometry) === JSON.stringify(customGeometry))
    return Promise.resolve(true);
  return new Promise((resolve) => {
    let shown = false;
    const poll = () => {
      // A newer click supersedes this one; the latest choice wins.
      if (token !== readyToken) return resolve(false);
      let ready: boolean;
      try {
        ready = renderer?.prepareGeometry(geometry, previous) ?? true;
      } catch {
        ready = true; // setGeometry reports the compile error and keeps the field
      }
      if (ready) {
        if (shown) el("design-status").textContent = "";
        return resolve(true);
      }
      if (!shown) el("design-status").textContent = "Preparing shape…";
      shown = true;
      setTimeout(poll, 16);
    };
    poll();
  });
}
const warmQueue: CustomGeometry[] = [];
let warming = false;
function warmGeometry(geometry: CustomGeometry | undefined, urgent = true) {
  if (!geometry) return;
  if (urgent) warmQueue.unshift(geometry);
  else warmQueue.push(geometry);
  if (!warming) {
    warming = true;
    setTimeout(warmNext, 0);
  }
}
/** One background compile at a time, so warm-up never competes with the show. */
function warmNext() {
  const previous = customGeometry ?? DEFAULT_GEOMETRY;
  while (warmQueue.length && renderer) {
    try {
      if (!renderer.prepareGeometry(warmQueue[0], previous)) {
        setTimeout(warmNext, 50);
        return;
      }
    } catch {
      /* invalid shapes report when chosen */
    }
    warmQueue.shift();
  }
  warming = false;
}
/** Queues every saved custom shape (presets first) against the current shape. */
function warmSavedGeometries() {
  const seen = new Set<string>();
  for (const bank of [...presetBanks, ...shapeBanks])
    for (const item of bank)
      if (item?.formation === 30 && item.geometry) {
        const key = JSON.stringify(item.geometry);
        if (seen.has(key) || key === JSON.stringify(customGeometry)) continue;
        seen.add(key);
        warmGeometry(item.geometry, false);
      }
}
function setControl(name: string, value: number) {
  const slider = document.querySelector<HTMLInputElement>(`input[aria-label="${name}"]`);
  if (slider) {
    slider.value = String(value);
    slider.dispatchEvent(new Event("input"));
  }
}
function captureDesign(): SavedDesign {
  const degrees = (v: number) => (((((v * 180) / Math.PI + 180) % 360) + 360) % 360) - 180;
  return parseDesign({
    id: "current",
    name: currentName,
    description: currentDescription,
    formation,
    palette: currentPalette,
    geometry: formation === 30 ? (customGeometry ?? DEFAULT_GEOMETRY) : undefined,
    formationWeights: customWeights,
    view: [degrees(drive.yaw), degrees(drive.pitch), degrees(drive.roll), drive.distance],
    settings: Object.fromEntries(
      controls.map(([name]) => [
        name,
        Number(document.querySelector<HTMLInputElement>(`input[aria-label="${name}"]`)!.value),
      ]),
    ),
    groups: { ...enabled },
    cycleAudio: el<HTMLInputElement>("cycle-audio").checked,
  });
}
type AuthoringState = {
  design: SavedDesign;
  gain: number;
  systems: string;
  journey: boolean;
  journeySeconds: number;
  journeyPhase: number;
  selectedShapeSlot?: number;
  audioInput: string;
};
const designHistory = new DesignHistory<AuthoringState>();
let restoring = false;
function updateHistoryButtons() {
  el<HTMLButtonElement>("design-undo").disabled = !designHistory.canUndo;
  el<HTMLButtonElement>("design-redo").disabled = !designHistory.canRedo;
}
function commitDesign() {
  if (restoring) return;
  designHistory.push({
    design: captureDesign(),
    gain: inputGain,
    systems: systems.value,
    journey: el<HTMLInputElement>("journey").checked,
    journeySeconds,
    journeyPhase,
    selectedShapeSlot,
    audioInput: input.value,
  });
  updateHistoryButtons();
}
function restoreDesign(value: AuthoringState | undefined) {
  if (!value) return;
  restoring = true;
  try {
    applyLabPreset(value.design);
    systems.value = value.systems;
    updateSystems();
    el<HTMLInputElement>("input-gain").value = String(value.gain);
    el("input-gain").dispatchEvent(new Event("input"));
    el<HTMLInputElement>("journey-time").value = String(value.journeySeconds);
    el("journey-time").dispatchEvent(new Event("input"));
    el<HTMLInputElement>("journey").checked = value.journey;
    journeyPhase = value.journeyPhase;
    selectedShapeSlot = value.selectedShapeSlot;
    refreshShapeSelection();
    if (input.value !== value.audioInput) {
      input.value = value.audioInput;
      modeChanged();
    }
  } finally {
    restoring = false;
  }
  updateHistoryButtons();
}
el("design-undo").onclick = () => restoreDesign(designHistory.undo());
el("design-redo").onclick = () => restoreDesign(designHistory.redo());
const openEmbedDialog = createEmbedDialog();
el("embed").onclick = () => openEmbedDialog(captureDesign());
let sliderDrag = false;
const panel = document.querySelector("aside")!;
panel.addEventListener("pointerdown", (event) => {
  if ((event.target as HTMLElement).matches('input[type="range"]')) sliderDrag = true;
});
panel.addEventListener("change", () => {
  if (!sliderDrag) commitDesign();
});
const finishSliderDrag = () => {
  if (!sliderDrag) return;
  sliderDrag = false;
  commitDesign();
};
document.addEventListener("pointerup", finishSliderDrag);
document.addEventListener("pointercancel", finishSliderDrag);
canvas.addEventListener("pointerup", commitDesign);
let wheelCommit: ReturnType<typeof setTimeout>;
canvas.addEventListener("wheel", () => {
  clearTimeout(wheelCommit);
  wheelCommit = setTimeout(commitDesign, 250);
});
window.addEventListener("keydown", (event) => {
  if ((event.target as HTMLElement).closest("input,textarea,select")) return;
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    restoreDesign(event.shiftKey ? designHistory.redo() : designHistory.undo());
  }
});
/** The Designer opens on Galaxy drift (P1, slot 2), shown at once. */
const STARTUP_PRESET = { id: "galaxy-drift", bank: 0, slot: 1 };
const startupLook = PRESET_BANKS[STARTUP_PRESET.bank][STARTUP_PRESET.slot];
if (startupLook?.id === STARTUP_PRESET.id) {
  applyLabPreset(startupLook);
  selectionTransition = undefined;
  drive.formation = formation;
  drive.formationWeights = Array.from(
    { length: PARTICLE_FORMATION_COUNT },
    (_, i) => customWeights?.[i] ?? Number(i === formation),
  );
}
commitDesign();
const PROMPT_HISTORY_KEY = "particles-designer.prompts.v1";
let promptHistory: string[] = [];
try {
  const saved: unknown = JSON.parse(localStorage.getItem(PROMPT_HISTORY_KEY) ?? "[]");
  if (Array.isArray(saved))
    promptHistory = saved
      .filter(
        (item): item is string =>
          typeof item === "string" && item.length > 0 && item.length <= 2000,
      )
      .slice(-50);
} catch {
  /* Prompt recall remains available for this session. */
}
let promptCursor = promptHistory.length;
function rememberPrompt(prompt: string) {
  if (promptHistory[promptHistory.length - 1] !== prompt) promptHistory.push(prompt);
  promptHistory = promptHistory.slice(-50);
  promptCursor = promptHistory.length;
  try {
    localStorage.setItem(PROMPT_HISTORY_KEY, JSON.stringify(promptHistory));
  } catch {
    /* Keep session history. */
  }
}
// Optional inspiration photo: downscaled to a JPEG data URL in the browser, sent
// with the next prompt only (never saved to designs, history or storage).
let inspiration: string | undefined;
function setInspiration(dataUrl: string | undefined) {
  inspiration = dataUrl;
  const chip = el("design-image");
  chip.hidden = !dataUrl;
  chip.querySelector("img")!.src = dataUrl ?? "";
}
async function attachPhoto(file: File | undefined) {
  // No attaching while a design is generating (drop/paste bypass the button).
  if (!file?.type.startsWith("image/") || el<HTMLButtonElement>("design-attach").disabled) return;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, DESIGN_IMAGE_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    if (dataUrl.length > DESIGN_IMAGE_MAX_CHARS) throw new Error();
    setInspiration(dataUrl);
    el("design-status").textContent = "Photo attached as inspiration for the next design.";
  } catch {
    el("design-status").textContent = "This photo could not be read. Try a JPEG or PNG.";
  }
}
el("design-attach").onclick = () => el<HTMLInputElement>("design-image-file").click();
el<HTMLInputElement>("design-image-file").onchange = (event) => {
  const input = event.currentTarget as HTMLInputElement;
  void attachPhoto(input.files?.[0]);
  input.value = "";
};
el("design-image-remove").onclick = () => setInspiration(undefined);
el("design-request").addEventListener("paste", (event) => {
  const file = [...(event.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
  if (!file) return;
  event.preventDefault();
  void attachPhoto(file);
});
el("design-prompt").addEventListener("dragover", (event) => event.preventDefault());
el("design-prompt").addEventListener("drop", (event) => {
  const file = [...(event.dataTransfer?.files ?? [])].find((f) => f.type.startsWith("image/"));
  if (!file) return;
  event.preventDefault();
  void attachPhoto(file);
});
el<HTMLFormElement>("design-prompt").onsubmit = async (event) => {
  event.preventDefault();
  const button = el<HTMLButtonElement>("design-generate");
  if (button.disabled) return;
  const typed = el<HTMLTextAreaElement>("design-request").value.trim();
  if (!typed && !inspiration) return;
  if (!aiAvailable) {
    el("design-status").textContent =
      "AI design generation needs the local Designer host: clone the repo, add an OpenAI key to .env.local and run npm run dev.";
    return;
  }
  if (typed) rememberPrompt(typed);
  const prompt = typed || "Design a particle field inspired by this photo.";
  const image = inspiration;
  commitDesign();
  const current = captureDesign();
  const [model, effort] = el<HTMLSelectElement>("design-engine").value.split("|");
  button.disabled = true;
  el<HTMLSelectElement>("design-engine").disabled = true;
  el<HTMLTextAreaElement>("design-request").disabled = true;
  el<HTMLButtonElement>("design-attach").disabled = true;
  el<HTMLButtonElement>("design-image-remove").disabled = true;
  el("design-prompt").setAttribute("aria-busy", "true");
  el("design-status").textContent = "Designing your particle field…";
  try {
    const response = await fetch(GENERATE_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        current,
        ...(image ? { image } : {}),
        ...(effort ? { model, effort } : {}),
      }),
      signal: AbortSignal.timeout(185000),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Generation failed.");
    const design = parseDesign(data.design);
    await geometryReady(design.formation === 30 ? design.geometry : undefined);
    commitDesign(); // Preserve edits made while waiting too.
    applyLabPreset(design);
    commitDesign();
    el<HTMLTextAreaElement>("design-request").value = "";
    if (inspiration === image) setInspiration(undefined);
    el("design-status").textContent =
      `${design.name} · ${design.description} Click an empty slot to save.`;
  } catch (error) {
    el("design-status").textContent =
      error instanceof Error ? error.message : "Generation failed; current design preserved.";
  } finally {
    button.disabled = false;
    el<HTMLSelectElement>("design-engine").disabled = false;
    el<HTMLTextAreaElement>("design-request").disabled = false;
    el<HTMLButtonElement>("design-attach").disabled = false;
    el<HTMLButtonElement>("design-image-remove").disabled = false;
    el("design-prompt").setAttribute("aria-busy", "false");
  }
};

void fetch(GENERATE_API)
  .then(async (response) => {
    if (!response.ok) throw new Error();
    const config = await response.json();
    const select = el<HTMLSelectElement>("design-engine");
    select.replaceChildren(
      ...config.choices.map((choice: { model: string; effort: string }) => {
        const option = document.createElement("option");
        option.value = `${choice.model}|${choice.effort}`;
        option.textContent = `${choice.model.replace(/^gpt-([0-9.]+)-/, "GPT-$1 ").replace(/\b(luna|sol|terra|astra)$/, (name) => name[0].toUpperCase() + name.slice(1))} · ${choice.effort[0].toUpperCase() + choice.effort.slice(1)}`;
        return option;
      }),
    );
    select.value = `${config.model}|${config.effort}`;
    if (select.selectedIndex < 0) select.selectedIndex = 0;
    select.disabled = false;
    select.onchange = () => {
      const [model, effort] = select.value.split("|");
      el("design-model").textContent = ` · ${model} · ${effort} effort`;
    };
    select.dispatchEvent(new Event("change"));
  })
  .catch(() => {
    aiAvailable = false;
    el("design-model").textContent = " · AI unavailable";
  });

el<HTMLTextAreaElement>("design-request").addEventListener("keydown", (event) => {
  if (
    event.key === "Escape" ||
    (event.ctrlKey && ["c", "delete", "backspace"].includes(event.key.toLowerCase()))
  ) {
    event.preventDefault();
    el<HTMLTextAreaElement>("design-request").value = "";
    promptCursor = promptHistory.length;
    return;
  }

  if (
    (event.key === "ArrowUp" || event.key === "ArrowDown") &&
    !event.shiftKey &&
    !event.isComposing
  ) {
    event.preventDefault();
    promptCursor = Math.max(
      0,
      Math.min(promptHistory.length, promptCursor + (event.key === "ArrowUp" ? -1 : 1)),
    );
    const field = el<HTMLTextAreaElement>("design-request");
    field.value = promptHistory[promptCursor] ?? "";
    field.setSelectionRange(field.value.length, field.value.length);
    return;
  }
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    if (!el<HTMLButtonElement>("design-generate").disabled)
      el<HTMLFormElement>("design-prompt").requestSubmit();
  }
});

// The prompt form starts collapsed each load; status messages stay visible.
el("design-toggle").addEventListener("click", () => {
  const body = el("design-body"),
    expand = body.hidden;
  body.hidden = !expand;
  const toggle = el("design-toggle"),
    label = expand ? "Collapse prompt" : "Expand prompt";
  toggle.setAttribute("aria-expanded", String(expand));
  toggle.setAttribute("aria-label", label);
  toggle.title = label;
  if (expand) el<HTMLTextAreaElement>("design-request").focus();
});

// MIDI uses the same UI edit handlers and authoring history as pointer edits.
// Candidate browsing is local navigation; empty slots never invoke Save.
const rotoCandidate = {
  preset: { bank: STARTUP_PRESET.bank, slot: STARTUP_PRESET.slot },
  shape: { bank: 0, slot: 0 },
};
let designerBlackout = false;
const blackoutButton = document.createElement("button");
blackoutButton.id = "designer-blackout";
blackoutButton.textContent = "Blackout";
blackoutButton.setAttribute("aria-pressed", "false");
el("pause").parentElement!.append(blackoutButton);
function setDesignerBlackout(value: boolean) {
  designerBlackout = value;
  canvas.style.visibility = value ? "hidden" : "visible";
  blackoutButton.setAttribute("aria-pressed", String(value));
  blackoutButton.textContent = value ? "Restore image" : "Blackout";
}
blackoutButton.onclick = () => setDesignerBlackout(!designerBlackout);
const rotoGroups: Record<string, string> = {
  Particles: "particles",
  "Light on": "light",
  Ribbons: "ribbons",
  Attractors: "attractors",
  "Motion on": "motion",
  "Shock on": "shock",
  "Cycle on": "cycle",
  "Audio on": "audio",
};
const rotoIds: Record<string, string> = {
  "Journey time": "journey-time",
  "Input gain": "input-gain",
  "Input mode": "input",
  Systems: "systems",
  Journey: "journey",
  "Audio cycle": "cycle-audio",
};
function rotoElement(key: string): HTMLInputElement | HTMLSelectElement | null {
  if (rotoGroups[key])
    return (
      document
        .querySelector(`#controls-${rotoGroups[key]}`)
        ?.closest("fieldset")
        ?.querySelector(".category-toggle") ?? null
    );
  return rotoIds[key]
    ? el<HTMLInputElement | HTMLSelectElement>(rotoIds[key])
    : document.querySelector(`input[aria-label="${key}"]`);
}
function browseCandidate(kind: "preset" | "shape") {
  const candidate = rotoCandidate[kind];
  const tabs = el(`${kind}-banks`).querySelectorAll<HTMLButtonElement>("button");
  tabs[candidate.bank]?.click();
  el(kind === "preset" ? "lab-presets" : "lab-shapes")
    .querySelectorAll<HTMLButtonElement>("button")
    .forEach((b, i) => {
      b.classList.toggle("roto-candidate", i === candidate.slot);
    });
}
function applyCandidate(kind: "preset" | "shape") {
  const { bank, slot } = rotoCandidate[kind];
  const item = (kind === "preset" ? presetBanks : shapeBanks)[bank]?.[slot];
  if (!item) {
    el("design-status").textContent = "Empty slot — choose an occupied slot before Apply.";
    return;
  }
  browseCandidate(kind);
  el(kind === "preset" ? "lab-presets" : "lab-shapes")
    .querySelectorAll<HTMLButtonElement>("button")
    [slot]?.click();
}
const disposeDesignerRoto = connectDesignerRoto(
  {
    read(key) {
      const kind = key.startsWith("Preset ")
        ? "preset"
        : key.startsWith("Shape ")
          ? "shape"
          : undefined;
      if (kind)
        return key.endsWith("bank")
          ? rotoCandidate[kind].bank / (LAB_BANK_COUNT - 1)
          : rotoCandidate[kind].slot / (LAB_BANK_SIZE - 1);
      if (key === "Blackout") return Number(designerBlackout);
      if (key === "Pause") return Number(paused);
      if (key === "File play") return Number(!audio.paused);
      const control = rotoElement(key);
      if (!control) return;
      if (control instanceof HTMLSelectElement) {
        return Math.max(0, control.selectedIndex) / Math.max(1, control.options.length - 1);
      }
      if (control.type === "checkbox") return Number(control.checked);
      return (
        (Number(control.value) - Number(control.min)) / (Number(control.max) - Number(control.min))
      );
    },
    write(key, normalized) {
      const kind = key.startsWith("Preset ")
        ? "preset"
        : key.startsWith("Shape ")
          ? "shape"
          : undefined;
      if (kind) {
        rotoCandidate[kind][key.endsWith("bank") ? "bank" : "slot"] = Math.round(
          normalized * (key.endsWith("bank") ? LAB_BANK_COUNT - 1 : LAB_BANK_SIZE - 1),
        );
        browseCandidate(kind);
        return;
      }
      const control = rotoElement(key);
      if (!control || control.disabled) return;
      if (control instanceof HTMLSelectElement) {
        const index = Math.round(normalized * (control.options.length - 1));
        if (control.selectedIndex === index) return;
        control.selectedIndex = index;
        control.dispatchEvent(new Event("change"));
      } else {
        control.value = String(
          Number(control.min) + normalized * (Number(control.max) - Number(control.min)),
        );
        control.dispatchEvent(new Event("input"));
      }
    },
    action(key, state) {
      if (key === "Blackout") {
        setDesignerBlackout(Boolean(state));
        return;
      }
      if (key === "Pause") {
        if (paused !== state) togglePause();
        return;
      }
      if (key === "Apply look" || key === "Apply shape") {
        applyCandidate(key === "Apply look" ? "preset" : "shape");
        return;
      }
      if (key === "Previous" || key === "Next") {
        const c = rotoCandidate.preset,
          step = key === "Next" ? 1 : -1;
        for (
          let i = c.bank * 16 + c.slot + step;
          i >= 0 && i < LAB_BANK_COUNT * LAB_BANK_SIZE;
          i += step
        ) {
          if (presetBanks[Math.floor(i / 16)][i % 16]) {
            c.bank = Math.floor(i / 16);
            c.slot = i % 16;
            break;
          }
        }
        browseCandidate("preset");
        return;
      }
      if (key === "Undo" || key === "Redo") {
        el(`design-${key.toLowerCase()}`).click();
        return;
      }
      if (key === "Ripple" || key === "Cycle") {
        el(key === "Ripple" ? "burst" : "cycle").click();
        return;
      }
      if (key === "File play") {
        if (input.value !== "file") {
          el("design-status").textContent = "Choose File audio and load a file first.";
          return;
        }
        if (state)
          void audio.play().catch(() => {
            el("design-status").textContent =
              "Use the on-screen audio Play button to enable playback.";
          });
        else audio.pause();
        return;
      }
      if (key === "Reset view") {
        drive.yaw = 0;
        drive.pitch = 0.65;
        drive.roll = 0;
        drive.distance = 4.2;
        for (const axis of ["X", "Y", "Z"]) setControl(`Rotation ${axis}`, 0);
        syncViewControls();
        commitDesign();
        return;
      }
      const control = rotoElement(key);
      if (control instanceof HTMLInputElement && control.type === "checkbox" && !control.disabled) {
        control.checked = Boolean(state);
        control.dispatchEvent(new Event("change"));
        commitDesign();
      }
    },
    commit: commitDesign,
    locate(key) {
      if (/^Preset |^Apply look$|^Previous$|^Next$/.test(key)) return el("preset-banks");
      if (/^Shape |^Apply shape$/.test(key)) return el("shape-banks");
      const ids: Record<string, string> = {
        Ripple: "burst",
        Cycle: "cycle",
        "File play": "audio",
        "Reset view": "controls-view",
        Pause: "pause",
        Blackout: "designer-blackout",
      };
      return ids[key] ? el(ids[key]) : rotoElement(key);
    },
    describe() {
      return (["preset", "shape"] as const)
        .map((kind) => {
          const { bank, slot } = rotoCandidate[kind];
          const item = (kind === "preset" ? presetBanks : shapeBanks)[bank][slot];
          return `${bankLabel(kind, bank)}:${slot + 1} · ${item?.name ?? "Empty"}`;
        })
        .join(" / ");
    },
  },
  panel,
);
window.addEventListener("pagehide", disposeDesignerRoto, { once: true });
