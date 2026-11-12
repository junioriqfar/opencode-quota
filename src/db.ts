import postgres from "postgres";
import { config } from "./config.ts";

export const sql = postgres(config.databaseUrl, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  onnotice: () => {},
});

const SCHEMA = `
create table if not exists users (
  id text primary key,
  email text not null,
  name text not null,
  password_hash text not null,
  email_verified_at timestamptz,
  is_superadmin boolean not null default false,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists users_email_unique on users (lower(email));

create table if not exists sessions (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  token_hash text not null unique,
  csrf_token text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  ip text,
  user_agent text
);
create index if not exists sessions_user_idx on sessions(user_id);

create table if not exists email_tokens (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  type text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists email_tokens_user_idx on email_tokens(user_id, type);

create table if not exists groups (
  id text primary key,
  name text not null,
  owner_user_id text not null references users(id),
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists groups_owner_idx on groups(owner_user_id);

create table if not exists group_members (
  group_id text not null references groups(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  role text not null default 'member',
  status text not null default 'active',
  joined_at timestamptz not null default now(),
  removed_at timestamptz,
  primary key (group_id, user_id)
);
create index if not exists group_members_user_idx on group_members(user_id);

create table if not exists invites (
  id text primary key,
  group_id text not null references groups(id) on delete cascade,
  email text,
  role text not null default 'member',
  token_hash text not null unique,
  token_ciphertext text,
  token_iv text,
  token_tag text,
  expires_at timestamptz not null,
  used_at timestamptz,
  accepted_by text references users(id),
  created_by text not null references users(id),
  created_at timestamptz not null default now()
);
create index if not exists invites_group_idx on invites(group_id);

create table if not exists console_connections (
  group_id text primary key references groups(id) on delete cascade,
  key_ciphertext text not null,
  key_iv text not null,
  key_tag text not null,
  key_fingerprint text not null,
  key_hint text not null,
  console_org_id text not null unique,
  console_workspace_id text,
  reader_account_id text,
  plan text,
  status text not null default 'pending',
  last_verified_at timestamptz,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists service_accounts (
  group_id text not null references groups(id) on delete cascade,
  account_id text not null,
  name text not null,
  key_names jsonb not null default '[]'::jsonb,
  is_reader boolean not null default false,
  last_active_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (group_id, account_id)
);

create table if not exists account_mappings (
  group_id text not null,
  service_account_id text not null,
  member_user_id text not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (group_id, service_account_id),
  foreign key (group_id, service_account_id) references service_accounts(group_id, account_id) on delete cascade
);
create index if not exists account_mappings_member_idx on account_mappings(group_id, member_user_id);

create table if not exists periods (
  id text primary key,
  group_id text not null references groups(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  start_date text not null,
  end_date text not null,
  plan_price_usd numeric(10,2) not null default 10,
  total_idr bigint,
  status text not null default 'draft',
  finalized_at timestamptz,
  finalized_by text references users(id),
  snapshot_total_microcents bigint,
  snapshot_month_percent numeric(10,4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, start_at)
);
create index if not exists periods_group_idx on periods(group_id, start_at desc);

create table if not exists usage_daily (
  group_id text not null,
  day text not null,
  service_account_id text not null,
  provider text not null,
  model text not null,
  requests integer not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  cache_read_tokens bigint not null default 0,
  cache_write_5m_tokens bigint not null default 0,
  cache_write_1h_tokens bigint not null default 0,
  cost_microcents bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (group_id, day, service_account_id, provider, model),
  foreign key (group_id, service_account_id) references service_accounts(group_id, account_id) on delete cascade
);
create index if not exists usage_daily_group_day_idx on usage_daily(group_id, day);

create table if not exists meter_snapshots (
  id text primary key,
  group_id text not null references groups(id) on delete cascade,
  period_id text not null references periods(id) on delete cascade,
  five_hour_used bigint not null default 0,
  five_hour_limit bigint not null default 0,
  five_hour_resets_at text,
  week_used bigint not null default 0,
  week_limit bigint not null default 0,
  week_resets_at text,
  month_used bigint not null default 0,
  month_limit bigint not null default 0,
  month_resets_at text,
  taken_at timestamptz not null default now(),
  raw jsonb not null default '{}'::jsonb
);
create index if not exists meter_group_period_idx on meter_snapshots(group_id, period_id, taken_at desc);

create table if not exists period_snapshots (
  period_id text not null references periods(id) on delete cascade,
  member_user_id text not null references users(id),
  list_cost_microcents bigint not null default 0,
  share_pct numeric(10,4) not null default 0,
  quota_pct numeric(10,4) not null default 0,
  amount_usd numeric(12,2) not null default 0,
  amount_idr bigint,
  requests integer not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  cache_read_tokens bigint not null default 0,
  created_at timestamptz not null default now(),
  primary key (period_id, member_user_id)
);

create table if not exists period_daily_snapshots (
  period_id text not null references periods(id) on delete cascade,
  day text not null,
  member_user_id text not null references users(id),
  cost_microcents bigint not null default 0,
  primary key (period_id, day, member_user_id)
);

create table if not exists audit_logs (
  id text primary key,
  group_id text references groups(id) on delete set null,
  actor_user_id text references users(id) on delete set null,
  action text not null,
  target text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_group_idx on audit_logs(group_id, created_at desc);

create table if not exists sync_runs (
  id text primary key,
  group_id text not null references groups(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',
  error text,
  rows integer not null default 0
);
create index if not exists sync_runs_group_idx on sync_runs(group_id, started_at desc);

create table if not exists app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists rate_limits (
  key text primary key,
  count integer not null default 0,
  reset_at timestamptz not null
);
create index if not exists rate_limits_reset_idx on rate_limits(reset_at);
`;

export async function initSchema(): Promise<void> {
  for (const statement of SCHEMA.split(";\n")) {
    const text = statement.trim();
    if (!text) continue;
    await sql.unsafe(text);
  }
  await sql`
    insert into app_settings(key, value)
    values ('max_groups_per_user', '3'::jsonb)
    on conflict (key) do nothing
  `;
  await sql`
    insert into app_settings(key, value)
    values ('signup_open', 'true'::jsonb)
    on conflict (key) do nothing
  `;
}

export async function closeDb(): Promise<void> {
  await sql.end({ timeout: 5 });
}

export function newId(): string {
  return crypto.randomUUID();
}

export function toIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return new Date(value).toISOString();
  return null;
}

export function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Number(value);
  return 0;
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const rows = await sql<{ value: T }[]>`select value from app_settings where key = ${key}`;
  return (rows[0]?.value ?? fallback) as T;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await sql`
    insert into app_settings(key, value, updated_at)
    values (${key}, ${sql.json(value as never)}, now())
    on conflict (key) do update set value = excluded.value, updated_at = now()
  `;
}

export async function audit(input: {
  groupId: string | null;
  actorUserId: string | null;
  action: string;
  target?: string | null;
  metadata?: unknown;
}): Promise<void> {
  await sql`
    insert into audit_logs(id, group_id, actor_user_id, action, target, metadata)
    values (
      ${newId()},
      ${input.groupId},
      ${input.actorUserId},
      ${input.action},
      ${input.target ?? null},
      ${sql.json((input.metadata ?? {}) as never)}
    )
  `;
}
