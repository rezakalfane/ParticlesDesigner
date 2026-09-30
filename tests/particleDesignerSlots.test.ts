import { Readable } from "node:stream";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it } from "vitest";
import { createDesignerSlotsApi } from "../server/designerSlots";
import { LAB_PRESETS } from "../src/designer/presets";

const preset = LAB_PRESETS.find((p) => p.id === "sahara-drift")!;
const shape = { name: "My dune", formation: 29, settings: { Expansion: 0.85 } };

function call(
  api: ReturnType<typeof createDesignerSlotsApi>,
  method: string,
  body?: unknown,
  origin = "http://192.168.1.11:5173",
) {
  const req = Readable.from(body === undefined ? [] : [JSON.stringify(body)]) as IncomingMessage;
  Object.assign(req, {
    method,
    headers: { origin, host: "192.168.1.11:5173", "content-type": "application/json" },
    socket: { remoteAddress: "192.168.1.20" },
  });
  const result = { status: 0, body: "" };
  const res = {
    writeHead: (code: number) => {
      result.status = code;
    },
    end: (text: string) => {
      result.body = text;
    },
  } as unknown as ServerResponse;
  return api(req, res).then(() => ({ status: result.status, data: JSON.parse(result.body) }));
}
const tempFile = () =>
  join(mkdtempSync(join(tmpdir(), "particles-designer-")), "sub", "slots.json");

describe("Designer shared slot library", () => {
  it("serves an empty library, then shares saved slots with every device", async () => {
    const file = tempFile();
    const api = createDesignerSlotsApi(file);
    expect((await call(api, "GET")).data).toEqual({ version: 1, presets: {}, shapes: {} });
    expect((await call(api, "PUT", { kind: "presets", slot: 31, item: preset })).status).toBe(200);
    expect((await call(api, "PUT", { kind: "shapes", slot: "40", item: shape })).status).toBe(200);
    const phone = createDesignerSlotsApi(file); // a fresh host process reads the same file
    const { data } = await call(phone, "GET");
    expect(data.presets["31"].name).toBe(preset.name);
    expect(data.presets["31"].id).toBe("user-31");
    expect(data.shapes["40"].name).toBe("My dune");
  });
  it("keeps concurrent saves of different slots", async () => {
    const api = createDesignerSlotsApi(tempFile());
    await Promise.all(
      [32, 33, 34].map((slot) => call(api, "PUT", { kind: "presets", slot, item: preset })),
    );
    expect(Object.keys((await call(api, "GET")).data.presets).sort()).toEqual(["32", "33", "34"]);
  });
  it("rejects cross-origin and invalid writes", async () => {
    const file = tempFile();
    const api = createDesignerSlotsApi(file);
    const put = { kind: "presets", slot: 1, item: preset };
    expect((await call(api, "PUT", put, "https://elsewhere.test")).status).toBe(403);
    expect((await call(api, "PUT", { ...put, slot: 64 })).status).toBe(400);
    expect((await call(api, "PUT", { ...put, kind: "scenes" })).status).toBe(400);
    expect((await call(api, "PUT", { ...put, item: { ...preset, formation: 100 } })).status).toBe(
      400,
    );
    expect((await call(api, "GET")).data.presets).toEqual({});
  });
  it("never overwrites an unreadable library", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "particles-designer-")), "slots.json");
    writeFileSync(file, "{broken");
    const api = createDesignerSlotsApi(file);
    expect((await call(api, "GET")).status).toBe(500);
    expect((await call(api, "PUT", { kind: "presets", slot: 1, item: preset })).status).toBe(500);
    expect(readFileSync(file, "utf8")).toBe("{broken");
  });
});
