# Particles Designer — ROTO-CONTROL

The Designer uses MIDI channels **9, 10, 11** (channels 1–8 stay free for other
setups, e.g. LUMEN's 1–4 and 8).

**Get the setup files:** [download page](https://rezakalfane.github.io/ParticlesDesigner/roto/)
(also linked from the Designer's ROTO status), `roto/` in this repository, or the CDN:
`https://cdn.jsdelivr.net/npm/@absolumont/particles-designer@0.1/roto/9%20PD%20PERFORM.json`
(and `10%20PD%20DESIGN.json`, `11%20PD%20MOTION.json`); they ship in the npm package.

Import the three files into ROTO-SETUP and sync them to the hardware (setup indices 9–11). Keep the
assigned channels unchanged. These exports use the observed v1 format only.

Connect the USB ROTO and open the Designer in a Web MIDI capable browser such as
Chrome. Allow MIDI access; the Designer auto-connects and provides a Connect ROTO
retry button. Its status appears above the controls. No Project or Session is
joined or changed. Other ROTO apps (such as LUMEN) may stay open together as long
as their maps use disjoint input and feedback channels. Custom MIDI learning/reassignment
must preserve that separation.

## Layout

Knobs run left to right. Blank positions are unassigned.

| Channel / setup | Page      | K1 → K8                                                                                        |
| --------------- | --------- | ---------------------------------------------------------------------------------------------- |
| 9 PD PERFORM    | LOOKS     | Preset bank, slot, Motion, Light, Expansion, Audio depth, Shockwave, Ribbon brightness         |
| 9               | SHAPES    | Shape bank, slot, Density, Thickness, Expansion, Dispersion, Turbulence, Journey time          |
| 9               | GESTURES  | Shockwave, Implosion, Explosion, Recovery, Attraction, Separation, Orbit, Audio depth          |
| 9               | VIEW      | Yaw, Pitch, Roll, Distance, Rotation X, Y, Z, Systems                                          |
| 10 PD DESIGN    | PARTICLES | Density, Thickness, Expansion, Dispersion, Turbulence, Turbulence scale, Turbulence density, — |
| 10              | LIGHT     | Light, Color drift, Color variety, Halo, Depth softness, Focus, —, —                           |
| 10              | RIBBONS   | Length, Brightness, Head size, Trail thickness, —, —, —, —                                     |
| 10              | ATTRACT   | Attraction, Separation, Orbit, —, —, —, —, —                                                   |
| 11 PD MOTION    | MOVE      | Motion, Rotation X, Y, Z, Journey time, —, —, —                                                |
| 11              | SHOCK     | Shockwave, —, —, —, —, —, —, —                                                                 |
| 11              | CYCLE     | Implosion, Explosion, Recovery, —, —, —, —, —                                                  |
| 11              | AUDIO     | Input mode, Input gain, Audio depth, —, —, —, —, —                                             |

Every page: **B4 Blackout, B5 Undo, B6 Redo, B7 Pause, B8 page name**.
Blackout hides only the Designer canvas; animation continues and restoration
preserves the image state. Pause and Blackout are runtime-only, not undo entries.

| Page                                  | B1                                                   | B2                | B3                 |
| ------------------------------------- | ---------------------------------------------------- | ----------------- | ------------------ |
| LOOKS                                 | Apply look                                           | Previous occupied | Next occupied      |
| SHAPES                                | Apply shape                                          | Journey toggle    | Particles toggle   |
| GESTURES                              | Ripple                                               | Cycle             | Audio cycle toggle |
| SHOCK                                 | Shockwaves toggle                                    | Ripple            | —                  |
| CYCLE                                 | Cycle toggle                                         | Cycle             | Audio cycle toggle |
| VIEW                                  | Reset view (also stops all rotation rates; undoable) | —                 | —                  |
| PARTICLES / LIGHT / RIBBONS / ATTRACT | Group toggle                                         | —                 | —                  |
| MOVE                                  | Motion toggle                                        | Journey toggle    | —                  |
| AUDIO                                 | Audio contribution toggle                            | File play/pause   | —                  |

Bank/slot knobs only browse. Apply uses the existing Designer selection transition.
Empty slots reject visibly, never invoke Save. Previous/Next cross banks and clamp
at the ends. Candidate names appear in the MIDI strip; hardware labels remain
static. Input modes follow the UI option order (Demo, Mic, File, Off). File loading,
naming/saving and AI prompts stay on screen. Bypassed groups retain their values;
their disabled controls cannot be changed by MIDI, just as with the mouse.

## Page following and feedback

B8 is a momentary CC button with the page's name and label color 24. Its CC is
71, 79, 87 or 95 on the setup's channel. Press it after switching hardware pages
to reveal the matching section without editing anything. Every other assigned
control also announces its page. Every knob move or button press scrolls the
section holding that control (e.g. LOOKS → Motion reveals Motion & rotation) to
the top of the controls panel, or as high as the panel can scroll, even if the
operator scrolled away meanwhile; B8 reveals the page's own section. Changing pages using only the hardware arrows
is not claimed to emit MIDI; verify that on the device. Clicking the on-screen
page strip navigates only the UI and never switches the device page.

Feedback starts only after an incoming control identifies the hardware page and
is limited to that page. Reconnect waits for a new announcement. A CC on another
channel suspends Designer feedback until a Designer control is used again.
Motor/LED feedback uses the existing PhysicalRoto echo suppression; no second MIDI
decoder exists. Camera knobs use 14-bit MSB/LSB pairs. Other knobs use 7-bit CCs,
with detents for selectors. Buttons occupy CC64–95; fine LSBs never collide.
Continuous edits commit after 300 ms of inactivity and before actions/page changes,
so Undo restores a gesture rather than hundreds of CC samples. Navigation does
not enter undo history. Effects are actions and are never replayed by undo.

`src/designer/rotoLayout.ts` is the single source for exports, bindings and
page labels. Regenerate with `npm run roto:presets`; do not edit generated JSON.
`npm run rehearse:roto` exercises the real Designer with simulated Web
MIDI (requires `npm run dev` on localhost:5180, or set `DESIGNER_URL`). Unit tests
also prove that other channels are ignored and fine CC pairs are reserved.
Physical detents, labels, motor response and USB hotplug still require a hardware
rehearsal after importing the files.
