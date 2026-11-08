import { Boxes, Loader2 } from "lucide-react";
import type { MemberUsageDetail } from "@shared/types";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[150px]">Model</TableHead>
            <TableHead>Provider</TableHead>
            <TableHead className="text-right">Requests</TableHead>
            <TableHead className="text-right">Tokens in / out</TableHead>
            <TableHead className="text-right">Cache read / write</TableHead>
            <TableHead className="text-right">List cost</TableHead>
            <TableHead className="min-w-[90px]">Share</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.models.map((model) => (
            <TableRow key={`${model.provider}:${model.model}`}>
              <TableCell className="font-mono text-xs font-medium">{model.model}</TableCell>
              <TableCell>
                <Badge variant="secondary" className="font-normal">
                  {model.provider}
                </Badge>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatNumber(model.requests)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                <div
                  className="text-xs"
                  title={`Input ${formatNumber(model.inputTokens)} · Output ${formatNumber(model.outputTokens)}`}
                >
                  <div>{formatCompact(model.inputTokens)}</div>
                  <div className="text-muted-foreground">{formatCompact(model.outputTokens)}</div>
                </div>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                <div
                  className="text-xs"
                  title={`Cache read ${formatNumber(model.cacheReadTokens)} · Cache write ${formatNumber(model.cacheWriteTokens)}`}
                >
                  <div>{formatCompact(model.cacheReadTokens)}</div>
                  <div className="text-muted-foreground">{formatCompact(model.cacheWriteTokens)}</div>
                </div>
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {formatUsd(model.listCostUsd, true)}
              </TableCell>
              <TableCell>
                <div className="space-y-1">
                  <div className="text-xs tabular-nums">{formatPct(model.sharePct)}</div>
                  <Progress
                    value={Math.min(100, model.sharePct)}
                    className="h-1.5"
                    indicatorClassName="bg-gradient-to-r from-sky-400 to-violet-500"
                  />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

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
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
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
