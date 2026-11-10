import { useEffect } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarRange,
  Crown,
  Info,
  Lock,
  Network,
  Pencil,
  Receipt,
  RefreshCw,
  Settings2,
  UserRound,
} from "lucide-react";
import type { ConsoleStatus, GroupSummary, HistoryResponse, PeriodInfo } from "@shared/types";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { BillCard } from "@/components/bill-card";
import { DailyChart } from "@/components/daily-chart";
import { MembersTable } from "@/components/members-table";
import { QuotaCards } from "@/components/quota-cards";
import { ReconciliationCard } from "@/components/reconciliation-card";
import { ShareChart } from "@/components/share-chart";
import { WarningsPanel } from "@/components/warnings-panel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/hooks/use-api";
import { usePageMeta } from "@/hooks/use-page-meta";
import { ApiError } from "@/lib/api";
import { notifySuccess } from "@/lib/notify";
import { relativeTime } from "@/lib/format";

interface GroupBase {
  group: {
    id: string;
    name: string;
    role: "owner" | "member";
    ownerName: string;
    memberCount: number;
    isOwner: boolean;
    createdAt: string;
  };
  connection: ConsoleStatus | { connected: boolean; status: string };
  periods: PeriodInfo[];
}

export function GroupDashboardPage() {
  const { groupId = "" } = useParams();
  const [search, setSearch] = useSearchParams();
  const periodId = search.get("periodId") || undefined;

  const group = useApi<GroupBase>(groupId ? `/api/groups/${groupId}` : null);
  usePageMeta({
    title: group.data?.group.name ?? "Group",
    group: group.data?.group
      ? { id: group.data.group.id, name: group.data.group.name }
      : null,
  });
  const summary = useApi<GroupSummary>(
    groupId
      ? `/api/groups/${groupId}/summary${periodId ? `?periodId=${encodeURIComponent(periodId)}` : ""}`
      : null,
  );
  const history = useApi<HistoryResponse>(
    groupId
      ? `/api/groups/${groupId}/history?days=30${periodId ? `&periodId=${encodeURIComponent(periodId)}` : ""}`
      : null,
  );

  useEffect(() => {
    const timer = window.setInterval(() => {
      group.refresh();
      summary.refresh();
      history.refresh();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [group.refresh, summary.refresh, history.refresh]);

  const selectPeriod = (value: string) => {
    if (!value) {
      setSearch({});
    } else {
      setSearch({ periodId: value });
    }
  };

  if (group.loading && !group.data) {
    return (
      <AppShell groupId={groupId}>
        <div className="space-y-4">
          <Skeleton className="h-12 w-64" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-36" />
            <Skeleton className="h-36" />
            <Skeleton className="h-36" />
          </div>
          <Skeleton className="h-72 w-full" />
        </div>
      </AppShell>
    );
  }

  if (group.error || !group.data) {
    return (
      <AppShell groupId={groupId}>
        <Alert variant="destructive">
          <AlertTitle>Could not load this group</AlertTitle>
          <AlertDescription>{group.error?.message ?? "Group not found."}</AlertDescription>
        </Alert>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/app">
            <ArrowLeft />
            Back to groups
          </Link>
        </Button>
      </AppShell>
    );
  }

  const base = group.data;
  const noPeriod = summary.error instanceof ApiError && summary.error.code === "no_period";

  if (base.group.isOwner && !base.connection.connected) {
    return <Navigate to={`/app/g/${groupId}/admin?tab=connection`} replace />;
  }

  return (
    <AppShell groupId={groupId}>
      <PageHeader
        backTo="/app"
        backLabel="Back to groups"
        title={base.group.name}
        meta={
          <>
            <Badge variant={base.group.isOwner ? "default" : "outline"} className="font-normal">
              {base.group.isOwner ? <Crown className="h-3 w-3" /> : <UserRound className="h-3 w-3" />}
              {base.group.isOwner ? "Owner" : "Member"}
            </Badge>
            {summary.data?.period.status === "finalized" ? (
              <Badge variant="success" className="font-normal">
                <Lock className="h-3 w-3" />
                Finalized
              </Badge>
            ) : (
              <Badge variant="secondary" className="font-normal">
                <Pencil className="h-3 w-3" />
                Draft
              </Badge>
            )}
          </>
        }
        description={
          <>
            Owner {base.group.ownerName} · {base.group.memberCount} member
            {base.group.memberCount === 1 ? "" : "s"} · sync{" "}
            {relativeTime(summary.data?.lastSync.at ?? null)}
          </>
        }
        actions={
          <>
            {base.periods.length > 0 && (
              <Select
                value={periodId ?? "current"}
                onValueChange={(value) => selectPeriod(value === "current" ? "" : value)}
              >
                <SelectTrigger className="w-full sm:w-[230px]" aria-label="Billing period">
                  <CalendarRange className="mr-2 h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder="Current period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="current">Current period</SelectItem>
                  {base.periods.map((period) => (
                    <SelectItem key={period.id} value={period.id}>
                      {period.label}
                      {period.status === "finalized" ? " · finalized" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                summary.refresh();
                history.refresh();
                group.refresh();
                notifySuccess("Dashboard refreshed.");
              }}
            >
              <RefreshCw />
              Refresh
            </Button>
            {base.group.isOwner && (
              <Button size="sm" asChild>
                <Link to={`/app/g/${groupId}/admin`}>
                  <Settings2 />
                  Manage
                </Link>
              </Button>
            )}
          </>
        }
      />

      {noPeriod ? (
        <Card>
          <CardHeader>
            <CardTitle>No billing period yet</CardTitle>
            <CardDescription>
              Connect the OpenCode read-only key or run a sync to create the first period.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {base.group.isOwner ? (
              <Button asChild>
                <Link to={`/app/g/${groupId}/admin?tab=connection`}>
                  <Settings2 />
                  Open connection settings
                </Link>
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                Ask the group owner to connect the Console key.
              </p>
            )}
          </CardContent>
        </Card>
      ) : summary.error || !summary.data ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load the summary</AlertTitle>
          <AlertDescription>{summary.error?.message ?? "Unknown error."}</AlertDescription>
        </Alert>
      ) : (
        <div className="animate-fade-in space-y-6">
          <QuotaCards summary={summary.data} />
          <WarningsPanel summary={summary.data} hideBillWarning />

          {summary.data.group.isOwner && summary.data.unmapped.length > 0 && (
            <Alert variant="warning">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Unmapped service accounts block finalization</AlertTitle>
              <AlertDescription>
                <ul className="list-disc space-y-1 pl-4">
                  {summary.data.unmapped.map((account) => (
                    <li key={account.accountId}>
                      {account.name} — ${account.listCostUsd.toFixed(2)} list cost
                    </li>
                  ))}
                </ul>
                <Button asChild size="sm" variant="outline" className="mt-3">
                  <Link to={`/app/g/${groupId}/admin?tab=mapping`}>
                    <Network />
                    Map accounts
                  </Link>
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {summary.data.group.isOwner &&
            summary.data.period.status === "draft" &&
            summary.data.finalize.blockers.length > 0 && (
              <Alert variant="info">
                <Info className="h-4 w-4" />
                <AlertTitle>Before finalizing</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc space-y-1 pl-4">
                    {summary.data.finalize.blockers.map((blocker) => (
                      <li key={blocker}>{blocker}</li>
                    ))}
                  </ul>
                  <Button asChild size="sm" variant="outline" className="mt-3">
                    <Link to={`/app/g/${groupId}/admin?tab=billing`}>
                      <Receipt />
                      Open billing
                    </Link>
                  </Button>
                </AlertDescription>
              </Alert>
            )}

          <section className="grid grid-cols-1 gap-4 lg:grid-cols-5 lg:gap-6">
            <ShareChart summary={summary.data} className="lg:col-span-2" />
            <DailyChart history={history.data ?? { period: summary.data.period, members: [], days: [] }} className="lg:col-span-3" />
          </section>

          <MembersTable summary={summary.data} groupId={groupId} />

          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
            <ReconciliationCard summary={summary.data} />
            <BillCard summary={summary.data} />
          </section>

          <p className="text-xs text-muted-foreground">
            Console status: {base.connection.status}. Last sync{" "}
            {summary.data.lastSync.at ? relativeTime(summary.data.lastSync.at) : "never"}.
          </p>
        </div>
      )}
    </AppShell>
  );
}
