import { Hono } from "hono";
import { z } from "zod";
import {
  assertCsrf,
  assertVerified,
  getAuth,
  requireAuth,
  requireGroupMember,
  requireGroupOwner,
  type AppEnv,
} from "../auth.ts";
import { config } from "../config.ts";
import { encryptSecret, fingerprint, randomToken, hashToken } from "../crypto.ts";
import { audit, getSetting, newId, sql, toIso } from "../db.ts";
import { sendInviteEmail } from "../email.ts";
import { badRequest, conflict, forbidden, notFound } from "../errors.ts";
import { clientIp, parseJson, rateLimit } from "../http.ts";
import {
  buildGroupSummary,
  buildHistory,
  buildMemberUsage,
  getPeriods,
  listAudit,
  listGroups,
  listInvites,
  listMembers,
  listServiceAccounts,
  reopenPeriod,
  setPeriodBill,
  finalizePeriod,
} from "../billing.ts";
import { getConnection, syncGroup, type ConnectionRow } from "../sync.ts";
import { validateConsoleKey } from "../console.ts";
import type { ConsoleStatus } from "../../shared/types.ts";

const groups = new Hono<AppEnv>();
groups.use("*", requireAuth);

function consoleStatus(connection: ConnectionRow | null): ConsoleStatus {
  return {
    connected: !!connection,
    status: connection?.status ?? "not_connected",
    keyHint: connection?.key_hint ?? null,
    plan: connection?.plan ?? null,
    orgId: connection?.console_org_id ?? null,
    lastVerifiedAt: toIso(connection?.last_verified_at ?? null),
    lastSyncAt: toIso(connection?.last_sync_at ?? null),
    lastError: connection?.last_error ?? null,
  };
}

groups.get("/", async (c) => {
  const auth = getAuth(c);
  return c.json({ groups: await listGroups(auth.user.id) });
});

groups.post("/", async (c) => {
  const auth = getAuth(c);
  assertCsrf(c, auth);
  assertVerified(auth);
  const body = await parseJson(c, z.object({ name: z.string().trim().min(2).max(80) }));
  const settings = await getSetting<number>("max_groups_per_user", config.maxGroupsDefault);
  const owned = await sql<{ count: string }[]>`
    select count(*)::text as count from groups
    where owner_user_id = ${auth.user.id} and status = 'active'
  `;
  if (Number(owned[0]?.count ?? 0) >= settings) {
    throw conflict(`You have reached the limit of ${settings} groups. Ask the super-admin to raise it.`);
  }
  const groupId = newId();
  await sql.begin(async (tx) => {
    await tx`
      insert into groups(id, name, owner_user_id)
      values (${groupId}, ${body.name.trim()}, ${auth.user.id})
    `;
    await tx`
      insert into group_members(group_id, user_id, role, status)
      values (${groupId}, ${auth.user.id}, 'owner', 'active')
    `;
  });
  await audit({
    groupId,
    actorUserId: auth.user.id,
    action: "group.created",
    target: groupId,
    metadata: { name: body.name.trim() },
  });
  return c.json({ group: { id: groupId, name: body.name.trim(), role: "owner" } }, 201);
});

groups.get("/:groupId", async (c) => {
  const groupId = c.req.param("groupId");
  const { auth, role } = await requireGroupMember(c, groupId);
  const rows = await sql<
    Array<{
      id: string;
      name: string;
      owner_name: string;
      member_count: string;
      created_at: Date | string;
    }>
  >`
    select g.id, g.name, owner.name as owner_name,
           (select count(*)::text from group_members gm2
            where gm2.group_id = g.id and gm2.status = 'active') as member_count,
           g.created_at
    from groups g
    join users owner on owner.id = g.owner_user_id
    where g.id = ${groupId} and g.status = 'active'
    limit 1
  `;
  const group = rows[0];
  if (!group) throw notFound("Group not found.");
  const [connection, periods] = await Promise.all([
    getConnection(groupId),
    getPeriods(groupId),
  ]);
  return c.json({
    group: {
      id: group.id,
      name: group.name,
      role,
      ownerName: group.owner_name,
      memberCount: Number(group.member_count),
      isOwner: role === "owner",
      createdAt: toIso(group.created_at),
    },
    connection: role === "owner" ? consoleStatus(connection) : {
      connected: !!connection,
      status: connection?.status ?? "not_connected",
    },
    periods,
  });
});

groups.get("/:groupId/summary", async (c) => {
  const groupId = c.req.param("groupId");
  const { auth } = await requireGroupMember(c, groupId);
  const periodId = c.req.query("periodId") || undefined;
  return c.json(await buildGroupSummary(groupId, auth.user.id, periodId));
});

groups.get("/:groupId/history", async (c) => {
  const groupId = c.req.param("groupId");
  const { auth } = await requireGroupMember(c, groupId);
  const periodId = c.req.query("periodId") || undefined;
  const days = Number.parseInt(c.req.query("days") ?? "30", 10);
  return c.json(await buildHistory(groupId, auth.user.id, periodId, Number.isFinite(days) ? days : 30));
});

groups.get("/:groupId/periods", async (c) => {
  const groupId = c.req.param("groupId");
  await requireGroupMember(c, groupId);
  return c.json({ periods: await getPeriods(groupId) });
});

groups.get("/:groupId/members", async (c) => {
  const groupId = c.req.param("groupId");
  const { role } = await requireGroupMember(c, groupId);
  return c.json({ members: await listMembers(groupId, role === "owner") });
});

groups.get("/:groupId/members/:userId/usage", async (c) => {
  const groupId = c.req.param("groupId");
  await requireGroupMember(c, groupId);
  const periodId = c.req.query("periodId") || undefined;
  return c.json(
    await buildMemberUsage(groupId, c.req.param("userId"), periodId),
  );
});

groups.delete("/:groupId/members/:userId", async (c) => {
  const groupId = c.req.param("groupId");
  const auth = await requireGroupOwner(c, groupId);
  assertCsrf(c, auth);
  const userId = c.req.param("userId");
  const groupRows = await sql<{ owner_user_id: string }[]>`
    select owner_user_id from groups where id = ${groupId} limit 1
  `;
  if (groupRows[0]?.owner_user_id === userId) throw badRequest("The owner cannot be removed.");
  const updated = await sql`
    update group_members set status = 'removed', removed_at = now()
    where group_id = ${groupId} and user_id = ${userId} and status = 'active'
    returning user_id
  `;
  if (updated.length === 0) throw notFound("Member not found.");
  const removedUser = await sql<{ name: string; email: string }[]>`
    select name, email from users where id = ${userId} limit 1
  `;
  await audit({
    groupId,
    actorUserId: auth.user.id,
    action: "member.removed",
    target: userId,
    metadata: {
      name: removedUser[0]?.name ?? null,
      email: removedUser[0]?.email ?? null,
    },
  });
  return c.json({ ok: true });
});

groups.delete("/:groupId/me", async (c) => {
  const groupId = c.req.param("groupId");
  const { auth, role } = await requireGroupMember(c, groupId);
  assertCsrf(c, auth);
  if (role === "owner") throw badRequest("The owner cannot leave the group. Transfer or delete it instead.");
  await sql`
    update group_members set status = 'removed', removed_at = now()
    where group_id = ${groupId} and user_id = ${auth.user.id}
  `;
  await audit({
    groupId,
    actorUserId: auth.user.id,
    action: "member.left",
    target: auth.user.id,
  });
  return c.json({ ok: true });
});

groups.get("/:groupId/invites", async (c) => {
  const groupId = c.req.param("groupId");
  await requireGroupOwner(c, groupId);
  return c.json({ invites: await listInvites(groupId) });
});

groups.post("/:groupId/invites", async (c) => {
  const groupId = c.req.param("groupId");
  const auth = await requireGroupOwner(c, groupId);
  assertCsrf(c, auth);
  assertVerified(auth);
  rateLimit(`invite:${clientIp(c)}`, 30, 60 * 60_000);
  const body = await parseJson(
    c,
    z.object({
      email: z.string().trim().email().max(320).optional().nullable(),
      role: z.literal("member").optional(),
    }),
  );
  const email = body.email ? body.email.trim().toLowerCase() : null;
  if (email) {
    const existing = await sql<{ user_id: string }[]>`
      select gm.user_id from group_members gm
      join users u on u.id = gm.user_id
      where gm.group_id = ${groupId} and lower(u.email) = ${email} and gm.status = 'active'
      limit 1
    `;
    if (existing[0]) throw conflict("This person is already a member of the group.");
  }
  const group = await sql<{ name: string }[]>`select name from groups where id = ${groupId} limit 1`;
  if (!group[0]) throw notFound("Group not found.");
  const token = randomToken();
  const encrypted = encryptSecret(token, groupId);
  const inviteId = newId();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60_000);
  await sql`
    insert into invites(
      id, group_id, email, role, token_hash, token_ciphertext, token_iv, token_tag,
      expires_at, created_by
    ) values (
      ${inviteId}, ${groupId}, ${email}, 'member', ${hashToken(token)},
      ${encrypted.ciphertext}, ${encrypted.iv}, ${encrypted.tag}, ${expiresAt}, ${auth.user.id}
    )
  `;
  const link = `${config.appUrl}/invite/${encodeURIComponent(token)}`;
  const emailResult = email ? await sendInviteEmail(email, group[0].name, token) : null;
  await audit({
    groupId,
    actorUserId: auth.user.id,
    action: "invite.created",
    target: inviteId,
    metadata: { email, role: "member" },
  });
  return c.json(
    {
      invite: {
        id: inviteId,
        email,
        role: "member",
        status: "pending",
        createdAt: new Date().toISOString(),
        expiresAt: expiresAt.toISOString(),
        createdBy: auth.user.name,
        link,
      },
      link,
      emailSent: emailResult?.sent ?? false,
    },
    201,
  );
});

groups.delete("/:groupId/invites/:inviteId", async (c) => {
  const groupId = c.req.param("groupId");
  const auth = await requireGroupOwner(c, groupId);
  assertCsrf(c, auth);
  const inviteId = c.req.param("inviteId");
  const deleted = await sql<{ id: string; email: string | null }[]>`
    delete from invites where id = ${inviteId} and group_id = ${groupId} returning id, email
  `;
  if (deleted.length === 0) throw notFound("Invite not found.");
  await audit({
    groupId,
    actorUserId: auth.user.id,
    action: "invite.revoked",
    target: inviteId,
    metadata: { email: deleted[0]?.email ?? null },
  });
  return c.json({ ok: true });
});

groups.get("/:groupId/console", async (c) => {
  const groupId = c.req.param("groupId");
  await requireGroupOwner(c, groupId);
  return c.json({ connection: consoleStatus(await getConnection(groupId)) });
});

groups.put("/:groupId/console", async (c) => {
  const groupId = c.req.param("groupId");
  const auth = await requireGroupOwner(c, groupId);
  assertCsrf(c, auth);
  assertVerified(auth);
  const body = await parseJson(c, z.object({ key: z.string().trim().min(20).max(500) }));
  const validated = await validateConsoleKey(body.key);
  const existing = await getConnection(groupId);
  if (existing && existing.console_org_id !== validated.orgId) {
    throw conflict(
      "This key belongs to a different OpenCode workspace. Create a new group for that workspace, or disconnect this group first.",
    );
  }
  const duplicate = await sql<{ group_id: string }[]>`
    select group_id from console_connections
    where console_org_id = ${validated.orgId} and group_id <> ${groupId}
    limit 1
  `;
  if (duplicate[0]) throw conflict("This OpenCode workspace is already connected to another group.");
  const encrypted = encryptSecret(body.key, groupId);
  await sql`
    insert into console_connections(
      group_id, key_ciphertext, key_iv, key_tag, key_fingerprint, key_hint,
      console_org_id, console_workspace_id, reader_account_id, plan, status, last_verified_at
    ) values (
      ${groupId}, ${encrypted.ciphertext}, ${encrypted.iv}, ${encrypted.tag},
      ${fingerprint(body.key)}, ${validated.keyHint},
      ${validated.orgId}, ${validated.workspaceId}, ${validated.readerAccountId},
      ${validated.plan}, 'valid', now()
    )
    on conflict (group_id) do update set
      key_ciphertext = excluded.key_ciphertext,
      key_iv = excluded.key_iv,
      key_tag = excluded.key_tag,
      key_fingerprint = excluded.key_fingerprint,
      key_hint = excluded.key_hint,
      console_org_id = excluded.console_org_id,
      console_workspace_id = excluded.console_workspace_id,
      reader_account_id = excluded.reader_account_id,
      plan = excluded.plan,
      status = 'valid',
      last_verified_at = now(),
      last_error = null,
      updated_at = now()
  `;
  await audit({
    groupId,
    actorUserId: auth.user.id,
    action: existing ? "console.rotated" : "console.connected",
    target: validated.orgId,
    metadata: { plan: validated.plan, keyHint: validated.keyHint },
  });
  void syncGroup(groupId, { force: true }).catch((error) => {
    console.error(`[sync] after connect failed for ${groupId}:`, error);
  });
  return c.json({ connection: consoleStatus(await getConnection(groupId)) });
});

groups.delete("/:groupId/console", async (c) => {
  const groupId = c.req.param("groupId");
  const auth = await requireGroupOwner(c, groupId);
  assertCsrf(c, auth);
  await sql`delete from console_connections where group_id = ${groupId}`;
  await audit({
    groupId,
    actorUserId: auth.user.id,
    action: "console.disconnected",
    target: groupId,
  });
  return c.json({ ok: true });
});

groups.post("/:groupId/sync", async (c) => {
  const groupId = c.req.param("groupId");
  const auth = await requireGroupOwner(c, groupId);
  assertCsrf(c, auth);
  rateLimit(`sync:${groupId}`, 3, 60_000);
  const result = await syncGroup(groupId, { force: true });
  await audit({
    groupId,
    actorUserId: auth.user.id,
    action: "sync.manual",
    metadata: result,
  });
  return c.json({ ok: true, ...result });
});

groups.get("/:groupId/service-accounts", async (c) => {
  const groupId = c.req.param("groupId");
  const { role } = await requireGroupMember(c, groupId);
  const periodId = c.req.query("periodId") || undefined;
  const accounts = await listServiceAccounts(groupId, periodId);
  return c.json({
    accounts: role === "owner" ? accounts : accounts.filter((account) => !account.isReader),
  });
});

groups.put("/:groupId/mappings/:accountId", async (c) => {
  const groupId = c.req.param("groupId");
  const auth = await requireGroupOwner(c, groupId);
  assertCsrf(c, auth);
  const accountId = c.req.param("accountId");
  const body = await parseJson(c, z.object({ userId: z.string().min(1) }));
  const account = await sql<{ is_reader: boolean }[]>`
    select is_reader from service_accounts
    where group_id = ${groupId} and account_id = ${accountId} limit 1
  `;
  if (!account[0]) throw notFound("Service account not found.");
  if (account[0].is_reader) throw badRequest("The reader account cannot be mapped.");
  const member = await sql<{ user_id: string; name: string }[]>`
    select gm.user_id, u.name
    from group_members gm
    join users u on u.id = gm.user_id
    where gm.group_id = ${groupId} and gm.user_id = ${body.userId} and gm.status = 'active'
    limit 1
  `;
  if (!member[0]) throw badRequest("Choose an active member of this group.");
  await sql`
    insert into account_mappings(group_id, service_account_id, member_user_id)
    values (${groupId}, ${accountId}, ${body.userId})
    on conflict (group_id, service_account_id) do update set
      member_user_id = excluded.member_user_id, updated_at = now()
  `;
  await audit({
    groupId,
    actorUserId: auth.user.id,
    action: "mapping.set",
    target: accountId,
    metadata: { userId: body.userId, memberName: member[0].name },
  });
  return c.json({ ok: true });
});

groups.delete("/:groupId/mappings/:accountId", async (c) => {
  const groupId = c.req.param("groupId");
  const auth = await requireGroupOwner(c, groupId);
  assertCsrf(c, auth);
  const accountId = c.req.param("accountId");
  await sql`delete from account_mappings where group_id = ${groupId} and service_account_id = ${accountId}`;
  await audit({
    groupId,
    actorUserId: auth.user.id,
    action: "mapping.removed",
    target: accountId,
  });
  return c.json({ ok: true });
});

groups.put("/:groupId/periods/:periodId/bill", async (c) => {
  const groupId = c.req.param("groupId");
  const auth = await requireGroupOwner(c, groupId);
  assertCsrf(c, auth);
  const periodId = c.req.param("periodId");
  const body = await parseJson(c, z.object({ totalIdr: z.number().int().min(0).max(1_000_000_000) }));
  return c.json({ period: await setPeriodBill(groupId, periodId, body.totalIdr, auth.user.id) });
});

groups.post("/:groupId/periods/:periodId/finalize", async (c) => {
  const groupId = c.req.param("groupId");
  const auth = await requireGroupOwner(c, groupId);
  assertCsrf(c, auth);
  await finalizePeriod(groupId, c.req.param("periodId"), auth.user.id);
  return c.json({ ok: true });
});

groups.post("/:groupId/periods/:periodId/reopen", async (c) => {
  const groupId = c.req.param("groupId");
  const auth = await requireGroupOwner(c, groupId);
  assertCsrf(c, auth);
  await reopenPeriod(groupId, c.req.param("periodId"), auth.user.id);
  let sync:
    | { rows: number; periodId: string; error?: undefined }
    | { rows?: undefined; periodId?: undefined; error: string };
  try {
    sync = await syncGroup(groupId, { force: true, range: "90d" });
  } catch (error) {
    sync = { error: error instanceof Error ? error.message : String(error) };
  }
  return c.json({ ok: true, sync });
});

groups.get("/:groupId/audit", async (c) => {
  const groupId = c.req.param("groupId");
  await requireGroupOwner(c, groupId);
  return c.json({ logs: await listAudit(groupId) });
});

groups.patch("/:groupId", async (c) => {
  const groupId = c.req.param("groupId");
  const auth = await requireGroupOwner(c, groupId);
  assertCsrf(c, auth);
  const body = await parseJson(c, z.object({ name: z.string().trim().min(2).max(80) }));
  await sql`update groups set name = ${body.name.trim()}, updated_at = now() where id = ${groupId}`;
  await audit({
    groupId,
    actorUserId: auth.user.id,
    action: "group.renamed",
    target: groupId,
    metadata: { name: body.name.trim() },
  });
  return c.json({ ok: true });
});

groups.delete("/:groupId", async (c) => {
  const groupId = c.req.param("groupId");
  const auth = await requireGroupOwner(c, groupId);
  assertCsrf(c, auth);
  const body = await parseJson(c, z.object({ confirmName: z.string().trim().min(1) }));
  const rows = await sql<{ name: string }[]>`
    select name from groups where id = ${groupId} and status = 'active' limit 1
  `;
  const group = rows[0];
  if (!group) throw notFound("Group not found.");
  if (group.name !== body.confirmName) {
    throw badRequest("Type the exact group name to confirm deletion.");
  }
  await audit({
    groupId,
    actorUserId: auth.user.id,
    action: "group.deleted",
    target: groupId,
    metadata: { name: group.name },
  });
  await sql`delete from groups where id = ${groupId}`;
  return c.json({ ok: true });
});

export default groups;
