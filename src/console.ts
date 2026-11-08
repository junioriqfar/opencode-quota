import { config } from "./config.ts";
import { HttpError, badRequest } from "./errors.ts";

export interface ConsoleMeter {
  startsAt?: string;
  resetsAt?: string;
  limitMicroCents: string;
  usedMicroCents: string;
}

export interface GoStatus {
  product: string;
  access: {
    startsAt: string;
    endsAt: string;
    meters: {
      fiveHour: ConsoleMeter;
      week: ConsoleMeter;
      month: ConsoleMeter;
    };
  };
  raw: {
    subscriberUserId?: string;
    [key: string]: unknown;
  };
}

export interface ServiceAccountKey {
  id: string;
  name: string;
  permissions: string;
  status: string;
  tokenHint: string | null;
  lastUsedAt: string | null;
  expiresAt: string | null;
}

export interface ServiceAccount {
  id: string;
  name: string;
  createdAt: string | null;
  keys: ServiceAccountKey[];
}

export interface UsageExportRow {
  day: string;
  user_type: "service_account" | "member";
  user_id: string;
  user_name?: string;
  provider: string;
  model: string;
  requests: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_5m_tokens: number;
  cache_write_1h_tokens: number;
  cost_microcents: number;
}

export interface ValidatedConsoleKey {
  go: GoStatus;
  accounts: ServiceAccount[];
  orgId: string;
  workspaceId: string | null;
  readerAccountId: string;
  plan: string;
  keyHint: string;
}

function headers(key: string): HeadersInit {
  return {
    Authorization: `Bearer ${key}`,
    Accept: "application/json, text/csv, text/plain, */*",
    "User-Agent": "opencode-quota-status/2.0",
  };
}

async function consoleFetch(key: string, path: string): Promise<Response> {
  const response = await fetch(`${config.consoleBase}${path}`, {
    headers: headers(key),
    signal: AbortSignal.timeout(35_000),
  });
  if (!response.ok) {
    let detail = "";
    try {
      detail = (await response.text()).slice(0, 200);
    } catch {
      // ignore
    }
    throw new HttpError(
      response.status === 401 || response.status === 403 ? 422 : 502,
      "console_request_failed",
      `OpenCode Console returned ${response.status}.${detail ? ` ${detail}` : ""}`,
    );
  }
  return response;
}

async function consoleJson<T>(key: string, path: string): Promise<T> {
  const response = await consoleFetch(key, path);
  return (await response.json()) as T;
}

export async function getConsoleBaseUrl(): Promise<string> {
  return config.consoleBase;
}

export async function getGoStatus(key: string): Promise<GoStatus> {
  const body = await consoleJson<{
    product?: string;
    subscriberUserId?: string;
    access?: {
      startsAt?: string;
      endsAt?: string;
      meters?: {
        fiveHour?: Partial<ConsoleMeter>;
        week?: Partial<ConsoleMeter>;
        month?: Partial<ConsoleMeter>;
      };
    };
  }>(key, "/go/status");

  const meters = body.access?.meters;
  if (!body.access?.startsAt || !body.access.endsAt || !meters?.fiveHour || !meters.week || !meters.month) {
    throw new HttpError(502, "console_invalid_response", "Unexpected /go/status response.");
  }
  const meter = (value: Partial<ConsoleMeter>): ConsoleMeter => ({
    startsAt: value.startsAt,
    resetsAt: value.resetsAt,
    limitMicroCents: String(value.limitMicroCents ?? "0"),
    usedMicroCents: String(value.usedMicroCents ?? "0"),
  });

  return {
    product: body.product ?? "go",
    access: {
      startsAt: body.access.startsAt,
      endsAt: body.access.endsAt,
      meters: {
        fiveHour: meter(meters.fiveHour),
        week: meter(meters.week),
        month: meter(meters.month),
      },
    },
    raw: body,
  };
}

export async function getConsoleConfig(key: string): Promise<{
  orgId: string | null;
  workspaceId: string | null;
}> {
  const body = await consoleJson<{
    config?: {
      provider?: Record<string, { options?: { headers?: Record<string, string> } }>;
    };
  }>(key, "/config");
  const providers = body.config?.provider ?? {};
  for (const provider of Object.values(providers)) {
    const orgId = provider.options?.headers?.["x-opencode-org-id"];
    if (orgId) return { orgId, workspaceId: null };
  }
  return { orgId: null, workspaceId: null };
}

async function fetchPaged<T>(
  key: string,
  path: string,
  extract: (body: unknown) => { items: T[]; pageCount?: number },
): Promise<T[]> {
  const items: T[] = [];
  let page = 1;
  for (;;) {
    const separator = path.includes("?") ? "&" : "?";
    const body = await consoleJson<unknown>(key, `${path}${separator}page=${page}&pageSize=100`);
    const parsed = extract(body);
    items.push(...parsed.items);
    const pageCount = parsed.pageCount ?? 1;
    if (page >= pageCount || parsed.items.length === 0) break;
    page += 1;
  }
  return items;
}

export async function getServiceAccounts(key: string): Promise<ServiceAccount[]> {
  return fetchPaged(
    key,
    "/service-accounts",
    (body) => {
      const b = body as {
        items?: Array<{
          account?: { id?: string; name?: string; createdAt?: string };
          keys?: Array<{
            id?: string;
            name?: string;
            permissions?: string;
            status?: string;
            tokenHint?: string | null;
            lastUsedAt?: string | null;
            expiresAt?: string | null;
          }>;
        }>;
        pageInfo?: { pageCount?: number };
      };
      return {
        items: (b.items ?? [])
          .filter((item) => item.account?.id)
          .map((item) => ({
            id: item.account!.id!,
            name: item.account!.name ?? item.account!.id!,
            createdAt: item.account!.createdAt ?? null,
            keys: (item.keys ?? [])
              .filter((entry) => entry.id)
              .map((entry) => ({
                id: entry.id!,
                name: entry.name ?? entry.id!,
                permissions: entry.permissions ?? "unknown",
                status: entry.status ?? "unknown",
                tokenHint: entry.tokenHint ?? null,
                lastUsedAt: entry.lastUsedAt ?? null,
                expiresAt: entry.expiresAt ?? null,
              })),
          })),
        pageCount: b.pageInfo?.pageCount,
      };
    },
  );
}

function keyMatchesHint(key: string, hint: string | null): boolean {
  if (!hint) return false;
  const clean = hint.replace(/\.\.\.$/, "");
  if (clean.length < 10) return false;
  return key.startsWith(clean) || clean.startsWith(key.slice(0, clean.length));
}

export async function validateConsoleKey(key: string): Promise<ValidatedConsoleKey> {
  const [go, consoleConfig, accounts] = await Promise.all([
    getGoStatus(key),
    getConsoleConfig(key),
    getServiceAccounts(key),
  ]);

  let matchedAccount: ServiceAccount | null = null;
  let matchedKey: ServiceAccountKey | null = null;
  for (const account of accounts) {
    for (const entry of account.keys) {
      if (entry.status !== "active") continue;
      if (keyMatchesHint(key, entry.tokenHint)) {
        matchedAccount = account;
        matchedKey = entry;
        break;
      }
    }
    if (matchedAccount) break;
  }

  if (!matchedAccount || !matchedKey) {
    throw badRequest(
      "This key is not a service account key in this Console workspace. Create a dedicated read-only service account key and try again.",
    );
  }
  if (matchedKey.permissions !== "read") {
    throw badRequest(
      `This key has "${matchedKey.permissions}" permission. Create a service account key with read-only permission.`,
    );
  }

  const orgId = consoleConfig.orgId ?? go.raw.subscriberUserId ?? null;
  if (!orgId) {
    throw new HttpError(502, "console_org_missing", "Could not detect the OpenCode workspace ID.");
  }

  return {
    go,
    accounts,
    orgId,
    workspaceId: go.raw.subscriberUserId ?? consoleConfig.workspaceId,
    readerAccountId: matchedAccount.id,
    plan: go.product,
    keyHint: matchedKey.tokenHint ?? `${key.slice(0, 14)}…`,
  };
}

export async function getUsageExportCsv(key: string, range: "7d" | "30d" | "90d"): Promise<string> {
  const response = await consoleFetch(key, `/v2/usage/export?range=${range}`);
  return await response.text();
}

/** RFC4180-ish CSV parser. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      field = "";
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((cell) => cell.length > 0)) rows.push(row);
  }
  return rows;
}

function toInt(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseUsageExport(text: string): UsageExportRow[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const header = rows[0].map((cell) => cell.trim());
  const index = new Map(header.map((name, i) => [name, i]));
  const at = (row: string[], name: string): string | undefined => {
    const i = index.get(name);
    return i === undefined ? undefined : row[i];
  };

  const out: UsageExportRow[] = [];
  for (const row of rows.slice(1)) {
    const day = (at(row, "day") ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const rawType = (at(row, "user_type") ?? "").trim().toLowerCase().replace(/-/g, "_");
    const userType = rawType === "service_account" ? "service_account" : "member";
    const userId = (at(row, "user_id") ?? "").trim();
    if (!userId) continue;
    out.push({
      day,
      user_type: userType,
      user_id: userId,
      user_name: (at(row, "user_name") ?? "").trim() || undefined,
      provider: (at(row, "provider") ?? "").trim() || "unknown",
      model: (at(row, "model") ?? "").trim() || "unknown",
      requests: toInt(at(row, "requests")),
      input_tokens: toInt(at(row, "input_tokens")),
      output_tokens: toInt(at(row, "output_tokens")),
      cache_read_tokens: toInt(at(row, "cache_read_tokens")),
      cache_write_5m_tokens: toInt(at(row, "cache_write_5m_tokens")),
      cache_write_1h_tokens: toInt(at(row, "cache_write_1h_tokens")),
      cost_microcents: toInt(at(row, "cost_micro_cents")),
    });
  }
  return out;
}
