# Desktop app (Electron, macOS)

The Designer runs as a Mac app: the same web build (`dist/`) served from a loopback host inside the
Electron main process (`electron/host.ts`), plus the `/api/generate` and `/api/slots` handlers the
Vite dev server mounts. No IPC, no preload.

## Commands

- `npm run electron:dev` — build the full site (Designer, `examples/`, `roto/`, `dist-embed/`) and the
  shell, then launch with Electron.
- `npm run dist:mac` — package a universal (Apple Silicon + Intel), ad-hoc signed app into `release/`:
  `mac-universal/Particles Designer.app` and `Particles-Designer-<version>-mac.dmg`.
- `npm run icon` — regenerate `electron/icon.png` / `icon.icns`.

## Data (`~/Library/Application Support/Particles Designer`)

- `slots.json` — saved Preset/Shape library, shared with `npm run dev`.
- `update.json` — the version skipped in the update notice ("Skip This Version").
- `config.env` — created on first launch; set `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_REASONING_EFFORT`
  to enable AI generation (no secrets are baked into the app). Restart after editing.

## Notes

- Preferred port 5181 (falls back to a free one). Allowed device permissions: MIDI (ROTO), audio input, fullscreen.

## Releases and updates

Pushing a version tag (`npm version patch && git push --follow-tags`) runs `publish.yml`: after the npm
publish and the GitHub Release, a macOS job runs `npm run dist:mac` and attaches the `.dmg` to the release.

The packaged app checks the latest GitHub Release 5 s after launch (and on **Particles Designer → Check
for Updates…**). When it is newer and carries a `.dmg`, a dialog offers **Download** (opens the release
page), **Later** or **Skip This Version**. Unsigned apps cannot replace themselves on macOS, so
installing is manual: open the `.dmg` and drag the app over the old one in Applications.

## Installing (not signed by Apple)

The app is ad-hoc signed, not signed with an Apple Developer ID nor notarized, so macOS blocks a copy
downloaded from the internet on first launch (right-click → Open no longer bypasses this on macOS 15+):

1. Open the `.dmg` and drag **Particles Designer** to Applications.
2. Open it once; macOS says it cannot verify the developer. Click **Done**.
3. System Settings → **Privacy & Security** → scroll to Security → **Open Anyway**, then confirm.

Later launches open normally. Alternatively: `xattr -dr com.apple.quarantine "/Applications/Particles Designer.app"`.
With a Developer ID, set `mac.identity`, re-enable `hardenedRuntime` and add notarization to drop these steps
(and switch to real auto-updates with `electron-updater`).
