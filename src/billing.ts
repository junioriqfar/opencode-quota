import { config } from "./config.ts";
import { audit, getSetting, newId, sql, toIso, toNumber } from "./db.ts";
import { decryptSecret } from "./crypto.ts";
import { allocateIdr } from "./money.ts";
import { badRequest, conflict, forbidden, notFound } from "./errors.ts";
import type {
  AuditLogItem,
  GroupListItem,
  GroupMemberSummary,
  GroupRole,
  GroupSummary,
  HistoryResponse,
  InviteItem,
  MemberListItem,
  MemberModelUsage,
  MemberUsageDetail,
  PeriodInfo,
  QuotaMeter,
  ServiceAccountItem,
  SuperadminGroup,
  TokenTotals,
  UnmappedAccount,
} from "../shared/types.ts";
import {
  getConnection,
  type ConnectionRow,
  type PeriodRow,
} from "./sync.ts";

const MICRO_PER_USD = 100_000_000;

function microToUsd(micro: number): number {
  return micro / MICRO_PER_USD;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function round4(value: number): number {
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
}

function fmtDate(day: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`));
}

export function periodInfo(period: PeriodRow): PeriodInfo {
  return {
    id: period.id,
    start: toIso(period.start_at) ?? "",
    end: toIso(period.end_at) ?? "",
    startDate: period.start_date,
    endDate: period.end_date,
    label: `${fmtDate(period.start_date)} – ${fmtDate(period.end_date)}`,
    status: period.status,
    totalIdr: period.total_idr === null ? null : toNumber(period.total_idr),
    finalizedAt: toIso(period.finalized_at),
  };
}

function meterFrom(used: number, limit: number, resetsAt: string | null): QuotaMeter {
  return {
    usedUsd: round4(microToUsd(used)),
    limitUsd: round4(microToUsd(limit)),
    percent: limit > 0 ? round2((used / limit) * 100) : 0,
    resetsAt,
  };
}

interface AccountUsage {
  accountId: string;
  accountName: string;
  keyNames: string[];
  lastActiveAt: string | null;
  memberUserId: string | null;
  memberName: string | null;
  costMicrocents: number;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

interface MeterRow {
  five_hour_used: string | number;
  five_hour_limit: string | number;
  five_hour_resets_at: string | null;
  week_used: string | number;
  week_limit: string | number;
  week_resets_at: string | null;
  month_used: string | number;
  month_limit: string | number;
  month_resets_at: string | null;
}

interface MemberRow {
  user_id: string;
  name: string;
  email: string;
  role: GroupRole;
  status: string;
  joined_at: Date | string;
}

function emptyTokens(): TokenTotals {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
}

function addTokens(target: TokenTotals, source: {
  input_tokens: unknown;
  output_tokens: unknown;
  cache_read_tokens: unknown;
  cache_write_5m_tokens?: unknown;
  cache_write_1h_tokens?: unknown;
}): void {
  target.input += toNumber(source.input_tokens);
  target.output += toNumber(source.output_tokens);
  target.cacheRead += toNumber(source.cache_read_tokens);
  target.cacheWrite +=
    toNumber(source.cache_write_5m_tokens ?? 0) + toNumber(source.cache_write_1h_tokens ?? 0);
}

async function getPeriod(
  q: typeof sql,
  groupId: string,
  periodId?: string,
): Promise<PeriodRow | null> {
  if (periodId) {
    const rows = await q<PeriodRow[]>`
      select * from periods where id = ${periodId} and group_id = ${groupId} limit 1
    `;
    return rows[0] ?? null;
  }
  const current = await q<PeriodRow[]>`
    select * from periods
    where group_id = ${groupId} and start_at <= now() and end_at > now()
    order by start_at desc limit 1
  `;
  if (current[0]) return current[0];
  const latest = await q<PeriodRow[]>`
    select * from periods where group_id = ${groupId} order by start_at desc limit 1
  `;
  return latest[0] ?? null;
}

async function getMeter(
  q: typeof sql,
  groupId: string,
  periodId: string,
): Promise<MeterRow | null> {
  const rows = await q<MeterRow[]>`
    select * from meter_snapshots
    where group_id = ${groupId} and period_id = ${periodId}
    order by taken_at desc limit 1
  `;
  return rows[0] ?? null;
}

function quotaFromMeter(meter: MeterRow | null): {
  fiveHour: QuotaMeter;
  week: QuotaMeter;
  month: QuotaMeter;
} {
  if (!meter) {
    return {
      fiveHour: meterFrom(0, 0, null),
      week: meterFrom(0, 0, null),
      month: meterFrom(0, 0, null),
    };
  }
  return {
    fiveHour: meterFrom(
      toNumber(meter.five_hour_used),
      toNumber(meter.five_hour_limit),
      meter.five_hour_resets_at,
    ),
    week: meterFrom(toNumber(meter.week_used), toNumber(meter.week_limit), meter.week_resets_at),
    month: meterFrom(
      toNumber(meter.month_used),
      toNumber(meter.month_limit),
      meter.month_resets_at,
    ),
  };
}

async function getAccountUsage(
  q: typeof sql,
  groupId: string,
  period: PeriodRow,
): Promise<AccountUsage[]> {
  const rows = await q<
    Array<{
      account_id: string;
      account_name: string;
      key_names: string[];
      last_active_at: Date | string | null;
      member_user_id: string | null;
      member_name: string | null;
      cost_microcents: string | number;
      requests: string | number;
      input_tokens: string | number;
      output_tokens: string | number;
      cache_read_tokens: string | number;
      cache_write_5m_tokens: string | number;
      cache_write_1h_tokens: string | number;
    }>
  >`
    select
      sa.account_id,
      sa.name as account_name,
      sa.key_names,
      sa.last_active_at,
      m.member_user_id,
      u.name as member_name,
      coalesce(sum(ud.cost_microcents), 0)::text as cost_microcents,
      coalesce(sum(ud.requests), 0)::text as requests,
      coalesce(sum(ud.input_tokens), 0)::text as input_tokens,
      coalesce(sum(ud.output_tokens), 0)::text as output_tokens,
      coalesce(sum(ud.cache_read_tokens), 0)::text as cache_read_tokens,
      coalesce(sum(ud.cache_write_5m_tokens), 0)::text as cache_write_5m_tokens,
      coalesce(sum(ud.cache_write_1h_tokens), 0)::text as cache_write_1h_tokens
    from usage_daily ud
    join service_accounts sa
      on sa.group_id = ud.group_id and sa.account_id = ud.service_account_id
    left join account_mappings m
      on m.group_id = ud.group_id and m.service_account_id = ud.service_account_id
    left join users u on u.id = m.member_user_id
    where ud.group_id = ${groupId}
      and ud.day >= ${period.start_date}
      and ud.day < ${period.end_date}
      and sa.is_reader = false
    group by sa.account_id, sa.name, sa.key_names, sa.last_active_at, m.member_user_id, u.name
    order by cost_microcents desc
  `;
  return rows.map((row) => ({
    accountId: row.account_id,
    accountName: row.account_name,
    keyNames: row.key_names ?? [],
    lastActiveAt: toIso(row.last_active_at),
    memberUserId: row.member_user_id,
    memberName: row.member_name,
    costMicrocents: toNumber(row.cost_microcents),
    requests: toNumber(row.requests),
    inputTokens: toNumber(row.input_tokens),
    outputTokens: toNumber(row.output_tokens),
    cacheReadTokens: toNumber(row.cache_read_tokens),
    cacheWriteTokens:
      toNumber(row.cache_write_5m_tokens) + toNumber(row.cache_write_1h_tokens),
  }));
}

async function getMembers(q: typeof sql, groupId: string): Promise<MemberRow[]> {
  return await q<MemberRow[]>`
    select gm.user_id, u.name, u.email, gm.role, gm.status, gm.joined_at
    from group_members gm
    join users u on u.id = gm.user_id
    where gm.group_id = ${groupId}
    order by case gm.role when 'owner' then 0 else 1 end, u.name
  `;
}


function groupInfoQuery(groupId: string, userId: string): Promise<
  Array<{
    id: string;
    name: string;
    owner_name: string;
    role: GroupRole;
    member_count: string;
  }>
> {
  return sql`
    select g.id, g.name, owner.name as owner_name, gm.role,
           (select count(*)::text from group_members gm2
            where gm2.group_id = g.id and gm2.status = 'active') as member_count
    from groups g
    join users owner on owner.id = g.owner_user_id
    join group_members gm on gm.group_id = g.id and gm.user_id = ${userId}
    where g.id = ${groupId} and g.status = 'active' and gm.status = 'active'
    limit 1
  `;
}

export async function listGroups(userId: string): Promise<GroupListItem[]> {
  const rows = await sql<
    Array<{
      id: string;
      name: string;
      role: GroupRole;
      owner_name: string;
      member_count: string;
    }>
  >`
    select g.id, g.name, gm.role, owner.name as owner_name,
           (select count(*)::text from group_members gm2
            where gm2.group_id = g.id and gm2.status = 'active') as member_count
    from groups g
    join users owner on owner.id = g.owner_user_id
    join group_members gm on gm.group_id = g.id and gm.user_id = ${userId}
    where gm.status = 'active' and g.status = 'active'
    order by g.created_at asc
  `;

  const result: GroupListItem[] = [];
  for (const row of rows) {
    const connection = await getConnection(row.id);
    const period = await getPeriod(sql, row.id);
    let monthlyPercent: number | null = null;
    if (period) {
      const meter = await getMeter(sql, row.id, period.id);
      if (meter) {
        const limit = toNumber(meter.month_limit);
        monthlyPercent = limit > 0 ? round2((toNumber(meter.month_used) / limit) * 100) : 0;
      }
    }
    result.push({
      id: row.id,
      name: row.name,
      role: row.role,
      ownerName: row.owner_name,
      memberCount: toNumber(row.member_count),
      consoleStatus: connection?.status ?? null,
      plan: connection?.plan ?? null,
      currentPeriod: period ? periodInfo(period) : null,
      periodStatus: period?.status ?? null,
      lastSyncAt: toIso(connection?.last_sync_at ?? null),
      monthlyPercent,
    });
  }
  return result;
}

interface DraftContext {
  accountUsage: AccountUsage[];
  members: MemberRow[];
  totalCost: number;
  monthPercent: number;
  quota: { fiveHour: QuotaMeter; week: QuotaMeter; month: QuotaMeter };
}

async function buildDraftContext(
  groupId: string,
  period: PeriodRow,
): Promise<DraftContext> {
  const [accountUsage, members, meter] = await Promise.all([
    getAccountUsage(sql, groupId, period),
    getMembers(sql, groupId),
    getMeter(sql, groupId, period.id),
  ]);
  const quota = quotaFromMeter(meter);
  const totalCost = accountUsage.reduce((sum, row) => sum + row.costMicrocents, 0);
  return { accountUsage, members, totalCost, monthPercent: quota.month.percent, quota };
}

function buildDraftMembers(
  ctx: DraftContext,
  period: PeriodRow,
): {
  members: GroupMemberSummary[];
  unmapped: UnmappedAccount[];
} {
  const memberMap = new Map<
    string,
    {
      userId: string;
      name: string;
      role: GroupRole;
      status: "active" | "removed";
      cost: number;
      requests: number;
      tokens: TokenTotals;
      mappedAccounts: number;
      lastActiveAt: string | null;
    }
  >();

  for (const member of ctx.members) {
    memberMap.set(member.user_id, {
      userId: member.user_id,
      name: member.name,
      role: member.role,
      status: member.status === "active" ? "active" : "removed",
      cost: 0,
      requests: 0,
      tokens: emptyTokens(),
      mappedAccounts: 0,
      lastActiveAt: null,
    });
  }

  const unmapped: UnmappedAccount[] = [];
  for (const usage of ctx.accountUsage) {
    if (!usage.memberUserId) {
      if (usage.costMicrocents > 0) {
        unmapped.push({
          accountId: usage.accountId,
          name: usage.accountName,
          keyNames: usage.keyNames,
          listCostUsd: round4(microToUsd(usage.costMicrocents)),
          requests: usage.requests,
          lastActiveAt: usage.lastActiveAt,
        });
      }
      continue;
    }
    const member = memberMap.get(usage.memberUserId);
    if (!member) continue;
    member.cost += usage.costMicrocents;
    member.requests += usage.requests;
    addTokens(member.tokens, {
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
      cache_read_tokens: usage.cacheReadTokens,
      cache_write_5m_tokens: usage.cacheWriteTokens,
    });
    member.mappedAccounts += 1;
    if (usage.lastActiveAt && (!member.lastActiveAt || usage.lastActiveAt > member.lastActiveAt)) {
      member.lastActiveAt = usage.lastActiveAt;
    }
  }

  const totalIdr = period.total_idr === null ? null : toNumber(period.total_idr);
  const membersForAllocation = [...memberMap.values()]
    .filter((member) => member.cost > 0)
    .map((member) => ({ userId: member.userId, cost: member.cost }));
  const exactIdr =
    totalIdr !== null && unmapped.length === 0
      ? allocateIdr(totalIdr, membersForAllocation, ctx.totalCost)
      : null;

  const members: GroupMemberSummary[] = [...memberMap.values()]
    .map((member) => {
      const share = ctx.totalCost > 0 ? (member.cost / ctx.totalCost) * 100 : 0;
      const amountIdr =
        totalIdr === null
          ? null
          : exactIdr?.get(member.userId) ??
            Math.round((totalIdr * share) / 100);
      return {
        userId: member.userId,
        name: member.name,
        role: member.role,
        status: member.status,
        listCostUsd: round4(microToUsd(member.cost)),
        sharePct: round2(share),
        quotaPct: round2((share * ctx.monthPercent) / 100),
        amountUsd: round2((toNumber(period.plan_price_usd) * share) / 100),
        amountIdr,
        requests: member.requests,
        tokens: member.tokens,
        mappedAccounts: member.mappedAccounts,
        lastActiveAt: member.lastActiveAt,
      };
    })
    .sort((a, b) => b.listCostUsd - a.listCostUsd || a.name.localeCompare(b.name));

  return { members, unmapped };
}

function totalsFromMembers(members: GroupMemberSummary[]): {
  requests: number;
  tokens: TokenTotals;
} {
  return members.reduce(
    (acc, member) => ({
      requests: acc.requests + member.requests,
      tokens: {
        input: acc.tokens.input + member.tokens.input,
        output: acc.tokens.output + member.tokens.output,
        cacheRead: acc.tokens.cacheRead + member.tokens.cacheRead,
        cacheWrite: acc.tokens.cacheWrite + member.tokens.cacheWrite,
      },
    }),
    { requests: 0, tokens: emptyTokens() },
  );
}

export async function buildGroupSummary(
  groupId: string,
  userId: string,
  periodId?: string,
): Promise<GroupSummary> {
  const groupRows = await groupInfoQuery(groupId, userId);
  const group = groupRows[0];
  if (!group) throw notFound("Group not found.");
  const period = await getPeriod(sql, groupId, periodId);
  if (!period) {
    throw conflict("No billing period yet. Sync the Console connection first.", {
      code: "no_period",
    });
  }
  const connection = await getConnection(groupId);
  const isOwner = group.role === "owner";
  const lastSync = {
    at: toIso(connection?.last_sync_at ?? null),
    status: connection?.status ?? "not_connected",
    error: connection?.last_error ?? null,
  };
  const warnings: string[] = [];

  if (period.status === "finalized") {
    const snapshots = await sql<
      Array<{
        member_user_id: string;
        list_cost_microcents: string | number;
        share_pct: string | number;
        quota_pct: string | number;
        amount_usd: string | number;
        amount_idr: string | number | null;
        requests: string | number;
        input_tokens: string | number;
        output_tokens: string | number;
        cache_read_tokens: string | number;
        name: string;
        role: GroupRole;
        status: string;
      }>
    >`
      select ps.*, u.name, gm.role, coalesce(gm.status, 'removed') as status
      from period_snapshots ps
      join users u on u.id = ps.member_user_id
      left join group_members gm on gm.group_id = ${groupId} and gm.user_id = ps.member_user_id
      where ps.period_id = ${period.id}
      order by ps.list_cost_microcents desc, u.name
    `;
    const mappingRows = await sql<
      Array<{
        member_user_id: string;
        count: string;
        last_active_at: Date | string | null;
      }>
    >`
      select m.member_user_id, count(*)::text as count, max(sa.last_active_at) as last_active_at
      from account_mappings m
      join service_accounts sa
        on sa.group_id = m.group_id and sa.account_id = m.service_account_id
      where m.group_id = ${groupId}
      group by m.member_user_id
    `;
    const mappingMap = new Map(
      mappingRows.map((row) => [
        row.member_user_id,
        { count: toNumber(row.count), lastActiveAt: toIso(row.last_active_at) },
      ]),
    );
    const meter = await getMeter(sql, groupId, period.id);
    const quota = quotaFromMeter(meter);
    // Meter values and per-member quota estimates stay live from the latest
    // snapshot so they match OpenCode Console. Finalization freezes the bill,
    // not the live quota display.
    const liveMonthPercent = quota.month.limitUsd > 0 ? quota.month.percent : null;
    const members: GroupMemberSummary[] = snapshots.map((row) => {
      const mapping = mappingMap.get(row.member_user_id);
      const sharePct = round2(toNumber(row.share_pct));
      return {
        userId: row.member_user_id,
        name: row.name,
        role: row.role ?? "member",
        status: row.status === "active" ? "active" : "removed",
        listCostUsd: round4(microToUsd(toNumber(row.list_cost_microcents))),
        sharePct,
        quotaPct:
          liveMonthPercent === null
            ? round2(toNumber(row.quota_pct))
            : round2((sharePct * liveMonthPercent) / 100),
        amountUsd: round2(toNumber(row.amount_usd)),
        amountIdr: row.amount_idr === null ? null : toNumber(row.amount_idr),
        requests: toNumber(row.requests),
        tokens: {
          input: toNumber(row.input_tokens),
          output: toNumber(row.output_tokens),
          cacheRead: toNumber(row.cache_read_tokens),
          cacheWrite: 0,
        },
        mappedAccounts: mapping?.count ?? 0,
        lastActiveAt: mapping?.lastActiveAt ?? null,
      };
    });
    // Keep the meter card internally consistent: used/limit come from the
    // latest snapshots. Finalization freezes the bill, not the live meter.
    // (Previously only the percentage was replaced with the finalized value,
    // producing cards like "65% used" with 76% worth of usage.)
    const finalizedBy = period.finalized_by
      ? (
          await sql<{ name: string }[]>`
            select name from users where id = ${period.finalized_by} limit 1
          `
        )[0]?.name ?? null
      : null;
    if (connection?.status === "needs_reauth") {
      warnings.push("The Console key needs to be reconnected.");
    }
    const totals = totalsFromMembers(members);
    return {
      group: {
        id: group.id,
        name: group.name,
        role: group.role,
        ownerName: group.owner_name,
        memberCount: toNumber(group.member_count),
        isOwner,
      },
      period: periodInfo(period),
      plan: {
        priceUsd: toNumber(period.plan_price_usd),
        monthlyLimitUsd: quota.month.limitUsd,
      },
      quota,
      total: {
        listCostUsd: round4(microToUsd(toNumber(period.snapshot_total_microcents ?? 0))),
        requests: totals.requests,
        tokens: totals.tokens,
      },
      bill: {
        totalIdr: period.total_idr === null ? null : toNumber(period.total_idr),
        currency: "IDR",
        usdReferenceTotal: round2(toNumber(period.plan_price_usd)),
      },
      members,
      unmapped: [],
      reconciliation: {
        meterUsedUsd: quota.month.usedUsd,
        exportListCostUsd: round4(microToUsd(toNumber(period.snapshot_total_microcents ?? 0))),
        differenceUsd: round2(
          microToUsd(toNumber(period.snapshot_total_microcents ?? 0)) - quota.month.usedUsd,
        ),
        note: "Billing uses list cost. The Go meter uses allowance, so the two totals can differ.",
      },
      finalize: {
        canFinalize: false,
        blockers: [],
        finalizedAt: toIso(period.finalized_at),
        finalizedBy,
      },
      warnings,
      lastSync,
    };
  }

  const ctx = await buildDraftContext(groupId, period);
  const { members, unmapped } = buildDraftMembers(ctx, period);
  const totals = totalsFromMembers(members);
  const blockers: string[] = [];
  if (!isOwner) blockers.push("Only the group owner can finalize this period.");
  if (new Date(period.end_at).getTime() > Date.now()) {
    blockers.push("This period is still active. Finalization is available after it ends.");
  }
  if (period.total_idr === null) blockers.push("Enter the total bill in IDR.");
  if (ctx.totalCost === 0) blockers.push("There is no usage in this period.");
  if (unmapped.length > 0) {
    blockers.push(
      `${unmapped.length} service account${unmapped.length > 1 ? "s" : ""} with usage ${unmapped.length > 1 ? "are" : "is"} not mapped yet: ${unmapped.map((account) => account.name).join(", ")}.`,
    );
  }
  if (connection?.status === "needs_reauth") {
    warnings.push("The Console key needs to be reconnected. Usage may be incomplete.");
  }
  if (!connection) warnings.push("No Console connection is configured for this group.");
  if (period.total_idr === null) warnings.push("The total bill in IDR has not been set yet.");
  if (unmapped.length > 0) {
    warnings.push(
      `${unmapped.length} service account${unmapped.length > 1 ? "s" : ""} with usage ${unmapped.length > 1 ? "are" : "is"} not mapped. Finalization is blocked.`,
    );
  }
  if (ctx.monthPercent >= 90) warnings.push(`Monthly Go quota is at ${ctx.monthPercent.toFixed(2)}%.`);

  return {
    group: {
      id: group.id,
      name: group.name,
      role: group.role,
      ownerName: group.owner_name,
      memberCount: toNumber(group.member_count),
      isOwner,
    },
    period: periodInfo(period),
    plan: {
      priceUsd: toNumber(period.plan_price_usd),
      monthlyLimitUsd: ctx.quota.month.limitUsd,
    },
    quota: ctx.quota,
    total: {
      listCostUsd: round4(microToUsd(ctx.totalCost)),
      requests: totals.requests,
      tokens: totals.tokens,
    },
    bill: {
      totalIdr: period.total_idr === null ? null : toNumber(period.total_idr),
      currency: "IDR",
      usdReferenceTotal: round2(toNumber(period.plan_price_usd)),
    },
    members,
    unmapped: isOwner ? unmapped : [],
    reconciliation: {
      meterUsedUsd: ctx.quota.month.usedUsd,
      exportListCostUsd: round4(microToUsd(ctx.totalCost)),
      differenceUsd: round2(microToUsd(ctx.totalCost) - ctx.quota.month.usedUsd),
      note: "Billing uses list cost. The Go meter uses allowance, so the two totals can differ.",
    },
    finalize: {
      canFinalize: isOwner && blockers.length === 0,
      blockers,
      finalizedAt: null,
      finalizedBy: null,
    },
    warnings,
    lastSync,
  };
}

export async function buildHistory(
  groupId: string,
  userId: string,
  periodId: string | undefined,
  days = 30,
): Promise<HistoryResponse> {
  const groupRows = await groupInfoQuery(groupId, userId);
  if (!groupRows[0]) throw notFound("Group not found.");
  const period = await getPeriod(sql, groupId, periodId);
  if (!period) throw conflict("No billing period yet.");

  const today = new Date().toISOString().slice(0, 10);
  const lastDay = period.end_date <= today ? addDays(period.end_date, -1) : today;
  let firstDay = period.start_date;
  const safeDays = Math.max(1, Math.min(90, Math.trunc(days) || 30));
  const naturalDays =
    Math.round(
      (new Date(`${lastDay}T00:00:00Z`).getTime() -
        new Date(`${firstDay}T00:00:00Z`).getTime()) /
        86_400_000,
    ) + 1;
  if (naturalDays > safeDays) firstDay = addDays(lastDay, -(safeDays - 1));

  const rows =
    period.status === "finalized"
      ? await sql<
          Array<{
            day: string;
            member_user_id: string;
            name: string;
            cost_microcents: string | number;
          }>
        >`
          select ds.day, ds.member_user_id, u.name,
                 coalesce(ds.cost_microcents, 0)::text as cost_microcents
          from period_daily_snapshots ds
          join users u on u.id = ds.member_user_id
          where ds.period_id = ${period.id}
            and ds.day >= ${firstDay}
            and ds.day < ${addDays(lastDay, 1)}
          order by ds.day asc, ds.cost_microcents desc
        `
      : await sql<
          Array<{
            day: string;
            member_user_id: string;
            name: string;
            cost_microcents: string | number;
          }>
        >`
          select ud.day, m.member_user_id, u.name,
                 coalesce(sum(ud.cost_microcents), 0)::text as cost_microcents
          from usage_daily ud
          join service_accounts sa
            on sa.group_id = ud.group_id and sa.account_id = ud.service_account_id
          join account_mappings m
            on m.group_id = ud.group_id and m.service_account_id = ud.service_account_id
          join users u on u.id = m.member_user_id
          where ud.group_id = ${groupId}
            and ud.day >= ${firstDay}
            and ud.day < ${addDays(lastDay, 1)}
            and sa.is_reader = false
          group by ud.day, m.member_user_id, u.name
          order by ud.day asc, cost_microcents desc
        `;

  const memberTotals = new Map<string, { userId: string; name: string; total: number }>();
  const dayMap = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const cost = toNumber(row.cost_microcents);
    if (!dayMap.has(row.day)) dayMap.set(row.day, new Map());
    dayMap.get(row.day)!.set(row.member_user_id, cost);
    const current = memberTotals.get(row.member_user_id) ?? {
      userId: row.member_user_id,
      name: row.name,
      total: 0,
    };
    current.total += cost;
    memberTotals.set(row.member_user_id, current);
  }

  const memberList = [...memberTotals.values()]
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
    .map((member) => ({ userId: member.userId, name: member.name }));

  const allDays: string[] = [];
  if (lastDay >= firstDay) {
    for (let day = firstDay; day <= lastDay; day = addDays(day, 1)) allDays.push(day);
  }

  return {
    period: periodInfo(period),
    members: memberList,
    days: allDays.map((day) => {
      const users = dayMap.get(day) ?? new Map<string, number>();
      const members = memberList
        .map((member) => ({
          userId: member.userId,
          name: member.name,
          costUsd: round4(microToUsd(users.get(member.userId) ?? 0)),
        }))
        .filter((member) => member.costUsd > 0);
      return {
        day,
        totalUsd: round4(members.reduce((sum, member) => sum + member.costUsd, 0)),
        members,
      };
    }),
  };
}

function addDays(day: string, delta: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

export async function listMembers(
  groupId: string,
  includeEmails: boolean,
): Promise<MemberListItem[]> {
  const period = await getPeriod(sql, groupId);
  const members = await getMembers(sql, groupId);
  const accountUsage = period ? await getAccountUsage(sql, groupId, period) : [];
  const byMember = new Map<string, { cost: number; accounts: number }>();
  for (const usage of accountUsage) {
    if (!usage.memberUserId) continue;
    const current = byMember.get(usage.memberUserId) ?? { cost: 0, accounts: 0 };
    current.cost += usage.costMicrocents;
    current.accounts += 1;
    byMember.set(usage.memberUserId, current);
  }
  return members.map((member) => ({
    userId: member.user_id,
    name: member.name,
    email: includeEmails ? member.email : null,
    role: member.role,
    status: member.status === "active" ? "active" : "removed",
    joinedAt: toIso(member.joined_at) ?? "",
    mappedAccounts: byMember.get(member.user_id)?.accounts ?? 0,
    listCostUsd: round4(microToUsd(byMember.get(member.user_id)?.cost ?? 0)),
  }));
}

export async function buildMemberUsage(
  groupId: string,
  memberUserId: string,
  periodId?: string,
): Promise<MemberUsageDetail> {
  const period = await getPeriod(sql, groupId, periodId);
  if (!period) {
    throw conflict("No billing period yet. Sync the Console connection first.", {
      code: "no_period",
    });
  }
  const memberRows = await sql<{ name: string }[]>`
    select u.name
    from group_members gm
    join users u on u.id = gm.user_id
    where gm.group_id = ${groupId} and gm.user_id = ${memberUserId}
    limit 1
  `;
  const member = memberRows[0];
  if (!member) throw notFound("Member not found.");

  const [rows, accountRows] = await Promise.all([
    sql<
      Array<{
        provider: string;
        model: string;
        requests: string | number;
        input_tokens: string | number;
        output_tokens: string | number;
        cache_read_tokens: string | number;
        cache_write_5m_tokens: string | number;
        cache_write_1h_tokens: string | number;
        cost_microcents: string | number;
      }>
    >`
      select ud.provider, ud.model,
             coalesce(sum(ud.requests), 0)::text as requests,
             coalesce(sum(ud.input_tokens), 0)::text as input_tokens,
             coalesce(sum(ud.output_tokens), 0)::text as output_tokens,
             coalesce(sum(ud.cache_read_tokens), 0)::text as cache_read_tokens,
             coalesce(sum(ud.cache_write_5m_tokens), 0)::text as cache_write_5m_tokens,
             coalesce(sum(ud.cache_write_1h_tokens), 0)::text as cache_write_1h_tokens,
             coalesce(sum(ud.cost_microcents), 0)::text as cost_microcents
      from usage_daily ud
      join service_accounts sa
        on sa.group_id = ud.group_id and sa.account_id = ud.service_account_id
      join account_mappings m
        on m.group_id = ud.group_id and m.service_account_id = ud.service_account_id
      where ud.group_id = ${groupId}
        and m.member_user_id = ${memberUserId}
        and ud.day >= ${period.start_date}
        and ud.day < ${period.end_date}
        and sa.is_reader = false
      group by ud.provider, ud.model
      order by sum(ud.cost_microcents) desc, ud.provider asc, ud.model asc
    `,
    sql<{ count: string }[]>`
      select count(*)::text as count
      from account_mappings
      where group_id = ${groupId} and member_user_id = ${memberUserId}
    `,
  ]);

  const totalCost = rows.reduce((sum, row) => sum + toNumber(row.cost_microcents), 0);
  const totals = {
    listCostUsd: round4(microToUsd(totalCost)),
    requests: 0,
    tokens: emptyTokens(),
  };
  const models: MemberModelUsage[] = rows.map((row) => {
    const cost = toNumber(row.cost_microcents);
    totals.requests += toNumber(row.requests);
    addTokens(totals.tokens, row);
    return {
      provider: row.provider,
      model: row.model,
      requests: toNumber(row.requests),
      inputTokens: toNumber(row.input_tokens),
      outputTokens: toNumber(row.output_tokens),
      cacheReadTokens: toNumber(row.cache_read_tokens),
      cacheWriteTokens:
        toNumber(row.cache_write_5m_tokens) + toNumber(row.cache_write_1h_tokens),
      listCostUsd: round4(microToUsd(cost)),
      sharePct: totalCost > 0 ? round2((cost / totalCost) * 100) : 0,
    };
  });

  return {
    member: { userId: memberUserId, name: member.name },
    period: periodInfo(period),
    totals,
    mappedAccounts: toNumber(accountRows[0]?.count ?? 0),
    models,
  };
}

export async function listServiceAccounts(
  groupId: string,
  periodId?: string,
): Promise<ServiceAccountItem[]> {
  const period = await getPeriod(sql, groupId, periodId);
  const rows = await sql<
    Array<{
      account_id: string;
      name: string;
      key_names: string[];
      is_reader: boolean;
      last_active_at: Date | string | null;
      member_user_id: string | null;
      member_name: string | null;
      cost_microcents: string | number;
      requests: string | number;
    }>
  >`
    select sa.account_id, sa.name, sa.key_names, sa.is_reader, sa.last_active_at,
           m.member_user_id, u.name as member_name,
           coalesce(sum(ud.cost_microcents), 0)::text as cost_microcents,
           coalesce(sum(ud.requests), 0)::text as requests
    from service_accounts sa
    left join usage_daily ud
      on ud.group_id = sa.group_id
     and ud.service_account_id = sa.account_id
     and ud.day >= ${period?.start_date ?? "0000-01-01"}
     and ud.day < ${period?.end_date ?? "9999-12-31"}
    left join account_mappings m
      on m.group_id = sa.group_id and m.service_account_id = sa.account_id
    left join users u on u.id = m.member_user_id
    where sa.group_id = ${groupId}
    group by sa.account_id, sa.name, sa.key_names, sa.is_reader, sa.last_active_at,
             m.member_user_id, u.name
    order by sa.is_reader asc, cost_microcents desc
  `;
  return rows.map((row) => ({
    accountId: row.account_id,
    name: row.name,
    keyNames: row.key_names ?? [],
    isReader: row.is_reader,
    lastActiveAt: toIso(row.last_active_at),
    isMapped: !!row.member_user_id,
    mappedUserId: row.member_user_id,
    mappedUserName: row.member_name,
    listCostUsd: round4(microToUsd(toNumber(row.cost_microcents))),
    requests: toNumber(row.requests),
  }));
}

export async function listInvites(groupId: string): Promise<InviteItem[]> {
  const rows = await sql<
    Array<{
      id: string;
      email: string | null;
      role: GroupRole;
      token_ciphertext: string | null;
      token_iv: string | null;
      token_tag: string | null;
      expires_at: Date | string;
      used_at: Date | string | null;
      created_at: Date | string;
      created_by_name: string;
    }>
  >`
    select i.id, i.email, i.role, i.token_ciphertext, i.token_iv, i.token_tag,
           i.expires_at, i.used_at, i.created_at, u.name as created_by_name
    from invites i
    join users u on u.id = i.created_by
    where i.group_id = ${groupId}
    order by i.created_at desc
  `;
  return rows.map((row) => {
    const expired = new Date(toIso(row.expires_at) ?? 0).getTime() < Date.now();
    const status = row.used_at ? "accepted" : expired ? "expired" : "pending";
    let link: string | null = null;
    if (status === "pending" && row.token_ciphertext && row.token_iv && row.token_tag) {
      try {
        const token = decryptSecret(
          {
            ciphertext: row.token_ciphertext,
            iv: row.token_iv,
            tag: row.token_tag,
          },
          groupId,
        );
        link = `${config.appUrl}/invite/${encodeURIComponent(token)}`;
      } catch {
        link = null;
      }
    }
    return {
      id: row.id,
      email: row.email,
      role: row.role,
      status,
      createdAt: toIso(row.created_at) ?? "",
      expiresAt: toIso(row.expires_at) ?? "",
      createdBy: row.created_by_name,
      link,
    };
  });
}

export async function listAudit(groupId: string): Promise<AuditLogItem[]> {
  const rows = await sql<
    Array<{
      id: string;
      action: string;
      target: string | null;
      metadata: unknown;
      created_at: Date | string;
      actor_name: string | null;
    }>
  >`
    select a.id, a.action, a.target, a.metadata, a.created_at, u.name as actor_name
    from audit_logs a
    left join users u on u.id = a.actor_user_id
    where a.group_id = ${groupId}
    order by a.created_at desc
    limit 100
  `;
  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    actorName: row.actor_name,
    target: row.target,
    metadata: row.metadata,
    createdAt: toIso(row.created_at) ?? "",
  }));
}

export async function getPeriods(groupId: string): Promise<PeriodInfo[]> {
  const rows = await sql<PeriodRow[]>`
    select * from periods where group_id = ${groupId} order by start_at desc
  `;
  return rows.map(periodInfo);
}

export async function setPeriodBill(
  groupId: string,
  periodId: string,
  totalIdr: number,
  actorUserId: string,
): Promise<PeriodInfo> {
  const rows = await sql<PeriodRow[]>`
    select * from periods where id = ${periodId} and group_id = ${groupId} limit 1
  `;
  const period = rows[0];
  if (!period) throw notFound("Period not found.");
  if (period.status !== "draft") throw conflict("This period is finalized. Reopen it first.");
  const updated = await sql<PeriodRow[]>`
    update periods set total_idr = ${totalIdr}, updated_at = now()
    where id = ${periodId} returning *
  `;
  await audit({
    groupId,
    actorUserId,
    action: "period.bill_set",
    target: periodId,
    metadata: { totalIdr },
  });
  return periodInfo(updated[0]!);
}

export async function finalizePeriod(
  groupId: string,
  periodId: string,
  actorUserId: string,
): Promise<void> {
  await sql.begin(async (tx) => {
    const periods = await tx<PeriodRow[]>`
      select * from periods where id = ${periodId} and group_id = ${groupId} for update
    `;
    const period = periods[0];
    if (!period) throw notFound("Period not found.");
    if (period.status !== "draft") throw conflict("This period is already finalized.");
    if (new Date(period.end_at).getTime() > Date.now()) {
      throw badRequest("This period is still active. Wait until it ends before finalizing.");
    }
    if (period.total_idr === null) throw badRequest("Enter the total bill in IDR before finalizing.");

    const [accountUsage, members, meter] = await Promise.all([
      getAccountUsage(tx as unknown as typeof sql, groupId, period),
      getMembers(tx as unknown as typeof sql, groupId),
      getMeter(tx as unknown as typeof sql, groupId, period.id),
    ]);
    const totalCost = accountUsage.reduce((sum, row) => sum + row.costMicrocents, 0);
    if (totalCost === 0) throw badRequest("There is no usage in this period.");
    const unmapped = accountUsage.filter(
      (row) => !row.memberUserId && row.costMicrocents > 0,
    );
    if (unmapped.length > 0) {
      throw conflict("Map all service accounts with usage before finalizing.", {
        unmapped: unmapped.map((row) => ({
          accountId: row.accountId,
          name: row.accountName,
          listCostUsd: round4(microToUsd(row.costMicrocents)),
        })),
      });
    }

    const memberMap = new Map<
      string,
      {
        userId: string;
        name: string;
        cost: number;
        requests: number;
        tokens: TokenTotals;
      }
    >();
    for (const member of members) {
      memberMap.set(member.user_id, {
        userId: member.user_id,
        name: member.name,
        cost: 0,
        requests: 0,
        tokens: emptyTokens(),
      });
    }
    for (const usage of accountUsage) {
      if (!usage.memberUserId) continue;
      const member = memberMap.get(usage.memberUserId);
      if (!member) continue;
      member.cost += usage.costMicrocents;
      member.requests += usage.requests;
      addTokens(member.tokens, {
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
        cache_read_tokens: usage.cacheReadTokens,
        cache_write_5m_tokens: usage.cacheWriteTokens,
      });
    }
    const memberList = [...memberMap.values()].sort((a, b) => b.cost - a.cost);
    const quota = quotaFromMeter(meter);
    const totalIdr = toNumber(period.total_idr);
    const idrMap = allocateIdr(
      totalIdr,
      memberList.filter((member) => member.cost > 0).map((member) => ({ userId: member.userId, cost: member.cost })),
      totalCost,
    );

    await tx`delete from period_snapshots where period_id = ${periodId}`;
    await tx`delete from period_daily_snapshots where period_id = ${periodId}`;
    const dailyRows = await tx<
      Array<{ day: string; member_user_id: string; cost_microcents: string | number }>
    >`
      select ud.day, m.member_user_id, coalesce(sum(ud.cost_microcents), 0)::text as cost_microcents
      from usage_daily ud
      join service_accounts sa
        on sa.group_id = ud.group_id and sa.account_id = ud.service_account_id
      join account_mappings m
        on m.group_id = ud.group_id and m.service_account_id = ud.service_account_id
      where ud.group_id = ${groupId}
        and ud.day >= ${period.start_date}
        and ud.day < ${period.end_date}
        and sa.is_reader = false
        and m.member_user_id is not null
      group by ud.day, m.member_user_id
    `;
    for (const row of dailyRows) {
      await tx`
        insert into period_daily_snapshots(period_id, day, member_user_id, cost_microcents)
        values (${periodId}, ${row.day}, ${row.member_user_id}, ${toNumber(row.cost_microcents)})
      `;
    }
    for (const member of memberList) {
      const share = (member.cost / totalCost) * 100;
      await tx`
        insert into period_snapshots(
          period_id, member_user_id, list_cost_microcents, share_pct, quota_pct,
          amount_usd, amount_idr, requests, input_tokens, output_tokens, cache_read_tokens
        ) values (
          ${periodId}, ${member.userId}, ${member.cost}, ${round4(share)},
          ${round4((share * quota.month.percent) / 100)},
          ${round2((toNumber(period.plan_price_usd) * share) / 100)},
          ${idrMap.get(member.userId) ?? 0},
          ${member.requests}, ${member.tokens.input}, ${member.tokens.output},
          ${member.tokens.cacheRead}
        )
      `;
    }
    await tx`
      update periods
      set status = 'finalized', finalized_at = now(), finalized_by = ${actorUserId},
          snapshot_total_microcents = ${totalCost},
          snapshot_month_percent = ${quota.month.percent}, updated_at = now()
      where id = ${periodId}
    `;
  });

  await audit({
    groupId,
    actorUserId,
    action: "period.finalized",
    target: periodId,
  });
}

export async function reopenPeriod(
  groupId: string,
  periodId: string,
  actorUserId: string,
): Promise<void> {
  await sql.begin(async (tx) => {
    const rows = await tx<PeriodRow[]>`
      select * from periods where id = ${periodId} and group_id = ${groupId} for update
    `;
    const period = rows[0];
    if (!period) throw notFound("Period not found.");
    if (period.status !== "finalized") throw conflict("This period is not finalized.");
    await tx`delete from period_snapshots where period_id = ${periodId}`;
    await tx`delete from period_daily_snapshots where period_id = ${periodId}`;
    await tx`
      update periods
      set status = 'draft', finalized_at = null, finalized_by = null,
          snapshot_total_microcents = null, snapshot_month_percent = null, updated_at = now()
      where id = ${periodId}
    `;
  });
  await audit({
    groupId,
    actorUserId,
    action: "period.reopened",
    target: periodId,
  });
}

export async function getSuperadminGroups(): Promise<SuperadminGroup[]> {
  const rows = await sql<
    Array<{
      id: string;
      name: string;
      owner_email: string;
      owner_name: string;
      status: string;
      member_count: string;
      created_at: Date | string;
    }>
  >`
    select g.id, g.name, owner.email as owner_email, owner.name as owner_name, g.status,
           (select count(*)::text from group_members gm
            where gm.group_id = g.id and gm.status = 'active') as member_count,
           g.created_at
    from groups g
    join users owner on owner.id = g.owner_user_id
    order by g.created_at desc
  `;
  const result: SuperadminGroup[] = [];
  for (const row of rows) {
    const connection = await getConnection(row.id);
    result.push({
      id: row.id,
      name: row.name,
      ownerEmail: row.owner_email,
      ownerName: row.owner_name,
      status: row.status,
      memberCount: toNumber(row.member_count),
      consoleStatus: connection?.status ?? null,
      plan: connection?.plan ?? null,
      lastSyncAt: toIso(connection?.last_sync_at ?? null),
      lastError: connection?.last_error ?? null,
      createdAt: toIso(row.created_at) ?? "",
    });
  }
  return result;
}

export async function getAppSettings(): Promise<{
  maxGroupsPerUser: number;
  signupOpen: boolean;
}> {
  return {
    maxGroupsPerUser: await getSetting<number>("max_groups_per_user", config.maxGroupsDefault),
    signupOpen: await getSetting<boolean>("signup_open", true),
  };
}

export function assertOwnerRole(role: GroupRole): void {
  if (role !== "owner") throw forbidden("Only the group owner can do this.");
}
