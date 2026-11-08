import { Hono } from "hono";
import {
  assertCsrf,
  getAuth,
  requireAuth,
  type AppEnv,
} from "../auth.ts";
import { audit, sql, toIso } from "../db.ts";
import { hashToken } from "../crypto.ts";
import { badRequest, forbidden, notFound } from "../errors.ts";
import { clientIp, rateLimit } from "../http.ts";

const invites = new Hono<AppEnv>();

async function findInvite(token: string) {
  const hash = hashToken(token);
  const rows = await sql<
    Array<{
      id: string;
      group_id: string;
      group_name: string;
      email: string | null;
      role: "owner" | "member";
      expires_at: Date | string;
      used_at: Date | string | null;
    }>
  >`
    select i.id, i.group_id, g.name as group_name, i.email, i.role, i.expires_at, i.used_at
    from invites i
    join groups g on g.id = i.group_id
    where i.token_hash = ${hash} and g.status = 'active'
    limit 1
  `;
  return rows[0] ?? null;
}

invites.get("/:token", async (c) => {
  const invite = await findInvite(c.req.param("token"));
  if (!invite) throw notFound("Invitation not found.");
  if (invite.used_at) throw notFound("This invitation has already been used.");
  if (new Date(toIso(invite.expires_at) ?? 0).getTime() < Date.now()) {
    throw notFound("This invitation has expired.");
  }
  return c.json({
    invite: {
      groupName: invite.group_name,
      email: invite.email,
      role: invite.role,
      expiresAt: toIso(invite.expires_at),
    },
  });
});

invites.post("/:token/accept", requireAuth, async (c) => {
  const auth = getAuth(c);
  assertCsrf(c, auth);
  rateLimit(`invite-accept:${clientIp(c)}`, 20, 60 * 60_000);
  const token = c.req.param("token");
  const invite = await findInvite(token);
  if (!invite) throw notFound("Invitation not found.");
  if (invite.used_at) throw badRequest("This invitation has already been used.");
  if (new Date(toIso(invite.expires_at) ?? 0).getTime() < Date.now()) {
    throw badRequest("This invitation has expired.");
  }
  if (invite.email && invite.email.toLowerCase() !== auth.user.email.toLowerCase()) {
    throw forbidden("This invitation was sent to a different email address.");
  }
  const group = await sql<{ status: string; owner_user_id: string }[]>`
    select status, owner_user_id from groups where id = ${invite.group_id} limit 1
  `;
  if (!group[0] || group[0].status !== "active") throw notFound("Group not found.");

  await sql.begin(async (tx) => {
    const existing = await tx<{ status: string; role: string }[]>`
      select status, role from group_members
      where group_id = ${invite.group_id} and user_id = ${auth.user.id}
      limit 1
    `;
    if (existing[0]) {
      await tx`
        update group_members
        set status = 'active', removed_at = null, role = ${existing[0].role}
        where group_id = ${invite.group_id} and user_id = ${auth.user.id}
      `;
    } else {
      await tx`
        insert into group_members(group_id, user_id, role, status)
        values (${invite.group_id}, ${auth.user.id}, 'member', 'active')
      `;
    }
    await tx`
      update invites
      set used_at = now(), accepted_by = ${auth.user.id}
      where id = ${invite.id}
    `;
  });

  await audit({
    groupId: invite.group_id,
    actorUserId: auth.user.id,
    action: "invite.accepted",
    target: invite.id,
  });

  const groupRow = await sql<{ id: string; name: string; owner_user_id: string }[]>`
    select id, name, owner_user_id from groups where id = ${invite.group_id} limit 1
  `;
  return c.json({
    group: {
      id: groupRow[0]!.id,
      name: groupRow[0]!.name,
      isOwner: groupRow[0]!.owner_user_id === auth.user.id,
    },
  });
});

export default invites;
