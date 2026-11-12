import { Hono } from "hono";
import { z } from "zod";
import { config } from "../config.ts";
import {
  assertCsrf,
  assertOrigin,
  assertStrongPassword,
  consumeEmailToken,
  createEmailToken,
  createFirstSuperadmin,
  createSession,
  destroySession,
  findUserByEmail,
  getAuth,
  hashPassword,
  isSetupAvailable,
  normalizeEmail,
  readSession,
  requireAuth,
  SetupUnavailableError,
  verifyPassword,
  verifyUnknownUserPassword,
  type AppEnv,
  type AuthContext,
} from "../auth.ts";
import { timingSafeEqualText } from "../crypto.ts";
import { clearSetupToken, getSetupToken, logGeneratedSetupToken } from "../setup-token.ts";
import { audit, newId, sql } from "../db.ts";
import { sendPasswordChangedEmail, sendPasswordResetEmail, sendVerificationEmail } from "../email.ts";
import { badRequest, conflict, forbidden, unauthorized } from "../errors.ts";
import { clientIp, parseJson, rateLimit } from "../http.ts";
import { logError } from "../log.ts";
import { verifyTurnstile } from "../turnstile.ts";
import { getAppSettings } from "../billing.ts";
import { APP_NAME } from "../../shared/brand.ts";
import { safeNextPath } from "../../shared/redirect.ts";

const auth = new Hono<AppEnv>();

const emailSchema = z.string().trim().email().max(320);
const passwordSchema = z.string().min(8).max(128);
const nameSchema = z.string().trim().min(2).max(80);

/** Check the new-password complexity rules and describe what is missing. */
function missingPasswordRequirements(password: string): string[] {
  const missing: string[] = [];
  if (!/[A-Z]/.test(password)) missing.push("an uppercase letter");
  if (!/[a-z]/.test(password)) missing.push("a lowercase letter");
  if (!/[0-9]/.test(password)) missing.push("a number");
  if (!/[^A-Za-z0-9]/.test(password)) missing.push("a symbol");
  return missing;
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

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
  const setupRequired = await isSetupAvailable();
  return c.json({
    appName: APP_NAME,
    turnstileSiteKey: config.turnstileSiteKey,
    signupOpen: settings.signupOpen,
    setupRequired,
    devEmailLinks: config.devExposeEmailLinks,
  });
});

auth.post("/signup", async (c) => {
  assertOrigin(c);
  await rateLimit(`signup:${clientIp(c)}`, 10, 60 * 60_000);
  if (await isSetupAvailable()) {
    throw conflict("Complete setup before creating accounts.");
  }
  const body = await parseJson(
    c,
    z.object({
      name: nameSchema,
      email: emailSchema,
      password: passwordSchema,
      turnstileToken: z.string().optional(),
      next: z.string().max(2048).optional(),
    }),
  );
  const settings = await getAppSettings();
  if (!settings.signupOpen) throw forbidden("Signups are currently closed.");
  const missing = missingPasswordRequirements(body.password);
  if (missing.length > 0) {
    throw badRequest(`Password must include ${joinList(missing)}.`);
  }
  const ip = clientIp(c);
  if (!(await verifyTurnstile(body.turnstileToken, ip))) {
    throw badRequest("Turnstile verification failed. Please try again.");
  }
  const email = normalizeEmail(body.email);
  const passwordHash = await hashPassword(body.password);
  const existing = await findUserByEmail(email);
  if (existing) {
    return c.json(
      {
        ok: true,
        email,
        message: "If this address can be used, check your inbox to continue.",
        emailSent: false,
      },
      201,
    );
  }

  const userId = newId();
  await sql`
    insert into users(id, email, name, password_hash)
    values (${userId}, ${email}, ${body.name.trim()}, ${passwordHash})
  `;
  const token = await createEmailToken(userId, "verify", 24 * 60 * 60_000);
  const sent = await sendVerificationEmail(email, token, body.next);
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
  const ip = clientIp(c);
  await rateLimit(`login-ip:${ip}`, 60, 15 * 60_000);
  const body = await parseJson(
    c,
    z.object({
      email: emailSchema,
      password: z.string().min(1).max(128),
      turnstileToken: z.string().optional(),
    }),
  );
  const email = normalizeEmail(body.email);
  await rateLimit(`login:${ip}:${email}`, 10, 15 * 60_000);
  if (!(await verifyTurnstile(body.turnstileToken, ip))) {
    throw badRequest("Turnstile verification failed. Please try again.");
  }
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
  if (!user) {
    await verifyUnknownUserPassword(body.password);
    throw unauthorized("Invalid email or password.");
  }
  if (!(await verifyPassword(body.password, user.password_hash))) {
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

auth.post("/change-password", requireAuth, async (c) => {
  const auth = getAuth(c);
  assertCsrf(c, auth);
  await rateLimit(`change-password:${auth.user.id}`, 5, 15 * 60_000);
  const body = await parseJson(
    c,
    z.object({
      currentPassword: z.string().min(1).max(128),
      newPassword: passwordSchema,
    }),
  );
  const rows = await sql<{ password_hash: string }[]>`
    select password_hash from users where id = ${auth.user.id} limit 1
  `;
  if (!rows[0] || !(await verifyPassword(body.currentPassword, rows[0].password_hash))) {
    throw badRequest("Your current password is incorrect.");
  }
  const missing = missingPasswordRequirements(body.newPassword);
  if (missing.length > 0) {
    throw badRequest(`New password must include ${joinList(missing)}.`);
  }
  if (body.currentPassword === body.newPassword) {
    throw badRequest("Your new password must be different from the current one.");
  }
  await sql`
    update users
    set password_hash = ${await hashPassword(body.newPassword)}, updated_at = now()
    where id = ${auth.user.id}
  `;
  // Keep this session signed in, sign out everywhere else.
  await sql`delete from sessions where user_id = ${auth.user.id} and id <> ${auth.session.id}`;
  await sql`
    delete from email_tokens
    where user_id = ${auth.user.id} and type in ('reset', 'verify')
  `;
  await audit({ groupId: null, actorUserId: auth.user.id, action: "auth.password_changed" });
  const notification = await sendPasswordChangedEmail(auth.user.email, {
    attempts: 2,
    timeoutMs: 8_000,
  });
  return c.json({ ok: true, emailSent: notification.sent });
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
  await audit({ groupId: null, actorUserId: user.id, action: "auth.email_verified", target: user.email });
  return c.json({
    ok: true,
    email: user.email,
    next: safeNextPath(c.req.query("next")) ?? null,
  });
});

auth.post("/resend-verification", async (c) => {
  assertOrigin(c);
  const ip = clientIp(c);
  await rateLimit(`resend-ip:${ip}`, 20, 15 * 60_000);
  const body = await parseJson(c, z.object({ email: emailSchema, next: z.string().max(2048).optional() }));
  const email = normalizeEmail(body.email);
  await rateLimit(`resend:${ip}:${email}`, 3, 15 * 60_000);
  const user = await findUserByEmail(email);
  if (user && !user.emailVerifiedAt) {
    const token = await createEmailToken(user.id, "verify", 24 * 60 * 60_000);
    const sent = await sendVerificationEmail(email, token, body.next);
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
  const ip = clientIp(c);
  await rateLimit(`forgot-ip:${ip}`, 30, 15 * 60_000);
  const body = await parseJson(
    c,
    z.object({ email: emailSchema, turnstileToken: z.string().optional() }),
  );
  const email = normalizeEmail(body.email);
  await rateLimit(`forgot:${ip}:${email}`, 3, 15 * 60_000);
  if (!(await verifyTurnstile(body.turnstileToken, ip))) {
    throw badRequest("Turnstile verification failed. Please try again.");
  }
  const user = await findUserByEmail(email);
  if (user && user.status === "active") {
    const token = await createEmailToken(user.id, "reset", 60 * 60_000);
    if (config.devExposeEmailLinks) {
      const sent = await sendPasswordResetEmail(email, token);
      return c.json({
        ok: true,
        message: "If the account exists, a password reset email has been sent.",
        devResetUrl: sent.link,
      });
    }
    void sendPasswordResetEmail(email, token).catch((error) => {
      logError("[email] password reset send failed", error);
    });
  }
  return c.json({
    ok: true,
    message: "If the account exists, a password reset email has been sent.",
  });
});

auth.post("/reset", async (c) => {
  assertOrigin(c);
  await rateLimit(`reset:${clientIp(c)}`, 10, 15 * 60_000);
  const body = await parseJson(
    c,
    z.object({ token: z.string().min(10), password: passwordSchema }),
  );
  assertStrongPassword(body.password);
  const consumed = await consumeEmailToken(body.token, "reset");
  if (!consumed) throw badRequest("This reset link is invalid or expired.");
  await sql`
    update users set password_hash = ${await hashPassword(body.password)}, updated_at = now()
    where id = ${consumed.userId}
  `;
  await sql`delete from sessions where user_id = ${consumed.userId}`;
  await sql`
    delete from email_tokens
    where user_id = ${consumed.userId} and type in ('reset', 'verify')
  `;
  await audit({ groupId: null, actorUserId: consumed.userId, action: "auth.password_reset" });
  return c.json({ ok: true });
});

auth.get("/setup/status", async (c) => {
  const setupRequired = await isSetupAvailable();
  if (setupRequired) logGeneratedSetupToken();
  return c.json({ setupRequired });
});

auth.post("/setup", async (c) => {
  assertOrigin(c);
  await rateLimit(`setup:${clientIp(c)}`, 10, 15 * 60_000);
  if (!(await isSetupAvailable())) throw conflict("Setup has already been completed.");
  const token = getSetupToken();
  if (!token) throw forbidden("SETUP_TOKEN is not configured on the server.");
  const body = await parseJson(
    c,
    z.object({
      setupToken: z.string().min(1),
      name: nameSchema,
      email: emailSchema,
      password: passwordSchema,
    }),
  );
  if (!timingSafeEqualText(body.setupToken, token)) throw forbidden("Invalid setup token.");
  let created: { id: string; email: string; name: string };
  try {
    created = await createFirstSuperadmin({
      email: body.email,
      password: body.password,
      name: body.name,
    });
  } catch (error) {
    if (error instanceof SetupUnavailableError) throw conflict(error.message);
    throw error;
  }
  const session = await createSession(created.id, c);
  await audit({ groupId: null, actorUserId: created.id, action: "auth.superadmin_created", target: created.email });
  clearSetupToken();
  return c.json({
    user: {
      id: created.id,
      email: created.email,
      name: created.name,
      isSuperadmin: true,
      emailVerified: true,
      csrfToken: session.csrfToken,
    },
  });
});

export default auth;
