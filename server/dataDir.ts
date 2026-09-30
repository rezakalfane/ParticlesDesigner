/** Host-side helpers shared by the Designer's dev-server APIs (NODE ONLY). */
import { homedir, platform } from "node:os";
import { join } from "node:path";

export const DATA_DIR_ENV = "PARTICLES_DESIGNER_DATA_DIR";

/** Per-user data directory holding the saved slot library (override with PARTICLES_DESIGNER_DATA_DIR). */
export function defaultDataDir(env: NodeJS.ProcessEnv = process.env): string {
  const override = env[DATA_DIR_ENV];
  if (override && override.trim().length > 0) return override;
  switch (platform()) {
    case "darwin":
      return join(homedir(), "Library", "Application Support", "Particles Designer");
    case "win32":
      return join(env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "Particles Designer");
    default:
      return join(env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), "particles-designer");
  }
}

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

export function isLoopbackAddress(address: string | undefined): boolean {
  return address !== undefined && LOOPBACK.has(address);
}
