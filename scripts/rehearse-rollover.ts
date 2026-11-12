// Rehearses the period rollover on a throwaway clone of the database.
//
//   createdb -h 127.0.0.1 -U postgres opencode_quota_rehearsal
//   pg_dump -h 127.0.0.1 -U postgres -Fc opencode_quota | \
//     pg_restore -h 127.0.0.1 -U postgres -d opencode_quota_rehearsal
//   DATABASE_URL=postgres://postgres@127.0.0.1:5432/opencode_quota_rehearsal \
//     bun scripts/rehearse-rollover.ts
//
// It rewinds the latest period in the clone, walks the finalize/reopen state
// machine, and checks the bill stays frozen. It never talks to OpenCode Console.

import { config } from "../src/config.ts";
import { closeDb, sql } from "../src/db.ts";
import {
  buildGroupSummary,
  finalizePeriod,
  getPeriods,
  reopenPeriod,
  setPeriodBill,
} from "../src/billing.ts";

const dbName = new URL(config.databaseUrl).pathname.replace(/^\//, "");
if (!dbName.endsWith("_rehearsal")) {
  console.error(`Refusing to run against "${dbName}". Use a *_rehearsal database.`);
  process.exit(1);
}

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

async function errorFrom(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

async function main() {
  const [group] = await sql<{ id: string; name: string; owner_user_id: string }[]>`
    select id, name, owner_user_id from groups where status = 'active'
    order by created_at limit 1
  `;
  if (!group) throw new Error("No active group in the rehearsal database.");

  const periods = await getPeriods(group.id);
  const latest = periods[0];
  if (!latest) throw new Error("No period in the rehearsal database.");

  console.log(`Group: ${group.name}`);
  console.log(`Latest period: ${latest.label} (${latest.status})\n`);

  if (latest.status === "draft" && new Date(latest.end) > new Date()) {
    const error = await errorFrom(() =>
      finalizePeriod(group.id, latest.id, group.owner_user_id),
    );
    check("active period cannot be finalized", /still active/.test(error), error);
  }

  // Rewind the period so it looks like it ended a minute ago.
  await sql`
    update periods
    set end_at = now() - interval '1 minute', end_date = current_date, updated_at = now()
    where id = ${latest.id}
  `;
  await sql`
    update console_connections
    set last_sync_at = now() - interval '1 hour', updated_at = now()
    where group_id = ${group.id}
  `;

  const staleSync = await errorFrom(() =>
    finalizePeriod(group.id, latest.id, group.owner_user_id),
  );
  check(
    "finalize is blocked without a sync after the end",
    /successful sync after the period ended/.test(staleSync),
    staleSync,
  );

  // Simulate the post-end sync and make sure a bill exists.
  await sql`
    update console_connections set last_sync_at = now(), updated_at = now()
    where group_id = ${group.id}
  `;
  if (latest.totalIdr === null) {
    await setPeriodBill(group.id, latest.id, 170000, group.owner_user_id);
  }

  const finalizeError = await errorFrom(() =>
    finalizePeriod(group.id, latest.id, group.owner_user_id),
  );
  check("finalize succeeds after the post-end sync", finalizeError === "", finalizeError);

  const snapshotCount =
    (
      await sql<{ count: string }[]>`
        select count(*)::text as count from period_snapshots where period_id = ${latest.id}
      `
    )[0]?.count ?? "0";
  check("finalization writes a member snapshot", Number(snapshotCount) > 0, `${snapshotCount} rows`);

  const before = await buildGroupSummary(group.id, group.owner_user_id, latest.id);
  check("period is finalized", before.period.status === "finalized");
  check("bill is populated", before.bill.totalIdr !== null, `${before.bill.totalIdr} IDR`);

  const beforeAmounts = before.members.map((member) => `${member.userId}:${member.amountUsd}`);

  // Change usage after finalization: the bill must not move.
  await sql`
    update usage_daily set cost_microcents = cost_microcents * 2
    where group_id = ${group.id}
  `;
  const after = await buildGroupSummary(group.id, group.owner_user_id, latest.id);
  const afterAmounts = after.members.map((member) => `${member.userId}:${member.amountUsd}`);
  check(
    "bill stays frozen when usage changes",
    beforeAmounts.join("|") === afterAmounts.join("|"),
  );

  await reopenPeriod(group.id, latest.id, group.owner_user_id);
  const reopened = await buildGroupSummary(group.id, group.owner_user_id, latest.id);
  check("reopen returns the period to draft", reopened.period.status === "draft");
  check("reopen clears the snapshot", reopened.finalize.finalizedAt === null);

  const afterReopenPeriods = await getPeriods(group.id);
  check(
    "period stays visible in the selector",
    afterReopenPeriods.some((period) => period.id === latest.id),
    `${afterReopenPeriods.length} periods`,
  );

  console.log(failures === 0 ? "\nRehearsal passed." : `\nRehearsal failed: ${failures} check(s).`);
  return failures;
}

try {
  const failures = await main();
  await closeDb();
  process.exit(failures === 0 ? 0 : 1);
} catch (error) {
  await closeDb();
  console.error(error);
  process.exit(1);
}
