import type { IncomingMessage, ServerResponse } from "node:http";
import { isLoopbackAddress } from "./dataDir";
import { DESIGN_IMAGE_MAX_CHARS, DESIGN_SCHEMA, parseDesign } from "../src/designer/design";
import { LAB_SHAPES } from "../src/designer/banks";
export const DESIGNER_API = "/api/generate";
const IMAGE_DATA_URL = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
/** System instructions: every `settings` key must be described (asserted by tests). */
export const DESIGNER_INSTRUCTIONS = [
  "You design beautiful GPU particle fields for a concert visual designer. Return one complete current design, not a library. The input JSON holds the user's prompt and the current design.",
  "",
  "EDITING",
  "- Preserve unspecified settings when editing; for a new subject choose an appropriate formation and coherent settings.",
  "- If the user only asks to recolor, preserve geometry, view and motion exactly and change only palette/color settings.",
  "- Use only supported controls. Choose a short poetic name and a concise description.",
  "- If a photo is attached, it is inspiration, not a picture to reproduce: translate its colors into palette (and Color variety), its light and mood into Light/Halo glow/Depth softness, its dominant forms and composition into formation or geometry and view, and its implied movement into Motion, Turbulence and Ribbons. The text prompt takes precedence where they conflict.",
  "",
  "FORMATION AND GEOMETRY",
  `- Shapes: ${JSON.stringify(LAB_SHAPES)}.`,
  "- You may create entirely new procedural geometry via formation 30 and geometry {x,y,z} scalar mathematical expression strings. Otherwise geometry must be null. Invent original parametric surfaces when the prompt asks for a new shape rather than forcing the catalog.",
  "- Expressions use seeded particle coordinates a,b,c in [0,1], t as motion time in seconds, pi and tau. Operators + - * / parentheses. Allowed scalar functions sin cos abs sqrt floor fract exp tanh (one argument), min max pow atan (two), mix clamp smoothstep (three). No statements, assignments, loops or other identifiers. Maximum 160 tokens and 600 characters per axis.",
  "- Aim for dimensions -2..2, use a and b as continuous surface coordinates, c for thickness or secondary elements, t for smooth animation. Expressions are independently evaluated, so x/y/z cannot refer to each other.",
  "- For sphere use x=2*sqrt(1-(2*b-1)*(2*b-1))*cos(a*tau), y=2*(2*b-1), z=2*sqrt(1-(2*b-1)*(2*b-1))*sin(a*tau).",
  "- For landscape use formation 29 Flowing dunes, Expansion 0.85, view [-18,32,-5,6.5], Turbulence 0, attractors off, Color drift 0.",
  "",
  "VIEW",
  "- view is [yaw,pitch,roll,distance]: angles -180..180 degrees, distance 3..8 (larger is farther).",
  "",
  "GROUPS",
  "- groups switch whole sections on/off: particles (density, thickness, expansion, dispersion, turbulence), light (Light, colors, halo, depth softness), ribbons (ribbon and trail settings), attractors (the two orbiting centres), motion (flow and rotation), shock (shockwaves), cycle (collapse/explode/reform), audio (sound-driven movement). A disabled group ignores its settings but keeps their values.",
  "- Enable the groups needed for your settings. Keep audio and shock off unless requested.",
  "",
  "SETTINGS (all required, within the ranges of the schema)",
  "Particles & shape:",
  "- Particle density 0..2: 0..1 = 1k..100k particles, 1..2 = 100k..200k. More density is richer but costs GPU time.",
  "- Particle thickness 0..1: point size, 0.35+2.65*x times the base. Independent from ribbon width.",
  "- Expansion 0..4: overall spatial scale (default 0.65; large values can exceed the view).",
  "- Particle dispersion 0..1: scatters particles around the formation; 0 is the clean shape, high values a diffuse cloud.",
  "- Turbulence 0..1: swirl strength. Turbulence scale 0.1..8: swirl size (1 original, larger broad swirls). Turbulence density 0..1: spatial coverage (1 everywhere, 0 none). Preserve scale and density at 1 unless requested.",
  "Light & color:",
  "- Light 0..1: overall brightness of the additive light.",
  "- Color variety 0..5: how many colors are used, 0..5 = 1..6 colors.",
  "- Color drift 0..1: a fixed rotation of all colors around the RGB neutral axis (1 = full turn), NOT an HSV hue and not animated. 0 keeps colors exactly.",
  '- Palette: for explicit color requests always set palette to 1–6 hex RGB colors, ordered along the shape, and Color drift to 0. Do not guess hue offsets. Blue waterfall example palette ["#084BBA","#29A7FF","#C3EBFF"], Color variety 2, Color drift 0. Palette null preserves the renderer\'s original blue/gold or formation-specific colors.',
  "- Halo glow 0..1: a soft glow skirt around each particle head (default 0.4). 0 gives crisp points; 0.3–0.6 a luminous haze; high values with high density cost GPU time.",
  "- Depth softness 0..1: depth-of-field-like defocus of heads away from the Focus plane (default 0.35). 0 keeps everything sharp; higher values give a dreamy, cinematic depth.",
  "- Focus plane 0..1: the depth kept sharp, 0 = nearest particles, 1 = farthest (default 0.5). Only matters when Depth softness is above 0.",
  "Ribbons (light trails following particle history):",
  "- Ribbon length 0..8: trail duration, units multiply by 2.16 seconds (8 = 17.28 s). Avoid long bright trails unless asked.",
  "- Ribbon brightness 0..1: trail intensity.",
  "- Trail head size 1..4: size multiplier of the bright heads anchoring the trails (1 normal). Does not change ribbon width.",
  "- Trail thickness 0.25..16: ribbon width multiplier (1 default; 1.1–1.3 subtle lift; 8–16 broad silky bands, pair with low Ribbon brightness). Does not change particle size.",
  "Attractors (two orbiting centres):",
  "- Attraction 0..1: 0 keeps the formation exact, 1 splits it fully into two smaller orbiting clouds. Attractor separation 0..1: distance between the clouds. Attractor orbit 0..1: their rotation speed.",
  "Motion & rotation:",
  "- Motion 0..1: flow speed of the formation. Rotation X/Y/Z 0..1: continuous auto-rotation speed per axis (1 = 0.6 rad/s), not angles.",
  "Shockwaves and cycle (performance gestures; the values set their strength when triggered):",
  "- Shockwave 0..1: radial displacement of expanding spherical wavefronts.",
  "- Implosion 0..1 and Explosion 0..1: collapse and burst amounts of the collapse → explode → reform cycle. Recovery time 0..1: reform duration, 0.8..6 seconds.",
  "Audio:",
  "- Audio depth 0..2: how strongly audio drives expansion, twist, point size and ripples (1 default).",
].join("\n");
export function createParticleDesignerApi(
  env: Record<string, string | undefined>,
  request: typeof fetch = fetch,
) {
  const models = [
    ...new Set(
      [env.OPENAI_MODEL, "gpt-6-luna", "gpt-6-sol", "gpt-5.6-terra", "gpt-6-astra"].filter(
        (v): v is string => Boolean(v),
      ),
    ),
  ];
  const efforts = ["low", "medium", "high"];
  let busy = false;
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const send = (code: number, data: unknown) => {
      res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify(data));
    };
    if (!isLoopbackAddress(req.socket.remoteAddress))
      return send(403, { error: "Designer generation is local-only." });
    if (req.method === "GET")
      return send(200, {
        model: env.OPENAI_MODEL ?? "Not configured",
        effort: env.OPENAI_REASONING_EFFORT ?? "Not configured",
        choices: models.flatMap((model) => efforts.map((effort) => ({ model, effort }))),
      });
    let origin: URL;
    try {
      origin = new URL(req.headers.origin ?? "");
    } catch {
      return send(403, { error: "A same-origin request is required." });
    }
    if (origin.host !== req.headers.host || !["http:", "https:"].includes(origin.protocol))
      return send(403, { error: "A same-origin request is required." });
    if (req.method !== "POST") return send(405, { error: "Use POST." });
    if (!req.headers["content-type"]?.startsWith("application/json"))
      return send(415, { error: "Use JSON." });
    if (busy) return send(429, { error: "A design is already being generated." });
    if (!env.OPENAI_API_KEY || !env.OPENAI_MODEL || !env.OPENAI_REASONING_EFFORT)
      return send(503, {
        error:
          "Configure OPENAI_API_KEY, OPENAI_MODEL and OPENAI_REASONING_EFFORT in .env.local, then restart the host.",
      });
    let model = env.OPENAI_MODEL,
      effort = env.OPENAI_REASONING_EFFORT;
    let prompt: string, current: ReturnType<typeof parseDesign>, image: string | undefined;
    try {
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (Buffer.byteLength(body) > 32_768 + DESIGN_IMAGE_MAX_CHARS)
          return send(413, { error: "Design request is too large." });
      }
      const data = JSON.parse(body);
      if (typeof data.prompt !== "string" || !data.prompt.trim() || data.prompt.length > 2000)
        throw new Error();
      model = data.model ?? model;
      effort = data.effort ?? effort;
      if (!models.includes(model) || !efforts.includes(effort)) throw new Error();
      if (
        data.image != null &&
        (typeof data.image !== "string" ||
          data.image.length > DESIGN_IMAGE_MAX_CHARS ||
          !IMAGE_DATA_URL.test(data.image))
      )
        throw new Error();
      image = data.image ?? undefined;
      prompt = data.prompt.trim();
      current = parseDesign(data.current);
    } catch {
      return send(400, { error: "Invalid prompt, photo or current design." });
    }
    busy = true;
    let stage: "request" | "decode" | "validate" = "request";
    try {
      const response = await request("https://api.openai.com/v1/responses", {
        method: "POST",
        signal: AbortSignal.timeout(180_000),
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          reasoning: { effort },
          store: false,
          max_output_tokens: effort === "high" ? 16000 : 8000,
          instructions: DESIGNER_INSTRUCTIONS,
          input: image
            ? [
                {
                  role: "user",
                  content: [
                    { type: "input_text", text: JSON.stringify({ prompt, current }) },
                    { type: "input_image", image_url: image, detail: "low" },
                  ],
                },
              ]
            : JSON.stringify({ prompt, current }),
          text: {
            format: {
              type: "json_schema",
              name: "particle_design",
              strict: true,
              schema: DESIGN_SCHEMA,
            },
          },
        }),
      });
      if (!response.ok)
        return send(502, {
          error: `OpenAI request failed (${response.status}). Check the server model, key and account access.`,
        });
      stage = "decode";
      const data = (await response.json()) as {
        status?: string;
        incomplete_details?: { reason?: string };
        output?: { content?: { type: string; text?: string }[] }[];
      };
      if (data.status !== "completed")
        return send(502, {
          error:
            data.incomplete_details?.reason === "max_output_tokens"
              ? "The model used its output budget before finishing the design. Try lower effort or a simpler prompt."
              : "OpenAI did not finish this design. Your current settings are unchanged.",
        });
      const text = data.output
        ?.flatMap((item) => item.content ?? [])
        .filter((item) => item.type === "output_text")
        .map((item) => item.text ?? "")
        .join("");
      if (!text) return send(422, { error: "No design was returned. Try rephrasing your prompt." });
      const raw = JSON.parse(text);
      stage = "validate";
      send(200, { design: parseDesign(raw) });
    } catch (error) {
      const timedOut =
        error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      const reason = timedOut
        ? "Generation exceeded 3 minutes. Try lower effort or a simpler prompt."
        : stage === "validate"
          ? `The generated design was rejected: ${error instanceof Error ? error.message : "Invalid settings."} Try simplifying the requested geometry.`
          : stage === "decode"
            ? "OpenAI returned an unreadable design. Please retry."
            : "Could not reach OpenAI. Check the network and try again.";
      send(timedOut ? 504 : 502, { error: `${reason} Your current settings are unchanged.` });
    } finally {
      busy = false;
    }
  };
}
