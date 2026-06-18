import { z } from "zod";

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

  const isProduction = process.env.NODE_ENV === "production";
  const devJwtDefault = "dev-only-change-me-vetfin-jwt-secret-32chars";
  if (isProduction) {
    if (!data.DATA_ENCRYPTION_KEY) {
      throw new Error(
        "DATA_ENCRYPTION_KEY is required in production (min 16 characters).",
      );
    }
    if (data.JWT_SECRET === devJwtDefault) {
      throw new Error("Set a unique JWT_SECRET in production (min 32 characters).");
    }
  }

  return {
    plaidClientId: data.PLAID_CLIENT_ID,
    plaidSecret: secret,
    plaidEnv: data.PLAID_ENV,
    port: data.PORT,
    corsOrigins: data.CORS_ORIGINS.split(",").map((o) => o.trim()),
    databasePath: data.DATABASE_PATH,
    dataEncryptionKey: data.DATA_ENCRYPTION_KEY,
    jwtSecret: data.JWT_SECRET,
    publicAppUrl: data.PUBLIC_APP_URL,
    adminUsername: data.ADMIN_USERNAME,
    adminPasswordHash: data.ADMIN_PASSWORD_HASH,
  };
}

export type AppConfig = ReturnType<typeof loadEnv>;

let cached: AppConfig | undefined;

export function getConfig(): AppConfig {
  if (!cached) cached = loadEnv();
  return cached;
}
