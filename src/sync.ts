import { config } from "./config.ts";
import { decryptSecret } from "./crypto.ts";
import { audit, newId, sql, toIso } from "./db.ts";
import { HttpError } from "./errors.ts";
import {
  getGoStatus,
  getServiceAccounts,
  getUsageExportCsv,
  parseUsageExport,
  type ServiceAccount,
  type UsageExportRow,
} from "./console.ts";

export interface PeriodRow {
  id: string;
  group_id: string;
  start_at: Date | string;
  end_at: Date | string;
  start_date: string;
  end_date: string;
  plan_price_usd: string | number;
  total_idr: string | number | null;
  status: "draft" | "finalized";
  finalized_at: Date | string | null;
  finalized_by: string | null;
  snapshot_total_microcents: string | number | null;
  snapshot_month_percent: string | number | null;
}

export interface ConnectionRow {
  group_id: string;
  key_ciphertext: string;
  key_iv: string;
  key_tag: string;
  key_fingerprint: string;
  key_hint: string;
  console_org_id: string;
  console_workspace_id: string | null;
  reader_account_id: string | null;
  plan: string | null;
  status: string;
  last_verified_at: Date | string | null;
  last_sync_at: Date | string | null;
  last_error: string | null;
}

function datePart(iso: string): string {
  return iso.slice(0, 10);
}

export async function getConnection(groupId: string): Promise<ConnectionRow | null> {
  const rows = await sql<ConnectionRow[]>`
    select * from console_connections where group_id = ${groupId} limit 1
  `;
  return rows[0] ?? null;
}

export async function ensurePeriod(
  groupId: string,
  startAt: string,
  endAt: string,
): Promise<PeriodRow> {
  const startDate = datePart(startAt);
  const endDate = datePart(endAt);
  const existing = await sql<PeriodRow[]>`
    select * from periods where group_id = ${groupId} and start_at = ${startAt} limit 1
  `;
  if (existing[0]) {
    await sql`
      update periods
      set end_at = ${endAt}, start_date = ${startDate}, end_date = ${endDate},
          plan_price_usd = ${config.planPriceUsd}, updated_at = now()
      where id = ${existing[0].id}
    `;
    return {
      ...existing[0],
      end_at: endAt,
      start_date: startDate,
      end_date: endDate,
      plan_price_usd: config.planPriceUsd,
    };
  }
  const inserted = await sql<PeriodRow[]>`
    insert into periods(
      id, group_id, start_at, end_at, start_date, end_date, plan_price_usd, status
    ) values (
      ${newId()}, ${groupId}, ${startAt}, ${endAt}, ${startDate}, ${endDate},
      ${config.planPriceUsd}, 'draft'
    )
    returning *
  `;
  return inserted[0]!;
}

function activeKeys(account: ServiceAccount): ServiceAccount["keys"] {
  return account.keys.filter(
    (key) =>
      key.status === "active" &&
      (!key.expiresAt || new Date(key.expiresAt).getTime() > Date.now()),
  );
}

function laterIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

export async function upsertServiceAccounts(
  groupId: string,
  accounts: ServiceAccount[],
  readerAccountId: string | null,
): Promise<number> {
  let count = 0;
  for (const account of accounts) {
    const keys = activeKeys(account);
    const keyNames = [...new Set(keys.map((key) => key.name).filter(Boolean))];
    const lastActive = keys.reduce<string | null>(
      (acc, key) => laterIso(acc, key.lastUsedAt),
      null,
    );
    await sql`
      insert into service_accounts(
        group_id, account_id, name, key_names, is_reader, last_active_at, updated_at
      ) values (
        ${groupId}, ${account.id}, ${account.name},
        ${sql.json(keyNames as never)}, ${account.id === readerAccountId}, ${lastActive}, now()
      )
      on conflict (group_id, account_id) do update set
        name = excluded.name,
        key_names = excluded.key_names,
        is_reader = excluded.is_reader,
        last_active_at = coalesce(excluded.last_active_at, service_accounts.last_active_at),
        updated_at = now()
    `;
    count += 1;
  }
  return count;
}

async function ensureServiceAccountPlaceholder(
  groupId: string,
  row: UsageExportRow,
): Promise<void> {
  await sql`
    insert into service_accounts(group_id, account_id, name, key_names, is_reader)
    values (
      ${groupId}, ${row.user_id}, ${row.user_name ?? row.user_id},
      ${sql.json([] as never)}, false
    )
    on conflict (group_id, account_id) do nothing
  `;
}

export async function upsertUsage(groupId: string, rows: UsageExportRow[]): Promise<number> {
  const finalized = await sql<Array<{ start_date: string; end_date: string }>>`
    select start_date, end_date from periods where group_id = ${groupId} and status = 'finalized'
  `;
  const serviceRows = rows
    .filter((row) => row.user_type === "service_account")
    .filter(
      (row) =>
        !finalized.some(
          (period) => row.day >= period.start_date && row.day < period.end_date,
        ),
    );
  if (serviceRows.length === 0) return 0;
  await sql.begin(async (tx) => {
    for (const row of serviceRows) {
      await tx`
        insert into service_accounts(group_id, account_id, name, key_names, is_reader)
        values (
          ${groupId}, ${row.user_id}, ${row.user_name ?? row.user_id},
          ${tx.json([] as never)}, false
        )
        on conflict (group_id, account_id) do nothing
      `;
      await tx`
        insert into usage_daily(
          group_id, day, service_account_id, provider, model,
          requests, input_tokens, output_tokens, cache_read_tokens,
          cache_write_5m_tokens, cache_write_1h_tokens, cost_microcents, updated_at
        ) values (
          ${groupId}, ${row.day}, ${row.user_id}, ${row.provider}, ${row.model},
          ${row.requests}, ${row.input_tokens}, ${row.output_tokens}, ${row.cache_read_tokens},
          ${row.cache_write_5m_tokens}, ${row.cache_write_1h_tokens}, ${row.cost_microcents}, now()
        )
        on conflict (group_id, day, service_account_id, provider, model) do update set
          requests = excluded.requests,
          input_tokens = excluded.input_tokens,
          output_tokens = excluded.output_tokens,
          cache_read_tokens = excluded.cache_read_tokens,
          cache_write_5m_tokens = excluded.cache_write_5m_tokens,
          cache_write_1h_tokens = excluded.cache_write_1h_tokens,
          cost_microcents = excluded.cost_microcents,
          updated_at = now()
      `;
    }
  });
  return serviceRows.length;
}

export async function insertMeterSnapshot(
  groupId: string,
  periodId: string,
  go: Awaited<ReturnType<typeof getGoStatus>>,
): Promise<void> {
  await sql`
    insert into meter_snapshots(
      id, group_id, period_id,
      five_hour_used, five_hour_limit, five_hour_resets_at,
      week_used, week_limit, week_resets_at,
      month_used, month_limit, month_resets_at, raw
    ) values (
      ${newId()}, ${groupId}, ${periodId},
      ${Number(go.access.meters.fiveHour.usedMicroCents)},
      ${Number(go.access.meters.fiveHour.limitMicroCents)},
      ${go.access.meters.fiveHour.resetsAt ?? null},
      ${Number(go.access.meters.week.usedMicroCents)},
      ${Number(go.access.meters.week.limitMicroCents)},
      ${go.access.meters.week.resetsAt ?? null},
      ${Number(go.access.meters.month.usedMicroCents)},
      ${Number(go.access.meters.month.limitMicroCents)},
      ${go.access.meters.month.resetsAt ?? null},
      ${sql.json(go.raw as never)}
    )
  `;
}

export async function syncGroup(
  groupId: string,
  opts: { force?: boolean; range?: "7d" | "30d" | "90d" } = {},
): Promise<{ rows: number; periodId: string }> {
  const connection = await getConnection(groupId);
  if (!connection) throw new HttpError(409, "not_connected", "This group has no Console connection.");
  if (connection.status === "needs_reauth" && !opts.force) {
    throw new HttpError(409, "needs_reauth", "The Console key needs to be reconnected.");
  }

  const key = decryptSecret(
    {
      ciphertext: connection.key_ciphertext,
      iv: connection.key_iv,
      tag: connection.key_tag,
    },
    groupId,
  );

  const runId = newId();
  await sql`
    insert into sync_runs(id, group_id, status) values (${runId}, ${groupId}, 'running')
  `;

  try {
    const go = await getGoStatus(key);
    const period = await ensurePeriod(groupId, go.access.startsAt, go.access.endsAt);
    const accounts = await getServiceAccounts(key);
    await upsertServiceAccounts(groupId, accounts, connection.reader_account_id);
    let range: "7d" | "30d" | "90d";
    if (opts.range) {
      range = opts.range;
    } else if (!connection.last_sync_at) {
      range = "90d";
    } else {
      const ageDays =
        (Date.now() - new Date(connection.last_sync_at).getTime()) / 86_400_000;
      if (ageDays > 30) range = "90d";
      else if (ageDays > 7) range = "30d";
      else range = "7d";
    }
    const csv = await getUsageExportCsv(key, range);
    const rows = parseUsageExport(csv);
    const written = await upsertUsage(groupId, rows);
    await insertMeterSnapshot(groupId, period.id, go);
    await sql`
      update console_connections
      set status = 'valid', plan = ${go.product}, last_verified_at = now(),
          last_sync_at = now(), last_error = null, updated_at = now()
      where group_id = ${groupId}
    `;
    await sql`
      update sync_runs set finished_at = now(), status = 'ok', rows = ${written}
      where id = ${runId}
    `;
    return { rows: written, periodId: period.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status =
      error instanceof HttpError && (error.status === 401 || error.status === 403 || error.status === 422)
        ? "needs_reauth"
        : "valid";
    await sql`
      update console_connections
      set status = ${status}, last_error = ${message}, updated_at = now()
      where group_id = ${groupId}
    `;
    await sql`
      update sync_runs set finished_at = now(), status = 'error', error = ${message}
      where id = ${runId}
    `;
    await audit({
      groupId,
      actorUserId: null,
      action: status === "needs_reauth" ? "console.needs_reauth" : "sync.failed",
      target: groupId,
      metadata: { message },
    });
    throw error;
  }
}

let schedulerRunning = false;

export async function syncAllGroups(): Promise<void> {
  if (schedulerRunning) return;
  schedulerRunning = true;
  try {
    const rows = await sql<Array<{ group_id: string }>>`
      select group_id from console_connections where status = 'valid'
    `;
    const groups = rows.map((row) => row.group_id);
    for (let i = 0; i < groups.length; i += 2) {
      const batch = groups.slice(i, i + 2);
      await Promise.allSettled(batch.map((groupId) => syncGroup(groupId)));
    }
  } finally {
    schedulerRunning = false;
  }
}

export function startSyncScheduler(): () => void {
  const timer = setTimeout(() => {
    void syncAllGroups().catch((error) => console.error("[sync] initial run failed:", error));
  }, 5_000);
  const interval = setInterval(() => {
    void syncAllGroups().catch((error) => console.error("[sync] scheduled run failed:", error));
  }, config.syncIntervalMs);
  return () => {
    clearTimeout(timer);
    clearInterval(interval);
  };
}

export function connectionIso(connection: ConnectionRow | null): {
  lastVerifiedAt: string | null;
  lastSyncAt: string | null;
} {
  return {
    lastVerifiedAt: toIso(connection?.last_verified_at ?? null),
    lastSyncAt: toIso(connection?.last_sync_at ?? null),
  };
}
