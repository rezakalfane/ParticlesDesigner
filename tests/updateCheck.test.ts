import { describe, expect, it } from "vitest";
import { compareVersions, updateFromRelease } from "../electron/updateCheck";

const release = (tag: string, extra: object = {}) => ({
  tag_name: tag,
  html_url: `https://github.com/rezakalfane/ParticlesDesigner/releases/tag/${tag}`,
  assets: [{ name: "particles-designer.js" }, { name: "Particles-Designer-mac.dmg" }],
  ...extra,
});

describe("compareVersions", () => {
  it("compares numerically, not as text", () => {
    expect(compareVersions("0.1.10", "0.1.9")).toBe(1);
    expect(compareVersions("v0.2.0", "0.10.0")).toBe(-1);
    expect(compareVersions("v1.0", "1.0.0")).toBe(0);
    expect(compareVersions("0.1.3-beta.1", "0.1.3")).toBe(0);
  });
});

describe("updateFromRelease", () => {
  it("offers a newer release that has a Mac build", () => {
    expect(updateFromRelease(release("v0.1.3"), "0.1.2")).toEqual({
      version: "0.1.3",
      url: "https://github.com/rezakalfane/ParticlesDesigner/releases/tag/v0.1.3",
    });
  });

  it("ignores same or older versions", () => {
    expect(updateFromRelease(release("v0.1.2"), "0.1.2")).toBeNull();
    expect(updateFromRelease(release("v0.1.1"), "0.1.2")).toBeNull();
  });

  it("ignores releases without a .dmg (kit-only releases)", () => {
    expect(updateFromRelease(release("v0.1.3", { assets: [{ name: "x.js" }] }), "0.1.2")).toBe(
      null,
    );
  });

  it("ignores drafts and pre-releases", () => {
    expect(updateFromRelease(release("v0.1.3", { draft: true }), "0.1.2")).toBeNull();
    expect(updateFromRelease(release("v0.1.3", { prerelease: true }), "0.1.2")).toBeNull();
  });
});
