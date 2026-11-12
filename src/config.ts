import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { APP_NAME } from "../shared/brand.ts";

function loadDotEnvFallback(): void {
  try {
    const text = readFileSync(resolve(process.cwd(), ".env"), "utf8");
    for (const rawLine of text.split(/\r?\n/)) {
      let line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      if (line.startsWith("export ")) line = line.slice(7).trim();
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
      if (process.env[key] !== undefined) continue;
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  } catch {
    // .env is optional in production (env vars can be provided by the OS).
  }
}

loadDotEnvFallback();

function boolEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return raw === "1" || raw.toLowerCase() === "true" || raw.toLowerCase() === "yes";
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : fallback;
}

const root = process.cwd();
const nodeEnv = process.env.NODE_ENV ?? "development";
const isProduction = nodeEnv === "production";
const appUrl = process.env.APP_URL ?? `http://127.0.0.1:${intEnv("PORT", 8788)}`;
const port = intEnv("PORT", 8788);

export const config = {
  root,
  publicDir: resolve(root, "public"),
  nodeEnv,
  isProduction,
  host: process.env.HOST ?? "127.0.0.1",
  port,
  appUrl,
  databaseUrl:
    process.env.DATABASE_URL ?? "postgres://postgres@127.0.0.1:55432/quota_status",
  sessionSecret: process.env.SESSION_SECRET ?? "",
  encryptionKey: process.env.APP_ENCRYPTION_KEY ?? "",
  setupToken: process.env.SETUP_TOKEN ?? "",
  superadminEmail: (process.env.SUPERADMIN_EMAIL ?? "").trim().toLowerCase(),
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  emailFrom: process.env.EMAIL_FROM ?? `${APP_NAME} <noreply@example.com>`,
  turnstileSiteKey: process.env.TURNSTILE_SITE_KEY ?? "",
  turnstileSecretKey: process.env.TURNSTILE_SECRET_KEY ?? "",
  devExposeEmailLinks: !isProduction && boolEnv("DEV_EXPOSE_EMAIL_LINKS", false),
  cookieSecure: boolEnv("COOKIE_SECURE", nodeEnv === "production"),
  syncIntervalMs: intEnv("SYNC_INTERVAL_MS", 10 * 60_000),
  planPriceUsd: Number.parseFloat(process.env.PLAN_PRICE_USD ?? "10") || 10,
  v1DbPath: process.env.V1_DB_PATH ?? resolve(root, "..", "quota-status", "data", "quota.db"),
  consoleBase: "https://opencode.ai/console/api",
  sessionCookie: "qs_session",
  sessionMaxAgeSeconds: 30 * 24 * 60 * 60,
  allowedOrigins: [
    appUrl,
    "http://127.0.0.1:5174",
    "http://localhost:5174",
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
  ],
  maxGroupsDefault: 3,
};

if (!config.sessionSecret) {
  throw new Error("SESSION_SECRET is required. Generate one with: openssl rand -base64 32");
}

const keyBytes = Buffer.from(config.encryptionKey, "base64");
if (keyBytes.length !== 32) {
  throw new Error(
    "APP_ENCRYPTION_KEY must be 32 bytes base64. Generate one with: openssl rand -base64 32",
  );
}

export type AppConfig = typeof config;
