import dotenv from "dotenv";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });
import cors from "cors";
import express from "express";
import { getConfig } from "./config.js";
import { getDb } from "./db/connection.js";
import { createPlaidClient } from "./plaid/client.js";
import { customersRouter } from "./routes/customers.js";
import { plaidRouter } from "./routes/plaid.js";
import { applicationsRouter } from "./routes/applications.js";
import { borrowersRouter } from "./routes/borrowers.js";
import { practicesRouter } from "./routes/practices.js";
import { referralRouter } from "./routes/referral.js";
import { errorHandler } from "./middleware/errorHandler.js";

const config = getConfig();
getDb();

if (!config.dataEncryptionKey) {
  console.warn(
    "DATA_ENCRYPTION_KEY not set — Plaid tokens and account numbers are stored without encryption (dev only).",
  );
}

const plaid = createPlaidClient(config);

const app = express();

app.set("trust proxy", 1);

app.use(
  cors({
    origin: config.corsOrigins,
    credentials: true,
  }),
);
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({
    service: "vetfin-api",
    message: "VetFin API — use the routes below (not a web UI).",
    health: "/health",
    customers: "POST /api/customers, GET /api/customers/:id",
    database: config.databasePath,
    plaid: {
      status: "GET /api/plaid/status",
      linkToken: "POST /api/plaid/link-token",
      exchange: "POST /api/plaid/exchange-public-token",
      sandboxPublicToken: "POST /api/plaid/sandbox/public-token",
      accounts: "GET /api/plaid/accounts?accessToken=...",
      linkedAccounts: "POST /api/plaid/linked-accounts",
      auth: "GET /api/plaid/auth?accessToken=...&accountIds=id1,id2",
    },
  });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "vetfin-api" });
});

app.use("/api/customers", customersRouter());
app.use("/api/borrowers", borrowersRouter());
app.use("/api/applications", applicationsRouter(plaid));
app.use("/api/practices", practicesRouter());
app.use("/api/referral", referralRouter());
app.use("/api/plaid", plaidRouter(plaid));

app.use(errorHandler);

const host = process.env.HOST ?? "0.0.0.0";

const server = app.listen(config.port, host, () => {
  console.log(`VetFin API listening on http://${host}:${config.port}`);
  console.log(`Plaid environment: ${config.plaidEnv}`);
});

function shutdown(signal: string) {
  console.log(`${signal} received — shutting down`);
  server.close(() => process.exit(0));
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
