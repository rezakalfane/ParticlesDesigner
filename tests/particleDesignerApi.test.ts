import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, it, expect, vi } from "vitest";
import { createParticleDesignerApi, DESIGNER_INSTRUCTIONS } from "../server/designerApi";
import {
  DESIGN_GROUPS,
  DESIGN_IMAGE_MAX_CHARS,
  DESIGN_RANGES,
  parseDesign,
} from "../src/designer/design";
import { LAB_PRESETS } from "../src/designer/presets";
const current = LAB_PRESETS.find((p) => p.id === "sahara-drift")!;
const env = {
  OPENAI_API_KEY: "test-secret",
  OPENAI_MODEL: "gpt-6-luna",
  OPENAI_REASONING_EFFORT: "low",
};
function exchange(
  body: unknown = { prompt: "Golden dunes", current },
  origin = "http://localhost:5173",
) {
  const req = Readable.from([JSON.stringify(body)]) as IncomingMessage;
  Object.assign(req, {
    method: "POST",
    headers: { origin, host: "localhost:5173", "content-type": "application/json" },
    socket: { remoteAddress: "127.0.0.1" },
  });
  const result = { status: 0, body: "" };
  const res = {
    writeHead: (code: number) => {
      result.status = code;
    },
    end: (body: string) => {
      result.body = body;
    },
  } as unknown as ServerResponse;
  return { req, res, result };
}
describe("Designer OpenAI host", () => {
  it("keeps credentials server-side and validates the generated design", async () => {
    const upstream = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            status: "completed",
            output: [{ content: [{ type: "output_text", text: JSON.stringify(current) }] }],
          }),
        ),
    );
    const api = createParticleDesignerApi(env, upstream as typeof fetch);
    const x = exchange();
    await api(x.req, x.res);
    expect(x.result.status).toBe(200);
    expect(x.result.body).not.toContain("test-secret");
    const options = (upstream.mock.calls as unknown as [string, RequestInit][])[0][1];
    const payload = JSON.parse(options.body as string);
    expect(payload.model).toBe("gpt-6-luna");
    expect(payload.reasoning.effort).toBe("low");
    expect(payload.store).toBe(false);
    expect(payload.text.format.strict).toBe(true);
    expect(payload.instructions).toBe(DESIGNER_INSTRUCTIONS);
  });
  it("describes every design setting and group to the model", () => {
    // Each setting is named with its range, e.g. "Halo glow 0..1"; rotation axes share one line.
    for (const key of Object.keys(DESIGN_RANGES)) {
      const name = key.replace(/^Rotation [XYZ]$/, "Rotation X/Y/Z").replace(/[/]/g, "\\/");
      expect(DESIGNER_INSTRUCTIONS, key).toMatch(new RegExp(`${name} \\d`));
    }
    for (const group of DESIGN_GROUPS) expect(DESIGNER_INSTRUCTIONS, group).toContain(`${group} (`);
  });
  it("rejects cross-origin, oversized and invalid requests before calling OpenAI", async () => {
    const upstream = vi.fn();
    const api = createParticleDesignerApi(env, upstream);
    for (const [body, origin, expected] of [
      [{ prompt: "test", current }, "https://elsewhere.test", 403],
      [
        { prompt: "x".repeat(40000 + DESIGN_IMAGE_MAX_CHARS), current },
        "http://localhost:5173",
        413,
      ],
      [{ prompt: "test", current: { ...current, formation: 100 } }, "http://localhost:5173", 400],
    ] as const) {
      const x = exchange(body, origin);
      await api(x.req, x.res);
      expect(x.result.status).toBe(expected);
    }
    expect(upstream).not.toHaveBeenCalled();
  });
  it("sends an attached inspiration photo as an image input", async () => {
    const upstream = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            status: "completed",
            output: [{ content: [{ type: "output_text", text: JSON.stringify(current) }] }],
          }),
        ),
    );
    const api = createParticleDesignerApi(env, upstream as typeof fetch);
    const image = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
    const x = exchange({ prompt: "Like this", current, image });
    await api(x.req, x.res);
    expect(x.result.status).toBe(200);
    const payload = JSON.parse(
      (upstream.mock.calls as unknown as [string, RequestInit][])[0][1].body as string,
    );
    expect(payload.input[0].content[0]).toEqual({
      type: "input_text",
      text: JSON.stringify({
        prompt: "Like this",
        current: JSON.parse(JSON.stringify(parseDesign(current))),
      }),
    });
    expect(payload.input[0].content[1]).toEqual({
      type: "input_image",
      image_url: image,
      detail: "low",
    });
  });
  it("rejects invalid or oversized photos before calling OpenAI", async () => {
    const upstream = vi.fn();
    const api = createParticleDesignerApi(env, upstream);
    for (const image of [
      "https://elsewhere.test/a.jpg",
      "data:image/svg+xml;base64,PHN2Zz4=",
      "data:image/png;base64,<script>",
      `data:image/png;base64,${"A".repeat(DESIGN_IMAGE_MAX_CHARS)}`,
      42,
    ]) {
      const x = exchange({ prompt: "test", current, image });
      await api(x.req, x.res);
      expect(x.result.status).toBeGreaterThanOrEqual(400);
    }
    expect(upstream).not.toHaveBeenCalled();
  });
  it("does not leak upstream errors or apply incomplete results", async () => {
    for (const response of [
      new Response("test-secret", { status: 401 }),
      new Response(JSON.stringify({ status: "incomplete" })),
      new Response(JSON.stringify({ status: "completed", output: [] })),
    ]) {
      const api = createParticleDesignerApi(env, async () => response);
      const x = exchange();
      await api(x.req, x.res);
      expect(x.result.status).toBeGreaterThanOrEqual(400);
      expect(x.result.body).not.toContain("test-secret");
    }
  });
});
