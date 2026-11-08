import { Hono } from "hono";
import { z } from "zod";
import { config } from "../config.ts";
import {
  assertCsrf,
  assertOrigin,
  consumeEmailToken,
  countSuperadmins,
  createEmailToken,
  createSession,
  destroySession,
  findUserByEmail,
  hashPassword,
  normalizeEmail,
  readSession,
  requireAuth,
  verifyPassword,
  type AppEnv,
  type AuthContext,
} from "../auth.ts";
import { audit, newId, sql } from "../db.ts";
import { sendPasswordResetEmail, sendVerificationEmail } from "../email.ts";
import { badRequest, conflict, forbidden, unauthorized } from "../errors.ts";
import { clientIp, parseJson, rateLimit } from "../http.ts";
import { verifyTurnstile } from "../turnstile.ts";
import { getAppSettings } from "../billing.ts";

const auth = new Hono<AppEnv>();

const emailSchema = z.string().trim().email().max(320);
const passwordSchema = z.string().min(8).max(128);
const nameSchema = z.string().trim().min(2).max(80);

function publicUser(user: AuthContext["user"], csrfToken: string) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    isSuperadmin: user.isSuperadmin,
    emailVerified: !!user.emailVerifiedAt,
    csrfToken,
  };
}

auth.get("/config", async (c) => {
  c.header("Cache-Control", "no-store");
  const settings = await getAppSettings();
  const superadmins = await countSuperadmins();
  return c.json({
    appName: "Quota Status",
    turnstileSiteKey: config.turnstileSiteKey,
    signupOpen: settings.signupOpen,
    setupRequired: superadmins === 0,
    devEmailLinks: config.devExposeEmailLinks,
  });
});

auth.post("/signup", async (c) => {
  assertOrigin(c);
  rateLimit(`signup:${clientIp(c)}`, 10, 60 * 60_000);
  const body = await parseJson(
    c,
    z.object({
      name: nameSchema,
      email: emailSchema,
      password: passwordSchema,
      turnstileToken: z.string().optional(),
    }),
  );
  const settings = await getAppSettings();
  if (!settings.signupOpen) throw forbidden("Signups are currently closed.");
  const ip = clientIp(c);
  if (!(await verifyTurnstile(body.turnstileToken, ip))) {
    throw badRequest("Turnstile verification failed. Please try again.");
  }
  const email = normalizeEmail(body.email);
  const existing = await findUserByEmail(email);
  if (existing) throw conflict("An account with this email already exists.");

  const userId = newId();
  await sql`
    insert into users(id, email, name, password_hash)
    values (${userId}, ${email}, ${body.name.trim()}, ${await hashPassword(body.password)})
  `;
  const token = await createEmailToken(userId, "verify", 24 * 60 * 60_000);
  const sent = await sendVerificationEmail(email, token);
  await audit({ groupId: null, actorUserId: userId, action: "auth.signup", target: email });
  return c.json(
    {
      ok: true,
      email,
      message: "Check your email to verify your account.",
      devVerifyUrl: config.devExposeEmailLinks ? sent.link : undefined,
      emailSent: sent.sent,
    },
    201,
  );
});

auth.post("/login", async (c) => {
  assertOrigin(c);
  const body = await parseJson(
    c,
    z.object({ email: emailSchema, password: z.string().min(1).max(128) }),
  );
  const email = normalizeEmail(body.email);
  rateLimit(`login:${clientIp(c)}:${email}`, 10, 15 * 60_000);
  const row = await sql<
    Array<{
      id: string;
      email: string;
      name: string;
      password_hash: string;
      email_verified_at: Date | string | null;
      is_superadmin: boolean;
      status: string;
    }>
  >`select * from users where lower(email) = ${email} limit 1`;
  const user = row[0];
  if (!user || !(await verifyPassword(body.password, user.password_hash))) {
    throw unauthorized("Invalid email or password.");
  }
  if (user.status !== "active") throw forbidden("This account is disabled.");
  if (!user.email_verified_at) {
    throw forbidden("Verify your email before signing in. You can request a new verification email.");
  }
  const session = await createSession(user.id, c);
  await audit({ groupId: null, actorUserId: user.id, action: "auth.login", target: email });
  return c.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      isSuperadmin: user.is_superadmin,
      emailVerified: true,
      csrfToken: session.csrfToken,
    },
  });
});

auth.get("/me", requireAuth, (c) => {
  const auth = c.get("auth");
  return c.json({ user: publicUser(auth.user, auth.session.csrfToken) });
});

auth.post("/logout", async (c) => {
  const session = await readSession(c);
  if (session) assertCsrf(c, session);
  await destroySession(c);
  return c.json({ ok: true });
});

auth.get("/verify", async (c) => {
  const token = c.req.query("token");
  if (!token) throw badRequest("Verification token is required.");
  const consumed = await consumeEmailToken(token, "verify");
  if (!consumed) throw badRequest("This verification link is invalid or expired.");
  await sql`update users set email_verified_at = now(), updated_at = now() where id = ${consumed.userId}`;
  const rows = await sql<
    Array<{
      id: string;
      email: string;
      name: string;
      email_verified_at: Date | string | null;
      is_superadmin: boolean;
      status: string;
    }>
  >`select * from users where id = ${consumed.userId} limit 1`;
  const user = rows[0];
  if (!user) throw badRequest("Account not found.");
  const session = await createSession(user.id, c);
  await audit({ groupId: null, actorUserId: user.id, action: "auth.email_verified", target: user.email });
  return c.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      isSuperadmin: user.is_superadmin,
      emailVerified: true,
      csrfToken: session.csrfToken,
    },
  });
});

auth.post("/resend-verification", async (c) => {
  assertOrigin(c);
  const body = await parseJson(c, z.object({ email: emailSchema }));
  const email = normalizeEmail(body.email);
  rateLimit(`resend:${clientIp(c)}:${email}`, 3, 15 * 60_000);
  const user = await findUserByEmail(email);
  if (user && !user.emailVerifiedAt) {
    const token = await createEmailToken(user.id, "verify", 24 * 60 * 60_000);
    const sent = await sendVerificationEmail(email, token);
    return c.json({
      ok: true,
      message: "If the account needs verification, an email has been sent.",
      devVerifyUrl: config.devExposeEmailLinks ? sent.link : undefined,
    });
  }
  return c.json({ ok: true, message: "If the account needs verification, an email has been sent." });
});

auth.post("/forgot", async (c) => {
  assertOrigin(c);
  const body = await parseJson(c, z.object({ email: emailSchema }));
  const email = normalizeEmail(body.email);
  rateLimit(`forgot:${clientIp(c)}:${email}`, 3, 15 * 60_000);
  const user = await findUserByEmail(email);
  if (user && user.status === "active") {
    const token = await createEmailToken(user.id, "reset", 60 * 60_000);
    const sent = await sendPasswordResetEmail(email, token);
    return c.json({
      ok: true,
      message: "If the account exists, a password reset email has been sent.",
      devResetUrl: config.devExposeEmailLinks ? sent.link : undefined,
    });
  }
  return c.json({
    ok: true,
    message: "If the account exists, a password reset email has been sent.",
  });
});

auth.post("/reset", async (c) => {
  assertOrigin(c);
  const body = await parseJson(
    c,
    z.object({ token: z.string().min(10), password: passwordSchema }),
  );
  rateLimit(`reset:${clientIp(c)}`, 10, 15 * 60_000);
  const consumed = await consumeEmailToken(body.token, "reset");
  if (!consumed) throw badRequest("This reset link is invalid or expired.");
  await sql`
    update users set password_hash = ${await hashPassword(body.password)}, updated_at = now()
    where id = ${consumed.userId}
  `;
  await sql`delete from sessions where user_id = ${consumed.userId}`;
  await audit({ groupId: null, actorUserId: consumed.userId, action: "auth.password_reset" });
  return c.json({ ok: true });
});

auth.get("/setup/status", async (c) => {
  const superadmins = await countSuperadmins();
  return c.json({ setupRequired: superadmins === 0 });
});

auth.post("/setup", async (c) => {
  assertOrigin(c);
  const superadmins = await countSuperadmins();
  if (superadmins > 0) throw conflict("Setup has already been completed.");
  if (!config.setupToken) throw forbidden("SETUP_TOKEN is not configured on the server.");
  const body = await parseJson(
    c,
    z.object({
      setupToken: z.string().min(1),
      name: nameSchema,
      email: emailSchema,
      password: passwordSchema,
    }),
  );
  if (body.setupToken !== config.setupToken) throw forbidden("Invalid setup token.");
  const email = normalizeEmail(body.email);
  const existing = await findUserByEmail(email);
  if (existing) throw conflict("An account with this email already exists.");
  const userId = newId();
  await sql`
    insert into users(id, email, name, password_hash, email_verified_at, is_superadmin)
    values (${userId}, ${email}, ${body.name.trim()}, ${await hashPassword(body.password)}, now(), true)
  `;
  const session = await createSession(userId, c);
  await audit({ groupId: null, actorUserId: userId, action: "auth.superadmin_created", target: email });
  return c.json({
    user: {
      id: userId,
      email,
      name: body.name.trim(),
      isSuperadmin: true,
      emailVerified: true,
      csrfToken: session.csrfToken,
    },
  });
});

export default auth;
