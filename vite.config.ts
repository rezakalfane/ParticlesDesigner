import type { IncomingMessage, ServerResponse } from "node:http";
import { loadEnv } from "vite";
import { defineConfig, type Plugin } from "vitest/config";
import { createParticleDesignerApi, DESIGNER_API } from "./server/designerApi";
import { createDesignerSlotsApi, DESIGNER_SLOTS_API } from "./server/designerSlots";

/**
 * The Designer's host APIs, served by the dev and preview servers:
 *  - /api/generate — AI design generation (OpenAI key stays server-side, loopback only);
 *  - /api/slots    — the saved Preset/Shape slot library (one JSON file in the data dir).
 * A static build without this host still runs: generation and shared slots report
 * themselves unavailable and saving falls back to browser storage.
 */
function designerHost(): Plugin {
  const api = createParticleDesignerApi({
    ...loadEnv("development", process.cwd(), "OPENAI_"),
    ...process.env,
  });
  const slots = createDesignerSlotsApi();
  const middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const path = req.url?.split("?")[0];
    if (path === DESIGNER_API) void api(req, res);
    else if (path === DESIGNER_SLOTS_API) void slots(req, res);
    else next();
  };
  return {
    name: "particles-designer-host",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

export default defineConfig({
  plugins: [designerHost()],
  server: { port: 5180 },
  preview: { port: 5180 },
  build: { outDir: "dist", target: "es2022" },
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
