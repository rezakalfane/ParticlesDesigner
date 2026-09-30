/**
 * Particle Designer saved-slot library (NODE ONLY). The Designer's user
 * Preset/Shape slots live in ONE JSON file under the app data dir so every
 * device that opens the dev server (desktop, phone, `localhost` or the LAN
 * address) sees the same library.
 *
 *  - GET  → the whole library (missing file = empty library);
 *  - PUT  {kind, slot, item} → validates and writes ONE slot (item null deletes it), so two devices
 *    saving different slots never overwrite each other;
 *  - writes are same-origin only, bounded, serialized and atomic (tmp + rename);
 *  - an unreadable file is never overwritten (writes refuse until it is fixed).
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, join } from "node:path";
import {
  parseSlotItem,
  SLOT_KEY,
  parseUserSlots,
  type SlotKind,
  type UserSlots,
} from "../src/designer/design";
import { defaultDataDir } from "./dataDir";

export const DESIGNER_SLOTS_API = "/api/slots";
const MAX_BODY_BYTES = 256 * 1024;

export function defaultDesignerSlotsFile(env: NodeJS.ProcessEnv = process.env): string {
  return join(defaultDataDir(env), "slots.json");
}

export function createDesignerSlotsApi(file = defaultDesignerSlotsFile()) {
  let queue: Promise<unknown> = Promise.resolve();
  const read = async (): Promise<UserSlots> => {
    let text: string;
    try {
      text = await readFile(file, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return { version: 1, presets: {}, shapes: {} };
      throw error;
    }
    return parseUserSlots(JSON.parse(text));
  };
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const send = (code: number, data: unknown) => {
      res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify(data));
    };
    if (req.method === "GET") {
      try {
        return send(200, await read());
      } catch {
        return send(500, { error: `The saved Designer library at ${file} could not be read.` });
      }
    }
    if (req.method !== "PUT") return send(405, { error: "Use GET or PUT." });
    let origin: URL;
    try {
      origin = new URL(req.headers.origin ?? "");
    } catch {
      return send(403, { error: "A same-origin request is required." });
    }
    if (origin.host !== req.headers.host || !["http:", "https:"].includes(origin.protocol))
      return send(403, { error: "A same-origin request is required." });
    if (!req.headers["content-type"]?.startsWith("application/json"))
      return send(415, { error: "Use JSON." });
    let kind: SlotKind, slot: string, item: UserSlots[SlotKind][string] | null;
    try {
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (Buffer.byteLength(body) > MAX_BODY_BYTES)
          return send(413, { error: "Saved slot is too large." });
      }
      const data = JSON.parse(body);
      if (data.kind !== "presets" && data.kind !== "shapes") throw new Error();
      kind = data.kind;
      slot = String(data.slot);
      if (data.item === null) {
        if (!SLOT_KEY.test(slot)) throw new Error();
        item = null;
      } else item = parseSlotItem(kind, slot, data.item);
    } catch {
      return send(400, { error: "Invalid saved slot." });
    }
    const write = queue.then(async () => {
      const slots = await read();
      const entries = { ...slots[kind] } as Record<string, unknown>;
      if (item === null) delete entries[slot];
      else entries[slot] = item;
      const next = { ...slots, [kind]: entries } as UserSlots;
      await mkdir(dirname(file), { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(next, null, 2));
      await rename(tmp, file);
      return next;
    });
    queue = write.catch(() => undefined);
    try {
      send(200, await write);
    } catch {
      send(500, { error: "The slot could not be saved on the host." });
    }
  };
}
