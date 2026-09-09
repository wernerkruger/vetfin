/** Which deployment mode we are running in (independent of NODE_ENV). */
export type AppEnv = "development" | "production";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

/**
 * APP_ENV selects public URL / CORS behaviour.
 * - development (default): referral links & QR codes target localhost
 * - production: PUBLIC_APP_URL must be the real public host (AWS / domain)
 *
 * NODE_ENV=production still controls security checks (encryption key, JWT).
 * Local `docker compose` keeps APP_ENV=development (or unset) with localhost URLs.
 * AWS `api/.env` must set APP_ENV=production.
 */
export function resolveAppEnv(
  env: NodeJS.ProcessEnv = process.env,
): AppEnv {
  const raw = (env.APP_ENV ?? "").trim().toLowerCase();
  if (raw === "production" || raw === "prod") return "production";
  return "development";
}

export function isLocalOrigin(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return LOCAL_HOSTS.has(hostname);
  } catch {
    return false;
  }
}

export const DEV_PUBLIC_APP_URL = "http://localhost:5173";
export const DEV_CORS_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];
