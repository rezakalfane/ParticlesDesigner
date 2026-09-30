# Embed kit

Play Particles Designer looks in any web page: a factory look, or your own design
exported from the Designer. The kit is the Designer's renderer and frame loop
without the UI. A look renders as it does in the tool, with the same motion,
rotation, attractors, cycle, audio response and transitions between looks.

- **Size:** about 30 KB gzipped, no dependencies.
- **Requirements:** WebGL2 (every current desktop and mobile browser).
- **Formats:** ES module, classic script (global `ParticlesDesigner`), and a
  `<particle-field>` element. Types are included.

## Install

From the https://cdn.jsdelivr.net/npm/@absolumont/particles-designer@0.1/dist-embed, no build step:

```html
<!-- ES module (also registers <particle-field>) -->
<script
  type="module"
  src="https://cdn.jsdelivr.net/npm/@absolumont/particles-designer@0.1/dist-embed/particles-designer.js"
></script>
<!-- or a classic script: global `ParticlesDesigner` -->
<script src="https://cdn.jsdelivr.net/npm/@absolumont/particles-designer@0.1/dist-embed/particles-designer.iife.js"></script>
```

`@0.1` follows the latest 0.1.x release; pin an exact version (`@0.1.0`) for
production. From npm, for bundlers:

```sh
npm install @absolumont/particles-designer
```

```js
import { ParticleField } from "@absolumont/particles-designer";
```

## Build from source

```sh
npm run build:embed   # → dist-embed/particles-designer.js (ESM)
                      #   dist-embed/particles-designer.iife.js (classic script)
                      #   dist-embed/types/ (TypeScript declarations)
npm run examples      # builds, then opens http://localhost:5180/examples/
```

Self-hosting: copy the `.js` file you need next to your page.

## Three ways to embed

### 1. The element (no JavaScript)

```html
<script
  type="module"
  src="https://cdn.jsdelivr.net/npm/@absolumont/particles-designer@0.1/dist-embed/particles-designer.js"
></script>

<particle-field look="deep-sea" style="width: 100%; height: 480px"></particle-field>
```

The Designer's **Embed** button copies this form with your design inline:

```html
<particle-field style="width: 100%; height: 480px" interactive>
  <script type="application/json">
    { "name": "My look", "formation": 30, "geometry": { … }, "settings": { … }, … }
  </script>
</particle-field>
```

or load a downloaded design file: `<particle-field src="/looks/my-look.json">`.

| Attribute       | Meaning                                                                              |
| --------------- | ------------------------------------------------------------------------------------ |
| `look`          | Factory look id or name (`deep-sea`, `Galaxy drift`…). Live: changes transition      |
| `src`           | URL of a design JSON (Designer → Embed → Download JSON)                              |
| `audio`         | `none` (default), `demo`, `microphone`, or a CSS selector of an `<audio>`/`<video>`  |
| `audio-gain`    | Input gain before the look's Audio depth (default 1)                                 |
| `audio-depth`   | Overrides the look's Audio depth (0–2) and turns its audio response on               |
| `interactive`   | Drag to orbit, Shift/right-drag or two-finger twist to roll, double-click to reset   |
| `zoom`          | Wheel, trackpad pinch and two-finger pinch zoom (captures page scrolling)            |
| `paused`        | Frozen frame; remove the attribute to play                                           |
| `quality`       | `auto` (default), `high`, `medium` or `low`: see [Quality](#quality-and-performance) |
| `poster`        | Image URL shown instead of the field when WebGL2 is unavailable                      |
| `max-particles` | Particle ceiling (default 200000)                                                    |
| `pixel-ratio`   | Highest device pixel ratio (default 1.5)                                             |

The element is a block that fills its CSS size (300×150 if you set none).
`element.field` is the underlying `ParticleField`; `element.look = designObject`
sets a design directly. Errors dispatch a cancelable `particle-field-error` event
(`event.detail` is the Error), and quality changes a `particle-field-quality` event
(`event.detail` is the new level, 0 = as authored).

### 2. ES module

```js
import { ParticleField } from "@absolumont/particles-designer";

const field = new ParticleField("#hero", { look: "galaxy-drift", interactive: true });
```

### 3. Classic script

```html
<script src="https://cdn.jsdelivr.net/npm/@absolumont/particles-designer@0.1/dist-embed/particles-designer.iife.js"></script>
<script>
  new ParticlesDesigner.ParticleField("#hero", { look: "northern-lights" });
</script>
```

## API

### `new ParticleField(target, options?)`

`target` is a `<canvas>` (used as is), any other element (a canvas filling it is
appended), or a CSS selector. **Give the container a size.**

| Option              | Default         | Meaning                                                                                           |
| ------------------- | --------------- | ------------------------------------------------------------------------------------------------- |
| `look`              | `"deep-sea"`    | Factory id or name, a design object, or design JSON text                                          |
| `audio`             | `"none"`        | See [Audio](#audio)                                                                               |
| `audioGain`         | `1`             | Input gain applied before the look's Audio depth                                                  |
| `audioDepth`        | the look's      | Overrides Audio depth (0–2) and turns the look's audio response on                                |
| `interactive`       | `false`         | Drag to orbit (screen space), Shift/right-drag or two-finger twist to roll, double-click to reset |
| `zoom`              | `false`         | Wheel, trackpad pinch and two-finger pinch zoom (captures scrolling over the field)               |
| `quality`           | `"auto"`        | `"auto"` adapts to the device; `"high"`, `"medium"`, `"low"` pin a level                          |
| `onQualityChange`   | none            | `(level) => void`, called when the quality level changes                                          |
| `poster`            | none            | Image URL shown instead of the field when WebGL2 is unavailable                                   |
| `maxParticles`      | `200000`        | Ceiling; denser looks are capped                                                                  |
| `pixelRatio`        | `1.5`           | Highest device pixel ratio used                                                                   |
| `maxResolution`     | `[1920, 1080]`  | Canvas size ceiling in device pixels                                                              |
| `autoplay`          | `true`          | `false` under `prefers-reduced-motion` (a still frame is shown)                                   |
| `pauseWhenHidden`   | `true`          | No rendering while offscreen or in a background tab                                               |
| `transitionSeconds` | `1.8`           | Look-to-look transition                                                                           |
| `onError`           | `console.error` | Rendering, geometry or audio errors                                                               |

| Member                                          | Meaning                                                                                              |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `setLook(look, { transition })`                 | Switch looks (smooth by default). Custom formulas compile in the background first; returns a Promise |
| `setAudio(input)`                               | Change the audio source (rejects if the microphone is refused)                                       |
| `setAudioLevels({ low, mid, high, transient })` | Feed your own analysis when audio is `"manual"` (0..1 each)                                          |
| `audioGain` / `audioDepth`                      | Read/write input gain / depth override (`undefined` = the look's)                                    |
| `ripple()`                                      | Launch a shockwave (if the look enables shockwaves)                                                  |
| `cycle()`                                       | Collapse → explode → reform. `false` if disabled, paused or already running                          |
| `play()` / `pause()` / `paused`                 | Motion; a paused field keeps its frame and stays draggable                                           |
| `resetView()`                                   | Camera back to the look's viewpoint (double-click does this when `interactive`)                      |
| `look`                                          | The current design                                                                                   |
| `audioStatus`                                   | E.g. `"Listening to the microphone"`, `"Microphone access denied"`                                   |
| `particleCount`                                 | Particles drawn in the last frame                                                                    |
| `qualityLevel` / `setQuality(setting)`          | Current level (0 = as authored, higher is lighter) / switch between `"auto"` and a fixed quality     |
| `supported`                                     | `false` when WebGL2 could not start (see `poster`, `onError`)                                        |
| `canvas`                                        | The canvas in use                                                                                    |
| `destroy()`                                     | Stop, free the GPU program and audio, remove a canvas it created                                     |

### Looks

```js
import { LOOKS, resolveLook, fetchLook } from "@absolumont/particles-designer";

LOOKS.map((look) => look.id); // every factory look, in bank order
resolveLook("Galaxy drift"); // id, name (any case), object or JSON → validated design
const mine = await fetchLook("/looks/my-look.json");
```

Designs are validated with the Designer's own schema: unknown settings,
out-of-range values or invalid formulas are rejected with an error, never
half-applied.

### Audio

| `audio`            | Behaviour                                                                 |
| ------------------ | ------------------------------------------------------------------------- |
| `"none"`           | No modulation                                                             |
| `"demo"`           | Silent built-in pulse                                                     |
| `"microphone"`     | Default input; asks permission; analysed only, never sent to the speakers |
| `HTMLMediaElement` | An `<audio>`/`<video>`; it keeps playing through the speakers             |
| `MediaStream`      | Any stream (WebRTC, capture…), analysis only                              |
| `"manual"`         | Your own analysis via `setAudioLevels()`                                  |

Bands are low 20–250 Hz (expansion), mid 250–4000 Hz (twist), high 4–16 kHz
(point size), plus a transient (rising low) that launches ripples and, when the
look enables it, the collapse cycle. The look's **Audio depth** scales the
response. Every factory look is audio-reactive (Audio depth at least 1) and can
fire ripples and the collapse cycle; nothing moves until you choose an `audio`
input. `audioDepth` (attribute `audio-depth`) overrides a look's depth, e.g. to
calm a look down or to make your own design with depth 0 react.

- Browsers start audio suspended; the kit resumes it on the first click, key
  press or media `play`.
- Media from another origin must be served with CORS and use
  `crossorigin="anonymous"`, or the analysis stays silent.
- A media element can feed only one audio graph; the kit shares it between fields.

## Quality and performance

A look is authored for a good GPU. By default (`quality: "auto"`) each field watches
its own frame times and, when the device cannot hold about 60 fps, steps down a
ladder that trades the least noticeable things first, then raises quality again once
there is headroom:

| Level | Particles | Ribbons | Resolution |
| ----- | --------- | ------- | ---------- |
| 0     | 100%      | 100%    | 100%       |
| 1     | 80%       | 50%     | 100%       |
| 2     | 60%       | 25%     | 85%        |
| 3     | 45%       | off     | 75%        |
| 4     | 30%       | off     | 65%        |
| 5     | 20%       | off     | 55%        |

- **Fast reaction.** The first change comes within a couple of seconds (about five on
  a device running at a few fps), and a very slow device drops several levels at once.
- **It only keeps changes that help.** If lowering quality does not speed frames up
  (a 30 fps battery-saver cap, a busy page), it puts quality back and stops adapting.
- **No hunting.** A better level is retried only after several seconds of headroom, and
  a level that fails again right away is not tried again.
- **Pinning.** `quality: "high"` always draws the look as authored (level 0);
  `"medium"` (2) and `"low"` (4) pin a lighter level, e.g. for a page's battery-saver
  switch: `field.setQuality("low")`. Ribbon opacity is compensated when ribbons are
  thinned, so looks keep their character.
- **Reading it.** `field.qualityLevel`, `onQualityChange`, and the element's
  `particle-field-quality` event.

**No WebGL2.** `field.supported` is `false`, `onError` fires once, the render loop does
not run, and `poster` (an image URL) fills the canvas so the page does not show an
empty box. Or check `supported` and show your own fallback.

## Recipes

**Background behind content.** The field is additive light on black, so
`mix-blend-mode: screen` drops the black over any page background:

```css
.hero {
  position: relative;
}
.hero particle-field {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  mix-blend-mode: screen;
  pointer-events: none;
}
```

**Performance.** Leave `quality` on `auto` (see below). For a light background you
can also cap the work up front with `max-particles="60000"` and `pixel-ratio="1"`.
Fields stop rendering when offscreen. A paused field renders only when something
changes (resize, drag, transition).

**Frameworks.** Create the field when the element mounts and call `destroy()`
when it unmounts. In React:

```jsx
useEffect(() => {
  const field = new ParticleField(ref.current, { look });
  return () => field.destroy();
}, []);
```

Or use `<particle-field>` directly: it cleans up when removed from the DOM.

## Examples

`examples/` (served by `npm run examples`): basic, script tag, web component,
gallery, hero background, audio, custom design, and quality (live level, particle
count and fps readouts, with a button that piles on load to watch it adapt).
`npm run rehearse:embed` checks them in a real browser, along with the Designer's
Embed snippet; `npm run rehearse:quality` exercises adaptive quality on a deliberately
slow (software-rendered) device.

## Limits

- Adaptive quality reacts to the page's frame rate, which every field shares: with
  several fields on one page they step down together (and stop when it does not help).
- One WebGL2 context per field. Browsers cap live contexts (about 16), so use a
  handful per page, not dozens.
- The Designer's "4 fields" mode, automatic shape journey and ROTO-CONTROL are
  Designer features, not part of the kit.
- The background is black (opaque canvas); use blending as shown above.
