export type GroupRole = "owner" | "member";
export type PeriodStatus = "draft" | "finalized";
export type UserType = "service_account" | "member";

export interface PublicConfig {
  appName: string;
  turnstileSiteKey: string;
  signupOpen: boolean;
  setupRequired: boolean;
  devEmailLinks: boolean;
}

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  isSuperadmin: boolean;
  emailVerified: boolean;
  csrfToken: string;
}

export interface GroupListItem {
  id: string;
  name: string;
  role: GroupRole;
  ownerName: string;
  memberCount: number;
  consoleStatus: string | null;
  plan: string | null;
  currentPeriod: PeriodInfo | null;
  periodStatus: PeriodStatus | null;
  lastSyncAt: string | null;
  monthlyPercent: number | null;
}

export interface PeriodInfo {
  id: string;
  start: string;
  end: string;
  startDate: string;
  endDate: string;
  label: string;
  status: PeriodStatus;
  totalIdr: number | null;
  finalizedAt: string | null;
}

export interface QuotaMeter {
  usedUsd: number;
  limitUsd: number;
  percent: number;
  resetsAt: string | null;
}

export interface TokenTotals {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface GroupMemberSummary {
  userId: string;
  name: string;
  role: GroupRole;
  status: "active" | "removed";
  listCostUsd: number;
  sharePct: number;
  quotaPct: number;
  amountUsd: number;
  amountIdr: number | null;
  requests: number;
  tokens: TokenTotals;
  mappedAccounts: number;
  lastActiveAt: string | null;
}

export interface UnmappedAccount {
  accountId: string;
  name: string;
  keyNames: string[];
  listCostUsd: number;
  requests: number;
  lastActiveAt: string | null;
}

export interface GroupSummary {
  group: {
    id: string;
    name: string;
    role: GroupRole;
    ownerName: string;
    memberCount: number;
    isOwner: boolean;
  };
  period: PeriodInfo;
  plan: { priceUsd: number; monthlyLimitUsd: number };
  quota: { fiveHour: QuotaMeter; week: QuotaMeter; month: QuotaMeter };
  total: { listCostUsd: number; requests: number; tokens: TokenTotals };
  bill: { totalIdr: number | null; currency: "IDR"; usdReferenceTotal: number };
  members: GroupMemberSummary[];
  unmapped: UnmappedAccount[];
  reconciliation: {
    meterUsedUsd: number;
    exportListCostUsd: number;
    differenceUsd: number;
    note: string;
  };
  finalize: {
    canFinalize: boolean;
    blockers: string[];
    finalizedAt: string | null;
    finalizedBy: string | null;
  };
  warnings: string[];
  lastSync: { at: string | null; status: string; error: string | null };
}

export interface HistoryResponse {
  period: PeriodInfo;
  members: Array<{ userId: string; name: string }>;
  days: Array<{
    day: string;
    totalUsd: number;
    members: Array<{ userId: string; name: string; costUsd: number }>;
  }>;
}

export interface ServiceAccountItem {
  accountId: string;
  name: string;
  keyNames: string[];
  isReader: boolean;
  lastActiveAt: string | null;
  isMapped: boolean;
  mappedUserId: string | null;
  mappedUserName: string | null;
  listCostUsd: number;
  requests: number;
}

export interface InviteItem {
  id: string;
  email: string | null;
  role: GroupRole;
  status: "pending" | "accepted" | "expired";
  createdAt: string;
  expiresAt: string;
  createdBy: string;
  link: string | null;
}

export interface MemberListItem {
  userId: string;
  name: string;
  email: string | null;
  role: GroupRole;
  status: "active" | "removed";
  joinedAt: string;
  mappedAccounts: number;
  listCostUsd: number;
}

export interface MemberModelUsage {
  provider: string;
  model: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  listCostUsd: number;
  sharePct: number;
}

export interface MemberUsageDetail {
  member: { userId: string; name: string };
  period: PeriodInfo;
  totals: { listCostUsd: number; requests: number; tokens: TokenTotals };
  mappedAccounts: number;
  models: MemberModelUsage[];
}

export interface AuditLogItem {
  id: string;
  action: string;
  actorName: string | null;
  target: string | null;
  metadata: unknown;
  createdAt: string;
}

export interface ConsoleStatus {
  connected: boolean;
  status: string;
  keyHint: string | null;
  plan: string | null;
  orgId: string | null;
  lastVerifiedAt: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
}

export interface SuperadminGroup {
  id: string;
  name: string;
  ownerEmail: string;
  ownerName: string;
  status: string;
  memberCount: number;
  consoleStatus: string | null;
  plan: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  createdAt: string;
}

export interface AppSettings {
  maxGroupsPerUser: number;
  signupOpen: boolean;
}
