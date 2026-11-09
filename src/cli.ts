import { Database } from "bun:sqlite";
import { config } from "./config.ts";
import { initSchema, closeDb, newId, sql } from "./db.ts";
import { encryptSecret, hashToken, randomToken } from "./crypto.ts";
import { createFirstSuperadmin, findUserByEmail, isSetupAvailable, normalizeEmail } from "./auth.ts";
import { syncAllGroups } from "./sync.ts";

function argsMap(args: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const value = args[i + 1] && !args[i + 1]!.startsWith("--") ? args[++i]! : "true";
    map.set(key, value);
  }
  return map;
}

async function setupSuperadmin(input: {
  email: string;
  password: string;
  name: string;
}): Promise<void> {
  const created = await createFirstSuperadmin(input);
  console.log(`Super-admin created: ${created.email}`);
}

async function seedDev(): Promise<void> {
  if (!(await isSetupAvailable())) {
    console.log("Database is not empty; seed skipped.");
    return;
  }
  const email = normalizeEmail(process.env.SEED_ADMIN_EMAIL ?? "admin@example.test");
  const generated = !process.env.SEED_ADMIN_PASSWORD;
  const password = process.env.SEED_ADMIN_PASSWORD ?? randomToken(18);
  const created = await createFirstSuperadmin({
    email,
    password,
    name: "Local Admin",
  });
  console.log(`Dev super-admin created: ${created.email}`);
  if (generated) {
    console.log(`Generated password (shown once): ${password}`);
  } else {
    console.log("Password read from SEED_ADMIN_PASSWORD.");
  }
}

async function migrateV1(args: Map<string, string>): Promise<void> {
  const ownerEmail = normalizeEmail(args.get("email") ?? "admin@example.test");
  const groupName = args.get("group") ?? "Example Team";
  const owner = await findUserByEmail(ownerEmail);
  if (!owner) {
    throw new Error(`Owner not found: ${ownerEmail}. Create the account first (setup/seed).`);
  }
  const existingGroup = await sql<{ id: string }[]>`
    select id from groups where owner_user_id = ${owner.id} and name = ${groupName} limit 1
  `;
  if (existingGroup[0]) {
    throw new Error(`Group "${groupName}" already exists for ${ownerEmail}.`);
  }

  const v1 = new Database(config.v1DbPath, { readonly: true });
  const v1Period = v1
    .query<{
      start_at: string;
      end_at: string;
      start_date: string;
      end_date: string;
      plan_price_usd: number;
      total_idr: number | null;
    }, []>("select * from period order by start_at desc limit 1")
    .get();
  if (!v1Period) throw new Error("v1 period not found.");

  const identities = v1
    .query<{
      user_type: string;
      user_id: string;
      display_name: string;
      account_name: string | null;
      key_names: string;
      is_reader: number;
      last_active_at: string | null;
    }, []>("select user_type, user_id, display_name, account_name, key_names, is_reader, last_active_at from identity where is_reader = 0")
    .all();

  const usageRows = v1
    .query<{
      day: string;
      user_type: string;
      user_id: string;
      provider: string;
      model: string;
      requests: number;
      input_tokens: number;
      output_tokens: number;
      cache_read_tokens: number;
      cache_write_5m_tokens: number;
      cache_write_1h_tokens: number;
      cost_microcents: number;
    }, []>("select * from usage_daily")
    .all();

  const meter = v1
    .query<{
      five_hour_used: number;
      five_hour_limit: number;
      five_hour_resets_at: string | null;
      week_used: number;
      week_limit: number;
      week_resets_at: string | null;
      month_used: number;
      month_limit: number;
      month_resets_at: string | null;
      raw_json: string;
    }, []>("select * from meter_snapshot order by taken_at desc limit 1")
    .get();

  v1.close();

  const groupId = newId();
  const periodId = newId();
  const accountMap = new Map<string, string>();

  await sql.begin(async (tx) => {
    await tx`
      insert into groups(id, name, owner_user_id)
      values (${groupId}, ${groupName}, ${owner.id})
    `;
    await tx`
      insert into group_members(group_id, user_id, role, status)
      values (${groupId}, ${owner.id}, 'owner', 'active')
    `;

    for (const identity of identities) {
      if (identity.user_type !== "service_account") continue;
      let keyNames: string[] = [];
      try {
        keyNames = JSON.parse(identity.key_names) as string[];
      } catch {
        keyNames = [];
      }
      const accountName = identity.account_name ?? identity.display_name;
      accountMap.set(identity.user_id, accountName);
      await tx`
        insert into service_accounts(
          group_id, account_id, name, key_names, is_reader, last_active_at
        ) values (
          ${groupId}, ${identity.user_id}, ${accountName},
          ${tx.json(keyNames as never)}, false, ${identity.last_active_at}
        )
        on conflict (group_id, account_id) do nothing
      `;
    }

    await tx`
      insert into periods(
        id, group_id, start_at, end_at, start_date, end_date, plan_price_usd,
        total_idr, status
      ) values (
        ${periodId}, ${groupId}, ${v1Period.start_at}, ${v1Period.end_at},
        ${v1Period.start_date}, ${v1Period.end_date}, ${v1Period.plan_price_usd},
        ${v1Period.total_idr}, 'draft'
      )
    `;

    for (const row of usageRows) {
      if (row.user_type !== "service_account") continue;
      if (!accountMap.has(row.user_id)) continue;
      await tx`
        insert into usage_daily(
          group_id, day, service_account_id, provider, model,
          requests, input_tokens, output_tokens, cache_read_tokens,
          cache_write_5m_tokens, cache_write_1h_tokens, cost_microcents
        ) values (
          ${groupId}, ${row.day}, ${row.user_id}, ${row.provider}, ${row.model},
          ${row.requests}, ${row.input_tokens}, ${row.output_tokens}, ${row.cache_read_tokens},
          ${row.cache_write_5m_tokens}, ${row.cache_write_1h_tokens}, ${row.cost_microcents}
        )
        on conflict (group_id, day, service_account_id, provider, model) do nothing
      `;
    }

    if (meter) {
      await tx`
        insert into meter_snapshots(
          id, group_id, period_id,
          five_hour_used, five_hour_limit, five_hour_resets_at,
          week_used, week_limit, week_resets_at,
          month_used, month_limit, month_resets_at, raw
        ) values (
          ${newId()}, ${groupId}, ${periodId},
          ${meter.five_hour_used}, ${meter.five_hour_limit}, ${meter.five_hour_resets_at},
          ${meter.week_used}, ${meter.week_limit}, ${meter.week_resets_at},
          ${meter.month_used}, ${meter.month_limit}, ${meter.month_resets_at},
          ${tx.json(JSON.parse(meter.raw_json || "{}") as never)}
        )
      `;
    }

    const apiAccount = [...accountMap.entries()].find(
      ([, name]) => name.toLowerCase() === "api",
    );
    if (apiAccount) {
      await tx`
        insert into account_mappings(group_id, service_account_id, member_user_id)
        values (${groupId}, ${apiAccount[0]}, ${owner.id})
      `;
    }
  });

  const token = randomToken();
  const encrypted = encryptSecret(token, groupId);
  await sql`
    insert into invites(
      id, group_id, email, role, token_hash, token_ciphertext, token_iv, token_tag,
      expires_at, created_by
    ) values (
      ${newId()}, ${groupId}, null, 'member', ${hashToken(token)},
      ${encrypted.ciphertext}, ${encrypted.iv}, ${encrypted.tag},
      ${new Date(Date.now() + 30 * 24 * 60 * 60_000)}, ${owner.id}
    )
  `;

  console.log(`Migrated v1 data into group "${groupName}".`);
  console.log(`Owner: ${owner.email}`);
  console.log(`Period: ${v1Period.start_date} – ${v1Period.end_date}`);
  console.log(`Service accounts: ${accountMap.size}`);
  console.log(`Usage rows: ${usageRows.filter((row) => row.user_type === "service_account").length}`);
  console.log(`Pending member invite link: ${config.appUrl}/invite/${encodeURIComponent(token)}`);
  console.log("Service accounts with usage remain unmapped until you map them in the app.");
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  const args = argsMap(rest);
  await initSchema();
  try {
    switch (command) {
      case "setup": {
        const email = args.get("email");
        const password = args.get("password");
        const name = args.get("name") ?? "Owner";
        if (!email || !password) {
          throw new Error("Usage: bun run cli setup --email you@example.com --password '...' --name 'Your Name'");
        }
        await setupSuperadmin({ email, password, name });
        break;
      }
      case "seed:dev":
        await seedDev();
        break;
      case "migrate:v1":
        await migrateV1(args);
        break;
      case "sync":
        await syncAllGroups();
        console.log("Sync finished.");
        break;
      case "status": {
        const [users, groups, connections] = await Promise.all([
          sql<{ count: string }[]>`select count(*)::text as count from users`,
          sql<{ count: string }[]>`select count(*)::text as count from groups where status = 'active'`,
          sql<{ count: string }[]>`select count(*)::text as count from console_connections`,
        ]);
        console.log(`Users: ${users[0]?.count ?? 0}`);
        console.log(`Groups: ${groups[0]?.count ?? 0}`);
        console.log(`Console connections: ${connections[0]?.count ?? 0}`);
        break;
      }
      case undefined:
      case "help":
      case "--help":
      case "-h":
        console.log(`Quota Status v2 CLI

  setup --email <email> --password <password> --name "<name>"
  seed:dev
  migrate:v1 [--email <owner-email>] [--group "Example Team"]
  sync
  status
`);
        break;
      default:
        throw new Error(`Unknown command: ${command}`);
    }
  } finally {
    await closeDb();
  }
}

main().catch((error) => {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
