/**
 * Update check (NODE ONLY, no electron imports). The app is unsigned, so it cannot update itself
 * on macOS; instead it looks at the latest GitHub Release and, when that release carries a newer
 * Mac build, main.ts offers to open the download page.
 */
export const LATEST_RELEASE_API =
  "https://api.github.com/repos/rezakalfane/ParticlesDesigner/releases/latest";

export interface AvailableUpdate {
  version: string;
  url: string;
}

interface ReleaseJson {
  tag_name?: string;
  html_url?: string;
  draft?: boolean;
  prerelease?: boolean;
  assets?: { name?: string }[];
}

/** -1, 0 or 1; compares dotted numeric versions ("v" prefix and pre-release suffix ignored). */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) =>
    v
      .replace(/^v/, "")
      .split("-")[0]
      .split(".")
      .map((n) => Number.parseInt(n, 10) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return Math.sign(d);
  }
  return 0;
}

/** The update a release offers over `current`, or null (older, not final, or no Mac build). */
export function updateFromRelease(release: ReleaseJson, current: string): AvailableUpdate | null {
  const tag = release.tag_name;
  if (!tag || !release.html_url || release.draft || release.prerelease) return null;
  if (!release.assets?.some((asset) => asset.name?.endsWith(".dmg"))) return null;
  if (compareVersions(tag, current) <= 0) return null;
  return { version: tag.replace(/^v/, ""), url: release.html_url };
}

/** Asks GitHub for the latest release; throws on network or HTTP errors. */
export async function checkForUpdate(current: string): Promise<AvailableUpdate | null> {
  const res = await fetch(LATEST_RELEASE_API, {
    headers: { Accept: "application/vnd.github+json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 404) return null; // no release yet
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
  return updateFromRelease((await res.json()) as ReleaseJson, current);
}
