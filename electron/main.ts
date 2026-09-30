/**
 * Electron shell for the Particles Designer. The renderer is the same web app the browser gets,
 * served from a loopback host owned by this process (electron/host.ts). No IPC, no preload.
 *
 * User data (~/Library/Application Support/Particles Designer):
 *   slots.json   saved Preset/Shape library (shared with `npm run dev`)
 *   config.env   optional OPENAI_API_KEY / OPENAI_MODEL / OPENAI_REASONING_EFFORT for AI generation
 */
import { app, BrowserWindow, Menu, session, shell } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { createHost } from "./host";

const APP_NAME = "Particles Designer";
const PREFERRED_PORT = 5181;

// Thin, auto-hiding overlay scrollbars, as in Chrome (Electron otherwise draws classic ones).
app.commandLine.appendSwitch("enable-features", "OverlayScrollbar");

app.setName(APP_NAME);
app.setPath("userData", join(app.getPath("appData"), APP_NAME));

const userData = app.getPath("userData");
const root = app.isPackaged
  ? join(app.getAppPath(), "dist")
  : join(fileURLToPath(new URL(".", import.meta.url)), "..", "dist");
const configPath = join(userData, "config.env");

const CONFIG_TEMPLATE = `# ${APP_NAME} settings. Restart the app after editing.
# AI design generation (optional):
# OPENAI_API_KEY=
# OPENAI_MODEL=gpt-6-luna
# OPENAI_REASONING_EFFORT=medium
`;

// Only these device permissions: MIDI (Roto-Control), audio input, fullscreen, multi-display.
const ALLOWED = new Set(["media", "midi", "midiSysex", "fullscreen", "window-management"]);

function canListen(port: number, host: string): Promise<number | null> {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once("error", () => resolve(null));
    probe.listen(port, host, () => {
      const bound = (probe.address() as { port: number }).port;
      probe.close(() => resolve(bound));
    });
  });
}

/** Free on every loopback/wildcard address: `localhost` resolves to ::1 first. */
async function findPort(): Promise<number> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const port = await canListen(attempt === 0 ? PREFERRED_PORT : 0, "127.0.0.1");
    if (!port) continue;
    let free = true;
    for (const host of ["::1", "::", "0.0.0.0"])
      free = free && Boolean(await canListen(port, host));
    if (free) return port;
  }
  throw new Error("No free localhost port");
}

let win: BrowserWindow | null = null;
let origin = "";

function openWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#000000",
    title: APP_NAME,
    webPreferences: { backgroundThrottling: false },
  });
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(origin)) return { action: "allow" };
    void shell.openExternal(url);
    return { action: "deny" };
  });
  win.on("closed", () => (win = null));
  void win.loadURL(origin);
}

async function boot() {
  mkdirSync(userData, { recursive: true });
  if (!existsSync(configPath)) writeFileSync(configPath, CONFIG_TEMPLATE, { mode: 0o600 });
  const env = { ...process.env, ...parseEnv(readFileSync(configPath, "utf8")) };
  const port = await findPort();
  const host = createHost({ root, env });
  await new Promise<void>((resolve) => host.listen(port, "localhost", resolve));
  origin = `http://localhost:${port}`;
  app.on("will-quit", () => host.close());

  session.defaultSession.setPermissionRequestHandler((_wc, p, cb) => cb(ALLOWED.has(p)));
  session.defaultSession.setPermissionCheckHandler((_wc, p) => ALLOWED.has(p));
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { role: "appMenu" },
      { role: "editMenu" },
      { role: "viewMenu" },
      { role: "windowMenu" },
    ]),
  );
  openWindow();
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    if (win?.isMinimized()) win.restore();
    win?.focus();
  });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
  app.on("activate", () => {
    if (origin && !win) openWindow();
  });
  // No top-level await: it would hold back Electron's "ready".
  void app.whenReady().then(boot);
}
