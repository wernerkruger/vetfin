import { z } from "zod";
import {
  DEV_CORS_ORIGINS,
  DEV_PUBLIC_APP_URL,
  isLocalOrigin,
  resolveAppEnv,
  type AppEnv,
} from "./env/appEnv.js";

export const LENDER_NAME_PLACEHOLDER = "[Lender name not set]";

const envSchema = z.object({
  PLAID_CLIENT_ID: z.string().min(1),
  PLAID_SECRET: z.string().min(1).optional(),
  PLAID_CLIENT_SECRET: z.string().min(1).optional(),
  PLAID_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
  PORT: z.coerce.number().default(3001),
  CORS_ORIGINS: z.string().default("http://localhost:5173"),
  // Postgres connection. Either set DATABASE_URL, or the individual DB_* parts below.
  DATABASE_URL: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().min(1).optional(),
  ),
  DB_HOST: z.string().min(1).default("localhost"),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_NAME: z.string().min(1).default("vetfin"),
  DB_USER: z.string().min(1).default("vetfin"),
  DB_PASSWORD: z.string().default("vetfin"),
  // "disable" (default, fine for a DB on the same host/Docker network), "require" (TLS, e.g. AWS RDS)
  DB_SSL: z.enum(["disable", "require", "verify-full"]).default("disable"),
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
  DATA_ENCRYPTION_KEY: z.string().min(16).optional(),
  JWT_SECRET: z
    .string()
    .min(32)
    .default("dev-only-change-me-vetfin-jwt-secret-32chars"),
  PUBLIC_APP_URL: z.string().url().default("http://localhost:5173"),
  // Creditor shown on the Truth in Lending disclosure (your partner bank once signed).
  LENDER_NAME: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().min(1).default(LENDER_NAME_PLACEHOLDER),
  ),
  LENDER_ADDRESS: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().min(1).optional(),
  ),
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
      throw new Error(
        "Set a unique JWT_SECRET in production (min 32 characters).",
      );
    }
    if (!data.DATABASE_URL && data.DB_PASSWORD === "vetfin") {
      console.warn(
        "DB_PASSWORD is the development default — set DATABASE_URL or a strong DB_PASSWORD in production.",
      );
    }
  }

  if (appEnv === "production" && data.LENDER_NAME === LENDER_NAME_PLACEHOLDER) {
    console.warn(
      "LENDER_NAME is not set — Truth in Lending disclosures show a placeholder creditor name.",
    );
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
    database: resolveDatabaseConfig(data),
    dataEncryptionKey: data.DATA_ENCRYPTION_KEY,
    jwtSecret: data.JWT_SECRET,
    publicAppUrl,
    lender: { name: data.LENDER_NAME, address: data.LENDER_ADDRESS ?? null },
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

export type DatabaseConfig = {
  connectionString: string;
  ssl: "disable" | "require" | "verify-full";
  poolMax: number;
  /** Connection string with the password masked — safe to log. */
  displayUrl: string;
};

const databaseEnvSchema = envSchema.pick({
  DATABASE_URL: true,
  DB_HOST: true,
  DB_PORT: true,
  DB_NAME: true,
  DB_USER: true,
  DB_PASSWORD: true,
  DB_SSL: true,
  DB_POOL_MAX: true,
});

/** Database settings only — for scripts that don't need the full app config (Plaid etc). */
export function loadDatabaseConfig(
  env: NodeJS.ProcessEnv = process.env,
): DatabaseConfig {
  return resolveDatabaseConfig(databaseEnvSchema.parse(env));
}

function resolveDatabaseConfig(
  data: z.infer<typeof databaseEnvSchema>,
): DatabaseConfig {
  const connectionString =
    data.DATABASE_URL ??
    `postgres://${encodeURIComponent(data.DB_USER)}:${encodeURIComponent(data.DB_PASSWORD)}` +
      `@${data.DB_HOST}:${data.DB_PORT}/${encodeURIComponent(data.DB_NAME)}`;
  return {
    connectionString,
    ssl: data.DB_SSL,
    poolMax: data.DB_POOL_MAX,
    displayUrl: redactConnectionString(connectionString),
  };
}

export function redactConnectionString(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    if (url.password) url.password = "****";
    return url.toString();
  } catch {
    return "(unparseable DATABASE_URL)";
  }
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
