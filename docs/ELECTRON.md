# Desktop app (Electron, macOS)

The Designer runs as a Mac app: the same web build (`dist/`) served from a loopback host inside the
Electron main process (`electron/host.ts`), plus the `/api/generate` and `/api/slots` handlers the
Vite dev server mounts. No IPC, no preload.

## Commands

- `npm run electron:dev` — build the web app and the shell, then launch with Electron.
- `npm run dist:mac` — package (arm64, unsigned) into `release/`: `Particles Designer.app` and a `.dmg`.
- `npm run icon` — regenerate `electron/icon.png` / `icon.icns`.

## Data (`~/Library/Application Support/Particles Designer`)

- `slots.json` — saved Preset/Shape library, shared with `npm run dev`.
- `config.env` — created on first launch; set `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_REASONING_EFFORT`
  to enable AI generation (no secrets are baked into the app). Restart after editing.

## Notes

- Preferred port 5181 (falls back to a free one). Allowed device permissions: MIDI (ROTO), audio input, fullscreen.
- Unsigned: a copy downloaded from elsewhere needs right-click → Open the first time.
