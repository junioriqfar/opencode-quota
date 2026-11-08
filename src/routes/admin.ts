import { Hono } from "hono";
import { z } from "zod";
import {
  assertCsrf,
  getAuth,
  requireAuth,
  requireSuperadmin,
  type AppEnv,
} from "../auth.ts";
import { audit, setSetting, sql } from "../db.ts";
import { parseJson } from "../http.ts";
import { badRequest, notFound } from "../errors.ts";
import { getAppSettings, getSuperadminGroups } from "../billing.ts";
import { syncGroup } from "../sync.ts";

const admin = new Hono<AppEnv>();
admin.use("*", requireAuth);
admin.use("*", requireSuperadmin);

admin.get("/groups", async (c) => {
  return c.json({ groups: await getSuperadminGroups() });
});

admin.get("/settings", async (c) => {
  return c.json({ settings: await getAppSettings() });
});

admin.put("/settings", async (c) => {
  const auth = getAuth(c);
  assertCsrf(c, auth);
  const body = await parseJson(
    c,
    z.object({
      maxGroupsPerUser: z.number().int().min(1).max(100).optional(),
      signupOpen: z.boolean().optional(),
    }),
  );
  if (body.maxGroupsPerUser === undefined && body.signupOpen === undefined) {
    throw badRequest("Nothing to update.");
  }
  if (body.maxGroupsPerUser !== undefined) {
    await setSetting("max_groups_per_user", body.maxGroupsPerUser);
  }
  if (body.signupOpen !== undefined) {
    await setSetting("signup_open", body.signupOpen);
  }
  await audit({
    groupId: null,
    actorUserId: auth.user.id,
    action: "admin.settings_updated",
    metadata: body,
  });
  return c.json({ settings: await getAppSettings() });
});

admin.post("/groups/:groupId/disable", async (c) => {
  const auth = getAuth(c);
  assertCsrf(c, auth);
  const groupId = c.req.param("groupId");
  const updated = await sql`
    update groups set status = 'disabled', updated_at = now()
    where id = ${groupId} and status <> 'disabled'
    returning id
  `;
  if (updated.length === 0) throw notFound("Group not found or already disabled.");
  await audit({
    groupId,
    actorUserId: auth.user.id,
    action: "admin.group_disabled",
    target: groupId,
  });
  return c.json({ ok: true });
});

admin.post("/groups/:groupId/enable", async (c) => {
  const auth = getAuth(c);
  assertCsrf(c, auth);
  const groupId = c.req.param("groupId");
  const updated = await sql`
    update groups set status = 'active', updated_at = now()
    where id = ${groupId} and status <> 'active'
    returning id
  `;
  if (updated.length === 0) throw notFound("Group not found or already active.");
  await audit({
    groupId,
    actorUserId: auth.user.id,
    action: "admin.group_enabled",
    target: groupId,
  });
  return c.json({ ok: true });
});

admin.post("/groups/:groupId/sync", async (c) => {
  const auth = getAuth(c);
  assertCsrf(c, auth);
  const groupId = c.req.param("groupId");
  const result = await syncGroup(groupId, { force: true });
  await audit({
    groupId,
    actorUserId: auth.user.id,
    action: "admin.sync_triggered",
    metadata: result,
  });
  return c.json({ ok: true, ...result });
});

admin.get("/health", async (c) => {
  const [users, groups, connections, runs] = await Promise.all([
    sql<{ count: string }[]>`select count(*)::text as count from users`,
    sql<{ count: string }[]>`select count(*)::text as count from groups where status = 'active'`,
    sql<{ count: string }[]>`select count(*)::text as count from console_connections`,
    sql<Array<{ group_id: string; status: string; error: string | null; started_at: Date | string }>>`
      select group_id, status, error, started_at from sync_runs
      order by started_at desc limit 10
    `,
  ]);
  return c.json({
    users: Number(users[0]?.count ?? 0),
    groups: Number(groups[0]?.count ?? 0),
    connections: Number(connections[0]?.count ?? 0),
    recentSyncs: runs.map((run) => ({
      groupId: run.group_id,
      status: run.status,
      error: run.error,
      startedAt: new Date(run.started_at).toISOString(),
    })),
  });
});

export default admin;
