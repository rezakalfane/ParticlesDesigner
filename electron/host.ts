/**
 * Desktop host (NODE ONLY, no electron imports): serves the built Designer (dist/) and the same
 * /api/* handlers the Vite dev/preview servers mount, over loopback.
 */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { createParticleDesignerApi, DESIGNER_API } from "../server/designerApi";
import { createDesignerSlotsApi, DESIGNER_SLOTS_API } from "../server/designerSlots";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".wasm": "application/wasm",
  ".woff2": "font/woff2",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
};

export interface HostOptions {
  /** Directory holding the built app (index.html). */
  root: string;
  /** Slot library file (defaults to the per-user data dir). */
  slotsFile?: string;
  /** Environment for the AI generation API (OPENAI_*). */
  env: Record<string, string | undefined>;
}

async function serveStatic(root: string, req: IncomingMessage, res: ServerResponse) {
  const path = decodeURIComponent((req.url ?? "/").split("?")[0]);
  const file = normalize(join(root, path));
  if (file !== root && !file.startsWith(root + sep)) {
    res.writeHead(403).end();
    return;
  }
  let target = file;
  try {
    if ((await stat(target)).isDirectory()) target = join(target, "index.html");
    await stat(target);
  } catch {
    // SPA fallback only for extension-less routes; missing assets are real 404s.
    if (extname(path)) {
      res.writeHead(404).end("Not found");
      return;
    }
    target = join(root, "index.html");
  }
  res.writeHead(200, {
    "Content-Type": TYPES[extname(target)] ?? "application/octet-stream",
    "Cache-Control": "no-cache",
  });
  if (req.method === "HEAD") res.end();
  else createReadStream(target).pipe(res);
}

export function createHost(options: HostOptions): Server {
  const root = normalize(options.root);
  const api = createParticleDesignerApi(options.env);
  const slots = createDesignerSlotsApi(options.slotsFile);
  return createServer((req, res) => {
    const path = req.url?.split("?")[0];
    if (path === DESIGNER_API) void api(req, res);
    else if (path === DESIGNER_SLOTS_API) void slots(req, res);
    else
      serveStatic(root, req, res).catch(() => {
        if (!res.headersSent) res.writeHead(500);
        res.end();
      });
  });
}
