import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { config } from "./config.ts";
import { newId, sql, toIso } from "./db.ts";
import { hashToken, randomToken, timingSafeEqualText } from "./crypto.ts";
import { badRequest, forbidden, unauthorized } from "./errors.ts";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  isSuperadmin: boolean;
  emailVerifiedAt: string | null;
  status: string;
}

export interface SessionInfo {
  id: string;
  userId: string;
  csrfToken: string;
  expiresAt: string;
}

export interface AuthContext {
  user: AuthUser;
  session: SessionInfo;
}

export type AppEnv = { Variables: { auth: AuthContext } };

interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  email_verified_at: Date | string | null;
  is_superadmin: boolean;
  status: string;
}

function mapUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    isSuperadmin: row.is_superadmin,
    emailVerifiedAt: toIso(row.email_verified_at),
    status: row.status,
  };
}

function sessionTokenHash(token: string): string {
  return hashToken(`${token}.${config.sessionSecret}`);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password, { algorithm: "argon2id" });
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await Bun.password.verify(password, hash);
  } catch {
    return false;
  }
}

export async function createSession(
  userId: string,
  c: Context,
): Promise<{ token: string; csrfToken: string; expiresAt: string }> {
  const token = randomToken();
  const csrfToken = randomToken(24);
  const expiresAt = new Date(Date.now() + config.sessionMaxAgeSeconds * 1000);
  await sql`
    insert into sessions(id, user_id, token_hash, csrf_token, expires_at, ip, user_agent)
    values (
      ${newId()},
      ${userId},
      ${sessionTokenHash(token)},
      ${csrfToken},
      ${expiresAt},
      ${c.req.header("cf-connecting-ip") ?? null},
      ${c.req.header("user-agent") ?? null}
    )
  `;
  setCookie(c, config.sessionCookie, token, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: "Lax",
    path: "/",
    maxAge: config.sessionMaxAgeSeconds,
  });
  return { token, csrfToken, expiresAt: expiresAt.toISOString() };
}

export async function readSession(c: Context): Promise<AuthContext | null> {
  const token = getCookie(c, config.sessionCookie);
  if (!token) return null;
  const rows = await sql<
    Array<{
      session_id: string;
      csrf_token: string;
      expires_at: Date | string;
      user_id: string;
      email: string;
      name: string;
      password_hash: string;
      email_verified_at: Date | string | null;
      is_superadmin: boolean;
      status: string;
    }>
  >`
    select s.id as session_id, s.csrf_token, s.expires_at,
           u.id as user_id, u.email, u.name, u.password_hash, u.email_verified_at,
           u.is_superadmin, u.status
    from sessions s
    join users u on u.id = s.user_id
    where s.token_hash = ${sessionTokenHash(token)}
      and s.expires_at > now()
      and u.status = 'active'
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  void sql`update sessions set last_seen_at = now() where id = ${row.session_id}`;
  return {
    user: mapUser({
      id: row.user_id,
      email: row.email,
      name: row.name,
      password_hash: row.password_hash,
      email_verified_at: row.email_verified_at,
      is_superadmin: row.is_superadmin,
      status: row.status,
    }),
    session: {
      id: row.session_id,
      userId: row.user_id,
      csrfToken: row.csrf_token,
      expiresAt: toIso(row.expires_at) ?? "",
    },
  };
}

export async function destroySession(c: Context): Promise<void> {
  const token = getCookie(c, config.sessionCookie);
  if (token) {
    await sql`delete from sessions where token_hash = ${sessionTokenHash(token)}`;
  }
  deleteCookie(c, config.sessionCookie, { path: "/" });
}

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const auth = await readSession(c);
  if (!auth) throw unauthorized();
  c.set("auth", auth);
  await next();
};

export const requireSuperadmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const auth = c.get("auth");
  if (!auth?.user.isSuperadmin) throw forbidden("Super-admin access required.");
  await next();
};

export function getAuth(c: Context<AppEnv>): AuthContext {
  const auth = c.get("auth");
  if (!auth) throw unauthorized();
  return auth;
}

export function assertOrigin(c: Context): void {
  const origin = c.req.header("origin");
  if (origin && !config.allowedOrigins.includes(origin)) {
    throw forbidden("Invalid request origin.");
  }
}

export function assertCsrf(c: Context<AppEnv>, auth: AuthContext): void {
  const method = c.req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return;
  const origin = c.req.header("origin");
  if (origin && !config.allowedOrigins.includes(origin)) {
    throw forbidden("Invalid request origin.");
  }
  const token = c.req.header("x-csrf-token");
  if (!token || !timingSafeEqualText(token, auth.session.csrfToken)) {
    throw forbidden("Invalid CSRF token.");
  }
}

export function assertVerified(auth: AuthContext): void {
  if (!auth.user.emailVerifiedAt) {
    throw forbidden("Verify your email before continuing.");
  }
}

export async function findUserByEmail(email: string): Promise<AuthUser | null> {
  const rows = await sql<UserRow[]>`
    select * from users where lower(email) = ${normalizeEmail(email)} limit 1
  `;
  return rows[0] ? mapUser(rows[0]) : null;
}

export async function findUserById(id: string): Promise<AuthUser | null> {
  const rows = await sql<UserRow[]>`select * from users where id = ${id} limit 1`;
  return rows[0] ? mapUser(rows[0]) : null;
}

export async function countSuperadmins(): Promise<number> {
  const rows = await sql<{ count: string }[]>`
    select count(*)::text as count from users where is_superadmin = true and status = 'active'
  `;
  return Number(rows[0]?.count ?? 0);
}

export class SetupUnavailableError extends Error {
  constructor(message = "Setup is only available when the database is empty.") {
    super(message);
    this.name = "SetupUnavailableError";
  }
}

function joinWithAnd(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function assertStrongPassword(password: string, label = "Password"): void {
  if (password.length < 8) throw badRequest(`${label} must be at least 8 characters.`);
  if (password.length > 128) throw badRequest(`${label} must be at most 128 characters.`);
  const missing: string[] = [];
  if (!/[A-Z]/.test(password)) missing.push("an uppercase letter");
  if (!/[a-z]/.test(password)) missing.push("a lowercase letter");
  if (!/[0-9]/.test(password)) missing.push("a number");
  if (!/[^A-Za-z0-9]/.test(password)) missing.push("a symbol");
  if (missing.length > 0) {
    throw badRequest(`${label} must include ${joinWithAnd(missing)}.`);
  }
}

export async function countUsers(): Promise<number> {
  const rows = await sql<{ count: string }[]>`
    select count(*)::text as count from users
  `;
  return Number(rows[0]?.count ?? 0);
}

export async function isSetupAvailable(): Promise<boolean> {
  return (await countUsers()) === 0;
}

export async function createFirstSuperadmin(input: {
  email: string;
  password: string;
  name: string;
}): Promise<{ id: string; email: string; name: string }> {
  assertStrongPassword(input.password);
  const email = normalizeEmail(input.email);
  const name = input.name.trim();
  const passwordHash = await hashPassword(input.password);
  return await sql.begin(async (tx) => {
    // Serialize setup attempts. A concurrent signup or setup waits here,
    // so only one first account can ever be created.
    await tx`lock table users in exclusive mode`;
    const rows = await tx<{ count: string }[]>`
      select count(*)::text as count from users
    `;
    if (Number(rows[0]?.count ?? 0) > 0) throw new SetupUnavailableError();
    const userId = newId();
    await tx`
      insert into users(id, email, name, password_hash, email_verified_at, is_superadmin)
      values (${userId}, ${email}, ${name}, ${passwordHash}, now(), true)
    `;
    return { id: userId, email, name };
  });
}

export async function createEmailToken(
  userId: string,
  type: "verify" | "reset",
  ttlMs: number,
): Promise<string> {
  const token = randomToken();
  await sql`
    insert into email_tokens(id, user_id, type, token_hash, expires_at)
    values (${newId()}, ${userId}, ${type}, ${hashToken(token)}, ${new Date(Date.now() + ttlMs)})
  `;
  return token;
}

export async function consumeEmailToken(
  token: string,
  type: "verify" | "reset",
): Promise<{ userId: string; id: string } | null> {
  const rows = await sql<Array<{ id: string; user_id: string }>>`
    update email_tokens
    set used_at = now()
    where token_hash = ${hashToken(token)}
      and type = ${type}
      and used_at is null
      and expires_at > now()
    returning id, user_id
  `;
  return rows[0] ? { id: rows[0].id, userId: rows[0].user_id } : null;
}

export async function getMembership(
  groupId: string,
  userId: string,
): Promise<{ role: "owner" | "member"; status: string } | null> {
  const rows = await sql<Array<{ role: "owner" | "member"; status: string }>>`
    select gm.role, gm.status
    from group_members gm
    join groups g on g.id = gm.group_id
    where gm.group_id = ${groupId} and gm.user_id = ${userId} and g.status = 'active'
    limit 1
  `;
  return rows[0] ?? null;
}

export async function requireGroupMember(
  c: Context<AppEnv>,
  groupId: string,
): Promise<{ auth: AuthContext; role: "owner" | "member" }> {
  const auth = getAuth(c);
  const membership = await getMembership(groupId, auth.user.id);
  if (!membership || membership.status !== "active") {
    throw forbidden("You are not a member of this group.");
  }
  return { auth, role: membership.role };
}

export async function requireGroupOwner(
  c: Context<AppEnv>,
  groupId: string,
): Promise<AuthContext> {
  const { auth, role } = await requireGroupMember(c, groupId);
  if (role !== "owner") throw forbidden("Only the group owner can do this.");
  return auth;
}
