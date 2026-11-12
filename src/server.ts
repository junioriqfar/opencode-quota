import { Hono } from "hono";
import { join, normalize } from "node:path";
import { config } from "./config.ts";
import { initSchema, sql } from "./db.ts";
import { APP_NAME } from "../shared/brand.ts";
import { isSetupAvailable } from "./auth.ts";
import { logGeneratedSetupToken } from "./setup-token.ts";
import { HttpError } from "./errors.ts";
import { startSyncScheduler } from "./sync.ts";
import authRoutes from "./routes/auth.ts";
import groupRoutes from "./routes/groups.ts";
import inviteRoutes from "./routes/invites.ts";
import adminRoutes from "./routes/admin.ts";

await initSchema();
if (await isSetupAvailable()) {
  logGeneratedSetupToken();
}

const app = new Hono();

app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("X-Robots-Tag", "noindex, nofollow");
  c.header(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  );
});

app.route("/api/auth", authRoutes);
app.route("/api/groups", groupRoutes);
app.route("/api/invites", inviteRoutes);
app.route("/api/admin", adminRoutes);

app.get("/api/health", async (c) => {
  try {
    await sql`select 1`;
    return c.json({ ok: true, database: "ok" });
  } catch {
    return c.json({ ok: false, database: "error" }, 503);
  }
});

app.get("/robots.txt", (c) => {
  c.header("Content-Type", "text/plain; charset=utf-8");
  return c.body("User-agent: *\nDisallow: /\n");
});

function safePublicPath(pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const clean = normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, "");
  const full = join(config.publicDir, clean);
  if (!full.startsWith(config.publicDir)) return null;
  return full;
}

async function serveFile(path: string, cache: "asset" | "none"): Promise<Response | null> {
  const file = Bun.file(path);
  if (!(await file.exists())) return null;
  return new Response(file, {
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "Cache-Control": cache === "asset" ? "public, max-age=31536000, immutable" : "no-store",
    },
  });
}

async function serveIndex(): Promise<Response> {
  const index = await serveFile(join(config.publicDir, "index.html"), "none");
  if (index) return index;
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>${APP_NAME}</title></head><body style="font-family:system-ui;max-width:720px;margin:48px auto;padding:0 20px"><h1>${APP_NAME}</h1><p>Frontend is not built yet. Run <code>bun run build:web</code> and restart the server.</p></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

app.get("/assets/*", async (c) => {
  const path = safePublicPath(c.req.path);
  if (!path) return c.notFound();
  return (await serveFile(path, "asset")) ?? c.notFound();
});

app.get("*", async (c) => {
  if (c.req.path.startsWith("/api/")) return c.json({ error: "not_found" }, 404);
  const path = safePublicPath(c.req.path);
  if (path && !c.req.path.endsWith("/")) {
    const file = await serveFile(path, "none");
    if (file) return file;
  }
  return serveIndex();
});

app.onError((error, c) => {
  if (error instanceof HttpError) {
    return c.json(
      { error: error.code, message: error.message, details: error.details ?? null },
      error.status as never,
    );
  }
  console.error("[server] error:", error);
  if (c.req.path.startsWith("/api/")) {
    return c.json({ error: "internal_error", message: "Internal server error." }, 500);
  }
  return c.text("Internal Server Error", 500);
});

const server = Bun.serve({
  hostname: config.host,
  port: config.port,
  fetch: app.fetch,
  idleTimeout: 60,
});

const stopScheduler = startSyncScheduler();

console.log(`[server] listening on ${config.appUrl} (${config.host}:${config.port})`);
console.log(`[server] database: ${config.databaseUrl.replace(/\/\/[^@]+@/, "//***@")}`);
console.log(`[server] public dir: ${config.publicDir}`);
if (!config.resendApiKey) console.warn("[server] Resend is not configured; emails will be logged.");
if (!config.turnstileSecretKey) console.warn("[server] Turnstile is not configured; dev mode is active.");
if (config.isProduction && process.env.DEV_EXPOSE_EMAIL_LINKS === "true") {
  console.warn("[security] DEV_EXPOSE_EMAIL_LINKS is ignored in production.");
}

function shutdown(signal: string): void {
  console.log(`[server] ${signal}, shutting down`);
  stopScheduler();
  server.stop(true);
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
