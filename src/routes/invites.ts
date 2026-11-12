import { Hono } from "hono";
import { z } from "zod";
import {
  assertCsrf,
  getAuth,
  requireAuth,
  type AppEnv,
  type AuthContext,
} from "../auth.ts";
import { audit, sql, toIso } from "../db.ts";
import { hashToken } from "../crypto.ts";
import { badRequest, forbidden, notFound } from "../errors.ts";
import { clientIp, parseJson, rateLimit } from "../http.ts";

const invites = new Hono<AppEnv>();

interface InviteRow {
  id: string;
  group_id: string;
  group_name: string;
  email: string | null;
  role: "owner" | "member";
  expires_at: Date | string;
  used_at: Date | string | null;
}

async function findInviteByToken(token: string): Promise<InviteRow | null> {
  const rows = await sql<InviteRow[]>`
    select i.id, i.group_id, g.name as group_name, i.email, i.role, i.expires_at, i.used_at
    from invites i
    join groups g on g.id = i.group_id
    where i.token_hash = ${hashToken(token)} and g.status = 'active'
    limit 1
  `;
  return rows[0] ?? null;
}

async function findInviteById(id: string): Promise<InviteRow | null> {
  const rows = await sql<InviteRow[]>`
    select i.id, i.group_id, g.name as group_name, i.email, i.role, i.expires_at, i.used_at
    from invites i
    join groups g on g.id = i.group_id
    where i.id = ${id} and g.status = 'active'
    limit 1
  `;
  return rows[0] ?? null;
}

function assertInviteUsable(invite: InviteRow, userEmail: string): void {
  if (invite.used_at) throw badRequest("This invitation has already been used.");
  if (new Date(toIso(invite.expires_at) ?? 0).getTime() < Date.now()) {
    throw badRequest("This invitation has expired.");
  }
  if (invite.email && invite.email.toLowerCase() !== userEmail.toLowerCase()) {
    throw forbidden("This invitation was sent to a different email address.");
  }
}

async function acceptInvite(invite: InviteRow, auth: AuthContext) {
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
  return {
    group: {
      id: groupRow[0]!.id,
      name: groupRow[0]!.name,
      isOwner: groupRow[0]!.owner_user_id === auth.user.id,
    },
  };
}

// Pending invitations addressed to the signed-in user's email. This lets an
// invited member discover the invitation from inside the app, without having
// to open the link from the email.
invites.get("/", requireAuth, async (c) => {
  const auth = getAuth(c);
  const rows = await sql<
    Array<{
      id: string;
      group_name: string;
      role: "owner" | "member";
      expires_at: Date | string;
      created_at: Date | string;
      invited_by: string;
    }>
  >`
    select i.id, g.name as group_name, i.role, i.expires_at, i.created_at,
           u.name as invited_by
    from invites i
    join groups g on g.id = i.group_id
    join users u on u.id = i.created_by
    where lower(i.email) = ${auth.user.email.toLowerCase()}
      and i.used_at is null
      and i.expires_at > now()
      and g.status = 'active'
      and not exists (
        select 1 from group_members gm
        where gm.group_id = i.group_id
          and gm.user_id = ${auth.user.id}
          and gm.status = 'active'
      )
    order by i.created_at desc
  `;
  return c.json({
    invites: rows.map((row) => ({
      id: row.id,
      groupName: row.group_name,
      role: row.role,
      invitedBy: row.invited_by,
      expiresAt: toIso(row.expires_at),
      createdAt: toIso(row.created_at),
    })),
  });
});

// Accept an invitation by its id. Only invitations addressed to the caller's
// email can be accepted this way; link-only invitations still need the token.
invites.post("/accept", requireAuth, async (c) => {
  const auth = getAuth(c);
  assertCsrf(c, auth);
  await rateLimit(`invite-accept:${clientIp(c)}`, 20, 60 * 60_000);
  const body = await parseJson(c, z.object({ inviteId: z.string().min(1).max(200) }));
  const invite = await findInviteById(body.inviteId);
  if (!invite) throw notFound("Invitation not found.");
  if (!invite.email) throw badRequest("This invitation must be accepted from its link.");
  assertInviteUsable(invite, auth.user.email);
  return c.json(await acceptInvite(invite, auth));
});

invites.get("/:token", async (c) => {
  const invite = await findInviteByToken(c.req.param("token"));
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
  await rateLimit(`invite-accept:${clientIp(c)}`, 20, 60 * 60_000);
  const invite = await findInviteByToken(c.req.param("token"));
  if (!invite) throw notFound("Invitation not found.");
  assertInviteUsable(invite, auth.user.email);
  return c.json(await acceptInvite(invite, auth));
});

export default invites;
