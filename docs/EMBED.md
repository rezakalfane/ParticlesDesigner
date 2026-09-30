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

| Attribute       | Meaning                                                                             |
| --------------- | ----------------------------------------------------------------------------------- |
| `look`          | Factory look id or name (`deep-sea`, `Galaxy drift`…). Live: changes transition     |
| `src`           | URL of a design JSON (Designer → Embed → Download JSON)                             |
| `audio`         | `none` (default), `demo`, `microphone`, or a CSS selector of an `<audio>`/`<video>` |
| `audio-gain`    | Input gain before the look's Audio depth (default 1)                                |
| `audio-depth`   | Overrides the look's Audio depth (0–2) and turns its audio response on              |
| `interactive`   | Drag to orbit                                                                       |
| `zoom`          | Wheel zoom (captures page scrolling over the field)                                 |
| `paused`        | Frozen frame; remove the attribute to play                                          |
| `max-particles` | Particle ceiling (default 200000)                                                   |
| `pixel-ratio`   | Highest device pixel ratio (default 1.5)                                            |

The element is a block that fills its CSS size (300×150 if you set none).
`element.field` is the underlying `ParticleField`; `element.look = designObject`
sets a design directly. Errors dispatch a cancelable `particle-field-error` event
(`event.detail` is the Error).

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

| Option              | Default         | Meaning                                                            |
| ------------------- | --------------- | ------------------------------------------------------------------ |
| `look`              | `"deep-sea"`    | Factory id or name, a design object, or design JSON text           |
| `audio`             | `"none"`        | See [Audio](#audio)                                                |
| `audioGain`         | `1`             | Input gain applied before the look's Audio depth                   |
| `audioDepth`        | the look's      | Overrides Audio depth (0–2) and turns the look's audio response on |
| `interactive`       | `false`         | Drag to orbit the camera                                           |
| `zoom`              | `false`         | Wheel/trackpad zoom (captures scrolling over the field)            |
| `maxParticles`      | `200000`        | Ceiling; denser looks are capped                                   |
| `pixelRatio`        | `1.5`           | Highest device pixel ratio used                                    |
| `maxResolution`     | `[1920, 1080]`  | Canvas size ceiling in device pixels                               |
| `autoplay`          | `true`          | `false` under `prefers-reduced-motion` (a still frame is shown)    |
| `pauseWhenHidden`   | `true`          | No rendering while offscreen or in a background tab                |
| `transitionSeconds` | `1.8`           | Look-to-look transition                                            |
| `onError`           | `console.error` | Rendering, geometry or audio errors                                |

| Member                                          | Meaning                                                                                              |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `setLook(look, { transition })`                 | Switch looks (smooth by default). Custom formulas compile in the background first; returns a Promise |
| `setAudio(input)`                               | Change the audio source (rejects if the microphone is refused)                                       |
| `setAudioLevels({ low, mid, high, transient })` | Feed your own analysis when audio is `"manual"` (0..1 each)                                          |
| `audioGain` / `audioDepth`                      | Read/write input gain / depth override (`undefined` = the look's)                                    |
| `ripple()`                                      | Launch a shockwave (if the look enables shockwaves)                                                  |
| `cycle()`                                       | Collapse → explode → reform. `false` if disabled, paused or already running                          |
| `play()` / `pause()` / `paused`                 | Motion; a paused field keeps its frame and stays draggable                                           |
| `look`                                          | The current design                                                                                   |
| `audioStatus`                                   | E.g. `"Listening to the microphone"`, `"Microphone access denied"`                                   |
| `particleCount`                                 | Particles drawn in the last frame                                                                    |
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
response. **Most factory looks ship with Audio depth 0 or their audio switched
off** (they were authored as visuals), so pass `audioDepth: 1` (attribute
`audio-depth="1"`) to make any look react, or raise it in the Designer before
exporting.

- Browsers start audio suspended; the kit resumes it on the first click, key
  press or media `play`.
- Media from another origin must be served with CORS and use
  `crossorigin="anonymous"`, or the analysis stays silent.
- A media element can feed only one audio graph; the kit shares it between fields.

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

**Performance.** Particle count and pixels dominate cost. For backgrounds and
phones, use `max-particles="60000"` to `"80000"` and `pixel-ratio="1"`. Fields
stop rendering when offscreen. A paused field renders only when something changes
(resize, drag, transition).

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
gallery, hero background, audio, custom design. `npm run rehearse:embed` checks
them all in a real browser, along with the Designer's Embed snippet.

## Limits

- One WebGL2 context per field. Browsers cap live contexts (about 16), so use a
  handful per page, not dozens.
- The Designer's "4 fields" mode, automatic shape journey and ROTO-CONTROL are
  Designer features, not part of the kit.
- The background is black (opaque canvas); use blending as shown above.
