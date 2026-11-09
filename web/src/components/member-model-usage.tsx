import { Boxes, Loader2 } from "lucide-react";
import type { MemberUsageDetail } from "@shared/types";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useApi } from "@/hooks/use-api";
import { formatCompact, formatNumber, formatPct, formatUsd } from "@/lib/format";

export function MemberModelUsage({
  groupId,
  userId,
  periodId,
}: {
  groupId: string;
  userId: string;
  periodId?: string;
}) {
  const path = `/api/groups/${groupId}/members/${userId}/usage${
    periodId ? `?periodId=${encodeURIComponent(periodId)}` : ""
  }`;
  const usage = useApi<MemberUsageDetail>(path);

  if (usage.loading && !usage.data) {
    return (
      <div className="flex items-center gap-2 px-4 py-5 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading model usage…
      </div>
    );
  }

  if (usage.error) {
    return (
      <div className="px-4 py-5 text-sm text-destructive">{usage.error.message}</div>
    );
  }

  const data = usage.data;
  if (!data) return null;

  if (data.models.length === 0) {
    return (
      <div className="px-4 py-5 text-sm text-muted-foreground">
        No mapped model usage for this member in this period.
      </div>
    );
  }

  const columns: DataTableColumn<MemberUsageDetail["models"][number]>[] = [
    {
      key: "model",
      header: "Model",
      headerClassName: "min-w-[220px]",
      sortValue: (model) => model.model,
      cell: (model) => (
        <div className="space-y-1">
          <div className="font-mono text-xs font-medium">{model.model}</div>
          <Badge variant="secondary" className="font-normal">
            {model.provider}
          </Badge>
        </div>
      ),
    },
    {
      key: "requests",
      header: "Requests",
      headerClassName: "text-right",
      className: "text-right tabular-nums",
      sortValue: (model) => model.requests,
      cell: (model) => formatNumber(model.requests),
    },
    {
      key: "tokens",
      header: "Tokens in / out",
      headerClassName: "text-right",
      className: "text-right tabular-nums",
      sortValue: (model) => model.inputTokens + model.outputTokens,
      cell: (model) => (
        <div
          className="text-xs"
          title={`Input ${formatNumber(model.inputTokens)} · Output ${formatNumber(model.outputTokens)}`}
        >
          <div>{formatCompact(model.inputTokens)}</div>
          <div className="text-muted-foreground">{formatCompact(model.outputTokens)}</div>
        </div>
      ),
    },
    {
      key: "cache",
      header: "Cache read / write",
      headerClassName: "text-right",
      className: "text-right tabular-nums",
      sortValue: (model) => model.cacheReadTokens + model.cacheWriteTokens,
      cell: (model) => (
        <div
          className="text-xs"
          title={`Cache read ${formatNumber(model.cacheReadTokens)} · Cache write ${formatNumber(model.cacheWriteTokens)}`}
        >
          <div>{formatCompact(model.cacheReadTokens)}</div>
          <div className="text-muted-foreground">{formatCompact(model.cacheWriteTokens)}</div>
        </div>
      ),
    },
    {
      key: "cost",
      header: "List cost",
      headerClassName: "text-right",
      className: "text-right font-medium tabular-nums",
      sortValue: (model) => model.listCostUsd,
      cell: (model) => formatUsd(model.listCostUsd, true),
    },
    {
      key: "share",
      header: "Share",
      headerClassName: "min-w-[110px]",
      sortValue: (model) => model.sharePct,
      cell: (model) => (
        <div className="space-y-1">
          <div className="text-xs tabular-nums">{formatPct(model.sharePct)}</div>
          <Progress
            value={Math.min(100, model.sharePct)}
            className="h-1.5"
            indicatorClassName="bg-gradient-to-r from-sky-400 to-violet-500"
            aria-label={`${model.model} share ${formatPct(model.sharePct)}`}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="outline" className="font-normal">
          <Boxes className="h-3 w-3" />
          {data.models.length} model{data.models.length === 1 ? "" : "s"}
        </Badge>
        <span>
          {data.mappedAccounts} mapped account{data.mappedAccounts === 1 ? "" : "s"}
        </span>
        <span>·</span>
        <span className="tabular-nums">{formatNumber(data.totals.requests)} requests</span>
        <span>·</span>
        <span className="tabular-nums">{formatUsd(data.totals.listCostUsd, true)}</span>
      </div>

      <DataTable
        columns={columns}
        rows={data.models}
        rowKey={(model) => `${model.provider}:${model.model}`}
        initialPageSize={10}
        empty="No mapped model usage for this member in this period."
      />

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-xs text-muted-foreground">
        <span>
          Period {data.period.label}
          {data.period.status === "finalized" ? " · finalized" : ""}
        </span>
        <span className="tabular-nums">
          Total {formatNumber(data.totals.requests)} req ·{" "}
          {formatUsd(data.totals.listCostUsd, true)}
        </span>
      </div>
    </div>
  );
}

export function MemberModelUsageDialog({
  open,
  onOpenChange,
  groupId,
  userId,
  name,
  periodId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  userId: string;
  name: string;
  periodId?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Boxes className="h-5 w-5 text-primary" />
            Model usage · {name}
          </DialogTitle>
          <DialogDescription>
            Requests, tokens, list cost, and share per model for this member.
          </DialogDescription>
        </DialogHeader>
        <MemberModelUsage groupId={groupId} userId={userId} periodId={periodId} />
      </DialogContent>
    </Dialog>
  );
}
