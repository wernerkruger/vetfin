import { z } from "zod";
import {
  DEV_CORS_ORIGINS,
  DEV_PUBLIC_APP_URL,
  isLocalOrigin,
  resolveAppEnv,
  type AppEnv,
} from "./env/appEnv.js";

const envSchema = z.object({
  PLAID_CLIENT_ID: z.string().min(1),
  PLAID_SECRET: z.string().min(1).optional(),
  PLAID_CLIENT_SECRET: z.string().min(1).optional(),
  PLAID_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
  PORT: z.coerce.number().default(3001),
  CORS_ORIGINS: z.string().default("http://localhost:5173"),
  DATABASE_PATH: z.string().default("./data/vetfin.sqlite"),
  DATA_ENCRYPTION_KEY: z.string().min(16).optional(),
  JWT_SECRET: z.string().min(32).default(
    "dev-only-change-me-vetfin-jwt-secret-32chars",
  ),
  PUBLIC_APP_URL: z.string().url().default("http://localhost:5173"),
  ADMIN_USERNAME: z.string().min(1).default("admin"),
  ADMIN_PASSWORD_HASH: z.string().min(1).optional(),
  // Prefer this in Docker — bcrypt hashes contain $ which Compose env_file mangles.
  ADMIN_PASSWORD_HASH_B64: z.string().min(1).optional(),
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(
      `Missing or invalid environment variables: ${missing}. See api/.env.example`,
    );
  }

  const data = parsed.data;
  const secret = data.PLAID_SECRET ?? data.PLAID_CLIENT_SECRET;
  if (!secret) {
    throw new Error(
      "Set PLAID_SECRET or PLAID_CLIENT_SECRET (Lawfi uses PLAID_CLIENT_SECRET).",
    );
  }

  const appEnv = resolveAppEnv();
  const isNodeProduction = process.env.NODE_ENV === "production";
  const devJwtDefault = "dev-only-change-me-vetfin-jwt-secret-32chars";
  if (isNodeProduction) {
    if (!data.DATA_ENCRYPTION_KEY) {
      throw new Error(
        "DATA_ENCRYPTION_KEY is required in production (min 16 characters).",
      );
    }
    if (data.JWT_SECRET === devJwtDefault) {
      throw new Error("Set a unique JWT_SECRET in production (min 32 characters).");
    }
  }

  const { publicAppUrl, corsOrigins, warnings } = resolvePublicUrls(
    appEnv,
    data.PUBLIC_APP_URL,
    data.CORS_ORIGINS,
  );
  for (const warning of warnings) {
    console.warn(warning);
  }

  return {
    appEnv,
    plaidClientId: data.PLAID_CLIENT_ID,
    plaidSecret: secret,
    plaidEnv: data.PLAID_ENV,
    port: data.PORT,
    corsOrigins,
    databasePath: data.DATABASE_PATH,
    dataEncryptionKey: data.DATA_ENCRYPTION_KEY,
    jwtSecret: data.JWT_SECRET,
    publicAppUrl,
    adminUsername: data.ADMIN_USERNAME,
    adminPasswordHash: resolveAdminPasswordHash(data),
  };
}

function resolvePublicUrls(
  appEnv: AppEnv,
  configuredPublicUrl: string,
  configuredCors: string,
): { publicAppUrl: string; corsOrigins: string[]; warnings: string[] } {
  const warnings: string[] = [];
  let publicAppUrl = configuredPublicUrl.replace(/\/$/, "");
  let corsOrigins = configuredCors
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  if (appEnv === "development") {
    if (!isLocalOrigin(publicAppUrl)) {
      warnings.push(
        `[dev] PUBLIC_APP_URL=${publicAppUrl} is not localhost — using ${DEV_PUBLIC_APP_URL}. ` +
          `Keep AWS/public hosts in the server api/.env only (APP_ENV=production).`,
      );
      publicAppUrl = DEV_PUBLIC_APP_URL;
    }
    for (const origin of DEV_CORS_ORIGINS) {
      if (!corsOrigins.includes(origin)) corsOrigins.push(origin);
    }
    return { publicAppUrl, corsOrigins, warnings };
  }

  // APP_ENV=production
  if (isLocalOrigin(publicAppUrl)) {
    throw new Error(
      "APP_ENV=production requires PUBLIC_APP_URL to be your public site URL (not localhost). " +
        "See deploy/aws/.env.production.example",
    );
  }
  return { publicAppUrl, corsOrigins, warnings };
}

function resolveAdminPasswordHash(
  data: z.infer<typeof envSchema>,
): string | undefined {
  if (data.ADMIN_PASSWORD_HASH) {
    return data.ADMIN_PASSWORD_HASH;
  }
  if (data.ADMIN_PASSWORD_HASH_B64) {
    return Buffer.from(data.ADMIN_PASSWORD_HASH_B64, "base64").toString("utf8");
  }
  return undefined;
}

export type AppConfig = ReturnType<typeof loadEnv>;

let cached: AppConfig | undefined;

export function getConfig(): AppConfig {
  if (!cached) cached = loadEnv();
  return cached;
}
