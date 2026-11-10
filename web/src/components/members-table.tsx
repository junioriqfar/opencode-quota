import { useState } from "react";
import {
  Boxes,
  ChevronDown,
  ChevronUp,
  Clock3,
  Crown,
  Lock,
  Pencil,
  UserMinus,
  Users,
  UserRound,
} from "lucide-react";
import type { GroupMemberSummary, GroupSummary } from "@shared/types";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { MemberModelUsageDialog } from "@/components/member-model-usage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatDateTime, formatIdr, formatNumber, formatPct, formatUsd } from "@/lib/format";

function Avatar({ name }: { name: string }) {
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 text-sm font-semibold text-primary ring-1 ring-primary/10">
      {name.trim().charAt(0).toUpperCase() || "?"}
    </div>
  );
}

function RoleBadge({ member }: { member: GroupMemberSummary }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge variant={member.role === "owner" ? "default" : "outline"} className="font-normal">
        {member.role === "owner" ? <Crown className="h-3 w-3" /> : <UserRound className="h-3 w-3" />}
        {member.role === "owner" ? "Owner" : "Member"}
      </Badge>
      {member.status === "removed" && (
        <Badge variant="secondary" className="font-normal">
          <UserMinus className="h-3 w-3" />
          Removed
        </Badge>
      )}
    </div>
  );
}

function MemberName({ member }: { member: GroupMemberSummary }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar name={member.name} />
      <div className="min-w-0">
        <div className="truncate font-medium">{member.name}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <span>{member.mappedAccounts} mapped account{member.mappedAccounts === 1 ? "" : "s"}</span>
          <span className="inline-flex items-center gap-1">
            <Clock3 className="h-3 w-3" />
            {formatDateTime(member.lastActiveAt)}
          </span>
        </div>
      </div>
    </div>
  );
}

function ShareCell({ member }: { member: GroupMemberSummary }) {
  return (
    <div className="min-w-[112px] space-y-1.5">
      <div className="flex items-center justify-between text-xs tabular-nums">
        <span className="font-medium">{formatPct(member.sharePct)}</span>
        <span className="text-muted-foreground">{formatNumber(member.requests)} req</span>
      </div>
      <Progress value={Math.min(100, member.sharePct)} className="h-1.5" indicatorClassName="bg-gradient-to-r from-emerald-400 to-teal-500" />
    </div>
  );
}

function MobileMemberCard({
  member,
  expanded,
  onToggle,
}: {
  member: GroupMemberSummary;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <MemberName member={member} />
        <RoleBadge member={member} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">List cost</div>
          <div className="font-medium tabular-nums">{formatUsd(member.listCostUsd, true)}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Share</div>
          <div className="font-medium tabular-nums">{formatPct(member.sharePct)}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Quota est.</div>
          <div className="font-medium tabular-nums">{formatPct(member.quotaPct)}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Requests</div>
          <div className="font-medium tabular-nums">{formatNumber(member.requests)}</div>
        </div>
      </div>
      <div className="mt-3 rounded-lg bg-muted/50 px-3 py-2">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Bill</div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-lg font-semibold tabular-nums">{formatIdr(member.amountIdr)}</span>
          <span className="text-xs text-muted-foreground tabular-nums">{formatUsd(member.amountUsd)}</span>
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="mt-3 w-full justify-between"
        onClick={onToggle}
      >
        <span className="inline-flex items-center gap-1.5">
          <Boxes className="h-3.5 w-3.5" />
          Model usage
        </span>
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </Button>
    </div>
  );
}

export function MembersTable({
  summary,
  groupId,
}: {
  summary: GroupSummary;
  groupId: string;
}) {
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const expandedMember =
    summary.members.find((member) => member.userId === expandedUserId) ?? null;
  const toggle = (userId: string) =>
    setExpandedUserId((current) => (current === userId ? null : userId));

  const columns: DataTableColumn<GroupMemberSummary>[] = [
    {
      key: "member",
      header: "Member",
      headerClassName: "min-w-[220px]",
      sortValue: (member) => member.name,
      cell: (member) => <MemberName member={member} />,
    },
    {
      key: "role",
      header: "Role",
      sortValue: (member) => member.role,
      cell: (member) => <RoleBadge member={member} />,
    },
    {
      key: "cost",
      header: "List cost",
      headerClassName: "text-right",
      className: "text-right font-medium tabular-nums",
      sortValue: (member) => member.listCostUsd,
      cell: (member) => formatUsd(member.listCostUsd, true),
    },
    {
      key: "share",
      header: "Share",
      headerClassName: "min-w-[140px]",
      sortValue: (member) => member.sharePct,
      cell: (member) => <ShareCell member={member} />,
    },
    {
      key: "quota",
      header: "Quota est.",
      headerClassName: "text-right",
      className: "text-right tabular-nums",
      sortValue: (member) => member.quotaPct,
      cell: (member) => formatPct(member.quotaPct),
    },
    {
      key: "models",
      header: "Models",
      headerClassName: "text-right",
      className: "text-right",
      cell: (member) => (
        <Button variant="outline" size="sm" onClick={() => toggle(member.userId)}>
          <Boxes />
          Models
        </Button>
      ),
    },
    {
      key: "bill",
      header: "Bill",
      headerClassName: "text-right",
      className: "text-right",
      sortValue: (member) => member.amountIdr ?? 0,
      cell: (member) => (
        <div>
          <div className="font-semibold tabular-nums">{formatIdr(member.amountIdr)}</div>
          <div className="text-[11px] text-muted-foreground tabular-nums">{formatUsd(member.amountUsd)}</div>
        </div>
      ),
    },
  ];

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            Members
          </CardTitle>
          <CardDescription>
            Everyone in this group can see all members and usage. Bills use list cost share.
          </CardDescription>
        </div>
        <Badge variant={summary.period.status === "finalized" ? "success" : "secondary"} className="shrink-0 font-normal">
          {summary.period.status === "finalized" ? <Lock className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
          {summary.period.status === "finalized" ? "Finalized" : "Draft"}
        </Badge>
      </CardHeader>
      <CardContent>
        {summary.members.length === 0 ? (
          <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
            No members with usage yet.
          </div>
        ) : (
          <>
            <div className="hidden md:block">
              <DataTable
                columns={columns}
                rows={summary.members}
                rowKey={(member) => member.userId}
                initialPageSize={10}
                empty="No members with usage yet."
                footerRow={
                  <TableRow>
                    <TableCell className="font-semibold">Total</TableCell>
                    <TableCell />
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatUsd(summary.total.listCostUsd, true)}
                    </TableCell>
                    <TableCell className="font-semibold tabular-nums">100.00%</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatPct(summary.quota.month.percent)}
                    </TableCell>
                    <TableCell />
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatIdr(summary.bill.totalIdr)}
                    </TableCell>
                  </TableRow>
                }
              />
            </div>

            <div className="space-y-3 md:hidden">
              {summary.members.map((member) => (
                <MobileMemberCard
                  key={member.userId}
                  member={member}
                  expanded={expandedUserId === member.userId}
                  onToggle={() => toggle(member.userId)}
                />
              ))}
              <div className="rounded-xl border border-dashed p-4 text-sm">
                <div className="flex items-center justify-between font-semibold">
                  <span>Total</span>
                  <span className="tabular-nums">{formatIdr(summary.bill.totalIdr)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>List cost {formatUsd(summary.total.listCostUsd, true)}</span>
                  <span>Quota {formatPct(summary.quota.month.percent)}</span>
                </div>
              </div>
            </div>

            {expandedMember && (
              <MemberModelUsageDialog
                open={!!expandedMember}
                onOpenChange={(open) => {
                  if (!open) setExpandedUserId(null);
                }}
                groupId={groupId}
                userId={expandedMember.userId}
                name={expandedMember.name}
                periodId={summary.period.id}
              />
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
