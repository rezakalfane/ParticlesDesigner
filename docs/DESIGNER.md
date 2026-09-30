# Particles Designer — reference

Run `npm run dev` and open http://localhost:5180/. `npm run build` produces a
static site in `dist/`. No extra dependency or hardware required.
Controls are grouped into Particles & shape, Light & color, Ribbons, Attractors,
Motion & rotation, Shockwaves, the performance cycle, and Audio. Gesture buttons
sit with their corresponding controls.
Each slider category has an enable switch. Stored slider values survive bypass.
Particles bypass uses default density/thickness/expansion and zero turbulence;
Light bypass uses neutral light/color with halos and depth softness off; Ribbons,
Attractors, Cycle and Audio bypass their contributions. Shockwave bypass clears
active waves. Motion stops procedural movement and auto-rotation at their current
phase while the independent cycle/wave clock continues. Audio playback/analysis
continues while its visual contribution is bypassed. Re-enabling restores values.

1,000–100,000 procedural WebGL2 points (Particle density; default 44,560) form a twisted torus, rippled sphere, or
wave sheet, double helix, spiral galaxy, or trefoil knot, with continuous formation transitions, additive light, outer dust,
perspective, orbit and zoom. Resolution is capped at 1920×1080 and DPR 1.5.
One head draw plus up to 6 ribbon draws, no position buffers, readbacks,
history textures or CPU simulation. Trail stores at most 80 small control snapshots
and re-evaluates the same particle identities at their previous positions on the GPU.
All samples use the current camera, so orbiting does not smear the screen.
Particle thickness scales point-head size independently from ribbon width and
brightness (0.35×–3×, default approximately 1×).
Expansion spans 0–4 (default 0.65), allowing a base spatial scale up to 3.25×,
compared with the previous 1.3× maximum. Audio expansion remains additive.
Large fields can extend beyond the view; scroll out to inspect the whole sculpture.

Systems switches between one field and four simultaneous fields in a 2×2 view
(one is the default). Top left uses the selected formation; top right is orbital,
bottom left tidal, bottom right a double helix. They share audio and
controls but have different color/view offsets and independent bounded ribbon
histories and shockwaves. One canvas/WebGL context hosts four renderer instances;
scissored viewports isolate each field. Density is the TOTAL particle count,
split evenly with remainder assigned to the first fields, so four mode does not
quadruple the particle budget. Switching back disposes the extra GPU programs and
timer queries. GPU ms sums the most recent timings of the active systems; these
asynchronous samples need not come from precisely the same frame.

Ribbon length independently sets a 0–17.28 second preview-time fade window,
displayed in seconds (default 1.62 s). Ribbon brightness controls light intensity;
zero on either control disables ribbons. Six connected segments span the history.
One in eight particles carries a tapered, soft-edged triangle ribbon;
all particles retain their point heads. This bounds ribbon geometry to 450,000
vertices per frame, plus the heads. Control snapshots are captured at most every
30 ms; ribbon endpoints slide continuously through interpolated history.
History warms in smoothly. Pause freezes the complete sculpture, including
tails; backward clock jumps or gaps over 500 ms clear history. Higher Trail costs
more GPU work; measure under show load.

- 1–9: formation; drag: orbit; scroll: zoom; Space: ripple; H: controls; F: fullscreen.
- Automatic shape journey slowly morphs through vortex, orbital, tidal and helix
  then back. Journey time sets a full round trip to 10–180 preview seconds
  (default 75); lower is faster. It is independent of Motion speed, holds while
  paused or Motion is bypassed, and changing duration preserves the current phase.
  Enabling it starts from the visible formation. Selecting a formation
  turns the journey off. In four mode, the journey affects the selected top-left field.
- Halo glow adds a soft Gaussian skirt to particle heads. Depth softness defocuses
  heads away from Focus plane (near→far). This is a bounded sprite approximation,
  not full-scene bloom or physical depth of field; no postprocess targets or new
  draw calls. Point sprites cap at 64 px. Set both glow and softness to zero for
  the previous crisp look. More glow costs fragment work; monitor GPU timing.
  Their optical footprint has a viewport-scaled pixel radius so the effect stays
  visible in four-view mode; halos are not dimmed inversely with sprite size.
  `node scripts/rehearse-particle-optics.mjs` captures a frozen crisp/halo/defocus
  comparison with ribbons disabled to isolate these head-only effects.
- Rotation X/Y/Z independently control automatic tumbling (0 = stopped,
  1 = 0.6 radians/second). All three start enabled at different slow speeds.
  Dragging temporarily suspends auto-rotation; Pause freezes all three axes.
  Rotation speeds are independent of Motion, and apply to the entire trail field.
- Demo pulse is silent. Audio file plays locally through Web Audio (native controls).
- Shockwave controls radial displacement from expanding spherical wavefronts.
  Transient/ripple rising above 0.3 launches a wave and must fall below 0.12
  before rearming; Space or Send ripple also drives this trigger. At most 16
  launch records are retained for five seconds to cover both waves and trails.
  Wavefronts expand at 1.8 world units per preview second and decay over 2.5 s.
- Mac microphone analyses the default input device locally through Web Audio.
- Low expands the sculpture; mid twists/deforms it; high changes point size;
  transient adds radial waves. Audio depth scales all four. Ripple is a local gesture.
- Audio depth spans 0–2 (default 1.0). Feature inputs
  remain bounded to 0–1 before this gain; doubling depth doubles their drive.
- Dual attractors are enabled by default (Attraction 0.7, Separation 0.65,
  Orbit 0.3). Attraction 0 restores the original formation exactly; 1 splits it
  fully into two smaller orbiting clouds. Separation sets their distance, while
  Orbit sets centre rotation speed (0–0.8 rad/s), independently of camera rotation.
  Seeded particles smoothly exchange between the two centres; low audio adds
  breathing to separation. This is an analytic visual deformation, not a physical
  gravity simulation. Historical ribbons preserve attractor controls and angle.
  Pause freezes the orbit; changing its speed does not jump its phase. Collapse
  and explosion apply after attraction so both clouds reform together.
- Launch cycle / E runs collapse → explosion → reformation. Implosion and
  Explosion are independent amounts; Recovery time spans 0.8–6 preview seconds.
  Collapse takes 650 ms and release 250 ms before recovery begins. Controls are
  captured at launch; retriggers are ignored until complete. Pause freezes it.
  Audio-accent triggering is opt-in and rearms only below a transient of 0.12,
  then fires above 0.3. The cycle shares the preview clock and affects all four
  systems; historical ribbons retain their earlier collapse/explosion values.
- Reduced-motion preference starts paused. Resume explicitly to animate.

## Later generator integration

`ParticleRenderer(canvas).render(timeMs, drive)` is the extraction seam, with
explicit `dispose()`. The renderer owns no animation loop, clock, DOM controls,
audio receiver or registry (`src/engine/renderer.ts`). The Designer smooths drives
and advances its own preview time; a host embedding the renderer supplies its own
clock and drive values.

The footer reports browser frame cadence and, where supported, asynchronous
`EXT_disjoint_timer_query_webgl2` GPU elapsed time for this renderer. A single
pending query bounds resources; disjoint measurements are discarded. The percent
is the share of a 16.67 ms / 60 fps GPU frame budget, NOT system GPU utilization.
Unsupported devices show "GPU timing unavailable". Measure on the target machine before choosing production density.

Galaxy (5) and Trefoil (6) are lab experiments. Galaxy forms three curling arms;
Trefoil forms a closed tubular knot. Shape journey visits all sixteen formations.

Additional lab shapes: Möbius (7), a half-twisted ribbon; Bloom (8), a five-petal
curved surface; Cage (9), six intersecting great-circle hoops. Galaxy arms now
have a wider angular spread and twice the vertical thickness for a softer cloud.

Manual formation selection blends directly from the visible shape mixture into
the chosen shape, including when interrupted. Only Automatic shape journey
visits intermediate formations. Ribbon history retains the same shape mixture.

Particle dispersion (0–1) scatters particles around any formation using stable
seeded offsets. Zero keeps the clean shape; higher values produce a diffuse
cloud. Expansion separately scales the whole field. Dispersion follows ribbon
history and the Particles & shape bypass, and is currently lab-only.

Shell winds an expanding spiral tube; Veil layers three flowing curtains;
Lattice traces a cubic grid; Starburst radiates 32 evenly distributed rays.
Select these four with their formation buttons (keys 1–9 keep their assignments).

Aurora is a separate curtain formation with fine vertical rays, folded lower
edges, green emission and fading violet tops. Northern lights is its authored
look, with slow motion, green/purple/blue colors and an inverted viewpoint.
The earlier Aurora curtains preset was removed at the operator's request.

Color drift now rotates the full hue wheel (0 and 1 meet). Color variety spans
0–5 (displayed as 1–6 colors): Aurora is mainly green at 0, green with violet upper edges at 1, and gains
blue rays at 2, then cyan, magenta and amber toward 5. Northern lights uses drift 0 and variety 2.2.

Point of view sliders expose horizontal angle, vertical angle and roll in
degrees (−180…180), plus camera distance (3…8). Readouts follow mouse orbit,
wheel zoom, automatic rotation and presets. Editing an angle stops that axis
of automatic rotation; the other motion controls keep running. Works paused.

Shapes and Presets are separate: Shapes changes geometry only (and stops Shape
Journey); Presets restores a complete look using fixed defaults plus authored
settings, so it never inherits the previous look. Initial looks include Deep sea (Jellyfish), Galaxy drift (Galaxy),
Moon dunes (Dunes), and Neon weave (Trefoil). Jellyfish has a pulsing bell and
36 varied-length tentacles that fan outward, plus four broad ruffled oral arms; Dunes is a broad landscape with seeded mountain ridges, asymmetric dune slopes
and fine wind ripples. Its terrain stays coherent (no default vertical twist or
outer dust), while dispersion, turbulence and morphing remain available. Presets use one system,
reset journey to off/75 s, restore their authored shockwave toggle (off by default) and disable audio-driven cycles, and set
silent demo audio with zero audio depth. They do not change Pause/Resume.

Six additional looks: Sunset ridges and Glacial peaks explore the terrain;
Northern lights uses the Aurora curtains; Prism cathedral uses Cage; Ember
shell uses Shell; Electric bloom uses Bloom. Each specifies its own camera,
palette, optics and motion. Northern lights replaces the earlier Aurora curtains preset.

The library now has sixteen looks. Event horizon (Vortex), Pearl planet
(Orbital), Mercury tide (Tidal), Cosmic DNA (Helix), Silk orbit (Möbius), and
Crystal city (Lattice) add six distinct lighting, motion and viewpoint studies.

Jellyfish lower-body scattering increases smoothly toward the tips, following
the supplied reference silhouettes; the bell stays crisp. Arm folds and
tentacle motion are analytic and seeded, so direct morphing and ribbons remain
stable without additional draw calls or CPU particle simulation.

Jellyfish tendrils are elongated with narrower ruffled arms and a slimmer
lower silhouette. Deep sea uses distance 5.8 to frame the longer tips.

The elongated jellyfish lower body gathers into a compact bundle beneath the
bell. Tip scatter is restrained and the generic outer-dust expansion is bypassed
for this shape, keeping the reference silhouette clear.

Deep sea was updated from the operator's current lab view: angles 10.2° / 18.9° /
0°, distance 5.8, motion 0.76, turbulence 0.17, density 0.58, expansion 0.68,
light 0.45, softness 0.26 and ribbons 0.81/0.62. Shockwaves are enabled with
strength 0.7; audio depth and all automatic rotation axes remain zero.

Shapes and Presets each have four independent banks of sixteen fixed slots.
Bank 1 contains the existing sixteen entries in their original order; Banks 2–4
are empty. Empty slots are disabled and never substitute another item. Bank
browsing is local navigation and changes no visual settings, shape, journey,
or motion. Shape identities remain renderer indices, independent of bank slots.

The factory catalog is `src/looks/particleFactory.ts` (the sixteen looks in
`particleLooks.ts`, the studies in `particleStudies.ts` and baked presets in
`particleBakedLooks.ts`): four banks of sixteen. `src/designer/presets.ts` keeps
`LAB_PRESETS` for the Designer. To turn saved presets into factory slots, bake
them (below).

Galaxy drift
replaces Solar dust with the captured Lab setup (79,210 particles, expansion 1.31,
color drift 0.52, variety 0.64, Y rotation 0.04, view −8.1° / 33.2° / −22° at 3×).

### Solar system study

Presets → Bank 2 → slot 1 contains the Solar system study. Its
matching shape is in Shapes → Bank 2 → slot 1 (appended identity 16). A golden
sun, eight independently orbiting planets, Saturn rings and fine orbital dust
use the same GPU particle surface. Motion controls orbital speed; viewpoint,
color drift, dispersion and other existing controls remain editable. Like every
study, it is part of the factory catalog.

Bank 2 slots 2–5 add Earth & Moon, Jovian giant, Saturn, and Infinite black hole,
with matching shapes. These are procedural particle interpretations: Earth uses
continent-like noise rather than a geographic map; the black hole uses an
art-directed lensed arc, central shadow and foreground disk, not ray tracing.
Planet surfaces hide their rear hemisphere; Saturn's rear rings are masked
behind the planet. All five studies use existing controls.

### Mystical studies

Designer Bank 2 slots 6–9 contain Cosmic lotus, Celestial eye, Astral portal, and
Eclipse crown, with matching shapes (identities 21–24). The lotus breathes in
three petal tiers around a pearl; the eye has radial iris filaments and a golden
outline; the portal has twelve counter-rotating gates; the eclipse has a dark
center and long animated corona rays. These are Designer experiments, using
the existing direct shape blend and GPU surface.

### Local microphone and input gain

Audio → Input → Mac microphone requests the browser-selected microphone.
Permission is requested only on selection. The existing analyser drives the
low/mid/high meters and particle response; microphone audio is never monitored
through the speakers. Input gain (0–8×, default 1×) scales analysis for every
input before the meters; it does not change audio-file playback volume. Audio
depth remains the separate artistic response control. Input changes and page
exit release microphone tracks, including late permission results. Permission
and device errors appear in the status line.

### Aether Storm

Bank 2, slot 10 adds Aether storm (shape 25): six continuously folded ribbons,
three precessing orbital hoops, a breathing core and sparse surrounding dust.
The preset moves without audio and starts at Audio depth 0.35 for live input.
Select Mac microphone and adjust Input gain for the room; Space sends a ripple
and the existing cycle controls provide an explicit collapse/expansion gesture.
It uses the same bounded particle renderer and direct morph path as other studies.

### Liquid and flame

Bank 2 slots 11–12 contain Liquid mercury (shape 26) and Astral flame (shape 27).
Mercury is an analytically deformed surface with moving silver-blue reflection
bands and small satellite droplets. Flame uses seven tapered, curling plumes
and sparse embers that fade at their wrap boundary. These are procedural
particle interpretations, not fluid solvers. Both animate without audio, retain
direct shape morphs, and use no accumulated trails by default.

### Silken Currents

Bank 2 slot 13 (shape 28) is inspired by flowing blue and champagne fiber fields:
220 seeded filaments braid across a wide composition with a sparse layer of
larger pearl-like particles. Strand geometry is generated directly on the GPU,
without history trails. The authored palette responds to Color drift and Color
variety; Motion advances the currents and Audio depth adds a restrained response.

### Extended trails and density experiment

Designer Ribbon length now reaches 17.28 seconds (old 0–1 values retain their
original duration). Trail head size (1–4×) enlarges only every eighth point that
anchors a rendered ribbon; ribbon width remains independent. History is bounded
to 600 control snapshots and the six ribbon segments remain fixed.

The Designer temporarily allows 200,000 particles. Density 0–1 retains the
original mapping, with 1–2 adding 100k–200k.
Silken Currents captures the 23:57 screenshots: 200,000 particles, 2.79× particle
thickness (0.92 control), 3.80 expansion, 0.08 dispersion, 0.78 turbulence,
Light 0.06, hue 0.01, two colors, halo 0, softness 0.59, focus 0.45,
17.28 s ribbons at brightness 0.23, 3.91× heads, 16× trail width, Motion 0.18
and camera [−15.7°, −15.4°, 6°, 5.52]. Audio, attractors and shockwaves
are disabled while their slider values remain authored.

Trail thickness independently scales ribbon width from 0.25–16×, default 1×.
Use 1.1–1.3× for a subtle lift. It leaves particle/head size unchanged and
adds no draw calls. Existing presets retain their original strand width.

### Astral Veil

Bank 2 slot 14 saves the 00:15 screenshot variation of Silken Currents without
replacing slot 13. It uses 85,150 particles, six-color variety with 0.90 drift,
9.03-second trails at 16× width and 0.17 brightness, 3.02× heads, Light 0.04,
active orbiting attractors (attraction 0.22), 0.58 motion and 0.08 Z rotation.
Camera: [130.9°, −120.8°, 145.1°, 8]. Audio and shockwaves are disabled;
the collapse/explode cycle remains available.

### Sahara Drift and prompt authoring

Sahara Drift (Bank 2 slot 15, formation 29) adds a three-dimensional dune field:
curved crests, variable heights, steep leeward slopes, fine ripples and moving
sand grains. Directional surface lighting brings out the relief. Existing Moon
Dunes remains unchanged.

Enter submits the translucent prompt composer; Shift+Enter adds a line. The
field is disabled during generation, clears on success and retains text on failure.
The bottom prompt composer changes the **current design**, never the saved
catalog. It calls the local Vite dev/preview host at `/api/generate`.
The server reads `OPENAI_API_KEY`, `OPENAI_MODEL`, and `OPENAI_REASONING_EFFORT`
from `.env.local` / process environment; never prefix credentials with `VITE_`.
Restart the host after changing configuration. `.env.example` documents the setup. Model and
effort are shown next to the bottom-left performance readout. The prompt form
starts with a model/effort dropdown (GPT-6 Luna/Sol/Astra or GPT-5.6 Terra, low/medium/high); this selects
the next request without changing the environment defaults. Keys are never
sent to the browser. The endpoint accepts only loopback, same-origin JSON POSTs,
limits request size/concurrency/time, uses Responses structured output with
`store:false`, and validates all settings before applying. Offline/error/refusal
leaves the field unchanged.

Prompts can invent new geometry (formation 30) as three bounded mathematical
expressions in seeded coordinates `a,b,c` and motion time `t`. A small parser
compiles the allowed scalar arithmetic/functions into the GPU vertex shader;
no JavaScript, raw shader statements or loops are accepted. Coordinates are
bounded; a shape that fails to compile keeps the current field. These are
procedural particle surfaces/volumes, not arbitrary fluid/physics simulations.
High effort has a three-minute deadline and a larger output budget. Errors
distinguish timeout, incomplete output and rejected geometry. The new geometry is saved with the look and restored by Undo/Redo.

Click an empty preset slot to name and save the full current look. Empty shape
slots save geometry and formation controls, leaving the current lighting and
camera available for reuse. Saved slots live in ONE shared library on the dev
server (`GET/PUT /api/slots`, `server/designerSlots.ts` →
`<data dir>/slots.json`, where the data dir is `~/Library/Application Support/Particles Designer`
on macOS, overridable with `PARTICLES_DESIGNER_DATA_DIR`), so every device and address
(`localhost`, the LAN IP, a phone) sees the same slots. Each save writes a single
slot, so devices saving different slots never overwrite each other. Browser storage
(`particles-designer.slots.v1`) is a per-origin backup and the fallback without a
host; on load, slots found only in the browser are uploaded to the host once.
Shift+click an occupied slot to overwrite it after confirmation. Undo/Redo keeps up to 60 authoring states (sliders, camera,
shape/preset selection and generated designs); Cmd/Ctrl+Z and Shift+Z work
outside text inputs. Live audio resources and transient effect triggers are not
replayed. H hides the prompt along with the controls.

**Switching custom shapes and baking.** A live custom formula (formation 30)
is compiled into the particle shader together with the shape it fades from.
Compiles run in the background (`KHR_parallel_shader_compile`) and compiled
programs are cached per GPU context, so clicks never freeze the page and repeat
switches are instant. On ANGLE/Metal, though, the GPU process still takes about
0.5 s to build a never-seen program, and the preview pauses meanwhile, so the
first switch between two custom shapes still hitches. `npm run bake`
removes that for saved work. It turns every distinct saved formula into a
built-in shape (formation 31+, `src/engine/bakedShapes.ts`) compiled
into the one shader. Every saved preset/shape becomes a factory slot at the same
bank/slot, replacing the factory item there (`src/designer/bakedLibrary.ts`,
generated; a replaced factory slot keeps its id). The baked slots are then
cleared from `slots.json`, with a timestamped backup kept next to it. Re-running
merges with earlier bakes and reuses identical formulas. Baked shapes are frozen
code: to change one, edit it in the Designer, save, and bake again. The
automatic shape journey still sweeps shapes 0–30 only.

Verification: API and expression parser tests cover invalid inputs, upstream
failure and credential non-disclosure.

Designer selection transitions blend numeric settings and viewpoint over 1.8 seconds,
with direct formation weights and shortest-path camera angles. Custom geometry
has an outgoing/incoming GPU blend instead of replacing the visible formula outright.
Long ribbons reconstruct historical motion using the current formation/settings,
so they do not connect back to a previously selected preset. Dune ribbon segments
crossing the periodic respawn seam are clipped.

Generated designs can specify an explicit one-to-six-color palette, preserving
requested hues through save/load and Undo/Redo. Slot save/overwrite uses an in-app
name dialog; Shift+click also allows renaming. Shape highlights identify slots,
not shared geometry IDs. Slider drags create one Undo step on release. Up/Down
browse prompt history; Escape, Ctrl+C, Ctrl+Delete and Ctrl+Backspace clear the
focused prompt. The model dropdown has an inset chevron. The prompt form starts
collapsed on every load; the top-right chevron expands it (focusing the prompt)
and collapses it again. Status messages remain visible while collapsed.
Photo (or pasting / dropping an image onto the prompt) attaches one inspiration
photo to the next Create design. The browser downscales it to a ≤1024 px JPEG; the
host validates it as an image data URL (≤2 MB) and sends it to the model as a
low-detail image input next to the prompt JSON. The model uses it for palette,
mood, forms and movement, with the text taking precedence; an empty prompt is
allowed with a photo. The photo is cleared after a successful design and is
never saved in designs, prompt history or storage.

Turbulence now has separate strength, scale (0.1–8×, larger means broader swirls),
and density (0–1 spatial coverage) controls. Scale and density default to 1 to
preserve existing designs; both participate in selection transitions, shape and
preset saving, prompt generation and per-gesture Undo/Redo. Density changes
where turbulence acts, not the particle count.

## ROTO-CONTROL

The Designer has three dedicated setups on MIDI channels **9–11**. Import
`roto/` with ROTO-SETUP, then allow MIDI access in the Designer.
B8 carries the page name and announces it to the UI; bank/slot browsing needs
explicit Apply. See [the complete map and connection guide](ROTO-CONTROL.md).
