import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_LOOK, LOOKS, lookState, resolveLook } from "../src/embed/look";
import { embedSnippet, KIT_CDN, lookJSON } from "../src/embed/snippet";
import { PARTICLE_FACTORY_SLOTS } from "../src/looks/particleFactory";
import { parseDesign } from "../src/designer/design";

const bloom = readFileSync("examples/looks/lissajous-bloom.json", "utf8");

describe("embed looks", () => {
  it("lists every factory look in bank order", () => {
    expect(LOOKS.map((l) => l.id)).toEqual(
      PARTICLE_FACTORY_SLOTS.filter(Boolean).map((l) => l!.id),
    );
    expect(new Set(LOOKS.map((l) => l.id)).size).toBe(LOOKS.length);
    expect(resolveLook(DEFAULT_LOOK).name).toBe("Deep sea");
  });
  it("resolves ids, names (any case), objects and JSON text", () => {
    expect(resolveLook("galaxy-drift").name).toBe("Galaxy drift");
    expect(resolveLook("GALAXY DRIFT").id).toBe("galaxy-drift");
    expect(resolveLook(bloom).geometry?.x).toContain("sin(");
    expect(resolveLook(JSON.parse(bloom)).formation).toBe(30);
    expect(() => resolveLook("no-such-look")).toThrow(/Unknown particle look/);
    expect(() => resolveLook({ ...JSON.parse(bloom), settings: { Nope: 1 } })).toThrow();
  });
  it("maps settings like the Designer: defaults, zeroed rotations/attraction/audio, degrees → radians", () => {
    const state = lookState(
      resolveLook(
        JSON.stringify({
          name: "Min",
          description: "",
          formation: 2,
          view: [90, -45, 0, 5],
          settings: {},
        }),
      ),
    );
    expect(state.drive.yaw).toBeCloseTo(Math.PI / 2);
    expect(state.drive.pitch).toBeCloseTo(-Math.PI / 4);
    expect(state.drive.distance).toBe(5);
    expect(state.drive.spread).toBe(0.65);
    expect(state.drive.density).toBe(0.44);
    expect(state.drive.attraction).toBe(0);
    expect(state.reactivity).toBe(0);
    expect(state.rotation).toEqual({ x: 0, y: 0, z: 0 });
    expect(state.speed).toBe(0.45);
    expect(state.groups).toMatchObject({
      shock: false,
      audio: true,
      attractors: true,
      motion: true,
    });
    expect(state.geometry).toBeUndefined();
  });
  it("carries palette, explicit groups and custom geometry", () => {
    const state = lookState(resolveLook(bloom));
    expect(state.drive.palette?.slice(0, 3)).toEqual([0x5b / 255, 0x2b / 255, 0xd6 / 255]);
    expect(state.groups.attractors).toBe(false);
    expect(state.geometry).toEqual(JSON.parse(bloom).geometry);
    expect(state.drive.density).toBe(0.7);
    expect(state.rotation.y).toBe(0.15);
  });
  it("every factory look is performable: audio, ripple and cycle on with real strengths", () => {
    for (const look of LOOKS) {
      const state = lookState(look);
      expect(state.groups, look.id).toMatchObject({ audio: true, shock: true, cycle: true });
      expect(state.reactivity, look.id).toBeGreaterThan(0);
      expect(state.drive.shock, look.id).toBeGreaterThan(0);
      expect(state.cycle.implosion * state.cycle.explosion, look.id).toBeGreaterThan(0);
    }
  });
  it("every factory look produces a finite drive", () => {
    for (const look of LOOKS) {
      const { drive } = lookState(look);
      for (const [key, value] of Object.entries(drive))
        if (typeof value === "number")
          expect(Number.isFinite(value), `${look.id}.${key}`).toBe(true);
    }
  });
});

describe("embed snippet", () => {
  it("loads the published kit matching this package's minor version", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    const minor = pkg.version.split(".").slice(0, 2).join(".");
    expect(KIT_CDN).toBe(
      `https://cdn.jsdelivr.net/npm/${pkg.name}@${minor}/dist-embed/particles-designer.js`,
    );
    expect(embedSnippet(resolveLook("deep-sea"))).toContain(`src="${KIT_CDN}"`);
  });
  it("round-trips the design through inline JSON and escapes </script>", () => {
    const look = { ...resolveLook(bloom), description: "Ends here </script><b>x</b>" };
    const html = embedSnippet(look);
    expect(html).not.toContain("</script><b>");
    const json = html.slice(html.indexOf('application/json">') + 18, html.lastIndexOf("</script>"));
    expect(parseDesign(JSON.parse(json))).toEqual(parseDesign(JSON.parse(lookJSON(look))));
    expect(JSON.parse(lookJSON(look)).id).toBeUndefined();
  });
});
