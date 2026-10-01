/**
 * Electron shell for the Particles Designer. The renderer is the same web app the browser gets,
 * served from a loopback host owned by this process (electron/host.ts). No IPC, no preload.
 *
 * User data (~/Library/Application Support/Particles Designer):
 *   slots.json   saved Preset/Shape library (shared with `npm run dev`)
 *   config.env   optional OPENAI_API_KEY / OPENAI_MODEL / OPENAI_REASONING_EFFORT for AI generation
 *   update.json  the release version the user chose to skip in the update notice
 */
import { app, BrowserWindow, dialog, Menu, screen, session, shell } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { createHost } from "./host";
import { checkForUpdate } from "./updateCheck";

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
const updatePath = join(userData, "update.json");

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

function skippedVersion(): string | undefined {
  try {
    return (JSON.parse(readFileSync(updatePath, "utf8")) as { skipped?: string }).skipped;
  } catch {
    return undefined;
  }
}

/** Unsigned builds cannot self-update: offer the GitHub Release page instead. */
async function offerUpdate(manual: boolean) {
  const current = app.getVersion();
  let update;
  try {
    update = await checkForUpdate(current);
  } catch (error) {
    if (manual)
      void dialog.showMessageBox({
        type: "warning",
        message: "Could not check for updates",
        detail: error instanceof Error ? error.message : String(error),
      });
    return;
  }
  if (!update) {
    if (manual)
      void dialog.showMessageBox({
        message: "You're up to date",
        detail: `${APP_NAME} ${current} is the latest version.`,
      });
    return;
  }
  if (!manual && update.version === skippedVersion()) return;
  const { response } = await dialog.showMessageBox({
    message: `${APP_NAME} ${update.version} is available`,
    detail: `You have ${current}. Download the new .dmg from the release page, then replace the app in Applications.`,
    buttons: ["Download", "Later", "Skip This Version"],
    defaultId: 0,
    cancelId: 1,
  });
  if (response === 0) void shell.openExternal(update.url);
  if (response === 2) writeFileSync(updatePath, JSON.stringify({ skipped: update.version }));
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
    // No title bar: content runs to the top edge; the traffic lights appear only on hover.
    titleBarStyle: "hidden",
    trafficLightPosition: { x: 14, y: 12 },
    webPreferences: { backgroundThrottling: false },
  });
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(origin)) return { action: "allow" };
    void shell.openExternal(url);
    return { action: "deny" };
  });
  // Thin invisible strip so the window can still be dragged without a title bar. It has to be a
  // real element: Chromium ignores -webkit-app-region on pseudo-elements.
  win.webContents.on("did-finish-load", () => {
    void win?.webContents.executeJavaScript(`(() => {
      if (document.getElementById("electron-drag")) return;
      const d = document.createElement("div");
      d.id = "electron-drag";
      d.style.cssText = "position:fixed;top:0;left:0;right:0;height:28px;z-index:2147483647;-webkit-app-region:drag";
      document.body.appendChild(d);
    })()`);
  });
  if (process.platform === "darwin") {
    const w = win;
    w.setWindowButtonVisibility(false);
    const timer = setInterval(() => {
      if (w.isDestroyed()) return;
      const { x, y } = screen.getCursorScreenPoint();
      const b = w.getBounds();
      const near = x >= b.x && x <= b.x + 140 && y >= b.y && y <= b.y + 44;
      w.setWindowButtonVisibility(near || w.isFullScreen());
    }, 100);
    w.on("closed", () => clearInterval(timer));
  }
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
      {
        label: APP_NAME,
        submenu: [
          { role: "about" },
          { label: "Check for Updates…", click: () => void offerUpdate(true) },
          { type: "separator" },
          { role: "services" },
          { type: "separator" },
          { role: "hide" },
          { role: "hideOthers" },
          { role: "unhide" },
          { type: "separator" },
          { role: "quit" },
        ],
      },
      { role: "editMenu" },
      { role: "viewMenu" },
      { role: "windowMenu" },
    ]),
  );
  openWindow();
  // Quietly, once per launch; dev runs (electron .) carry the source version and would nag.
  if (app.isPackaged) setTimeout(() => void offerUpdate(false), 5_000);
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
