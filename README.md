# Particles Designer

**ABSOLUMONT / Particles Designer** — author luminous GPU particle fields in the
browser: 1k–200k procedural WebGL2 points forming built-in, baked or AI-invented
shapes, with light, ribbons, attractors, motion, shockwaves, a collapse → explode →
reform cycle and audio reactivity. Browse four banks of factory looks and shapes,
save your own, describe a field in words (optionally with an inspiration photo),
and play it all from a ROTO-CONTROL.

Originally built inside LUMEN; this repository is the standalone tool.

## Quick start

```sh
npm install
npm run dev          # http://localhost:5180/
```

Chrome or Edge is recommended (Web MIDI for ROTO-CONTROL; WebGL2 required).

### AI design generation (optional)

The prompt bar calls the local dev host at `/api/generate`, which talks to OpenAI
server-side. Copy `.env.example` to `.env.local`, fill in `OPENAI_API_KEY`, and
restart `npm run dev`. The key is never sent to the browser, and generation only
accepts loopback requests.

### Saved slots

Saved presets and shapes are written by the dev host to one JSON library
(`~/Library/Application Support/Particles Designer/slots.json` on macOS; override
with `PARTICLES_DESIGNER_DATA_DIR`), so every device that opens the dev server
shares them. Browser storage is the fallback when no host is available.
`npm run bake` turns saved work into factory code (see docs).

## Scripts

| Command                 | What it does                                                    |
| ----------------------- | --------------------------------------------------------------- |
| `npm run dev`           | Vite dev server with the Designer host APIs (LAN-exposed)       |
| `npm run build`         | Typecheck + static build in `dist/`                             |
| `npm run preview`       | Serve the build with the host APIs                              |
| `npm test`              | Unit tests (Vitest)                                             |
| `npm run verify`        | Format check, typecheck, tests and build                        |
| `npm run bake`          | Bake the saved slot library into factory shapes/looks           |
| `npm run roto:presets`  | Regenerate the ROTO-CONTROL setup files in `roto/`              |
| `npm run rehearse:roto` | Browser rehearsal with simulated Web MIDI (needs `npm run dev`) |

## Layout

```
index.html            Designer page
src/engine/           WebGL2 particle renderer, custom geometry compiler, baked shapes, cycle
src/looks/            Factory catalog: looks, studies, baked looks, 4×16 factory slots
src/designer/         Designer UI: main loop, design schema, banks, dialogs, history, ROTO layout
src/roto/             ROTO-CONTROL Web MIDI driver and setup parser
server/               Dev-host APIs: AI generation (/api/generate), saved slots (/api/slots)
scripts/              Bake, ROTO preset generation, browser rehearsal
roto/                 ROTO-SETUP files (MIDI channels 9–11)
docs/                 DESIGNER.md (full reference), ROTO-CONTROL.md (hardware map)
tests/                Vitest suites
```

The renderer is the embedding seam: `new ParticleRenderer(canvas)` then
`render(timeMs, drive)` every frame, and `dispose()` when done. It owns no loop,
clock, DOM or audio.

## Roadmap

- Electron packaging (desktop app hosting the same APIs)
- Documentation site
- Embed kit: a small library + sample code to drop a particle system into any web page
