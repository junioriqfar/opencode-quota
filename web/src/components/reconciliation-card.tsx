import { ArrowRightLeft, Info, Scale } from "lucide-react";
import type { GroupSummary } from "@shared/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPct, formatUsd } from "@/lib/format";

export function ReconciliationCard({ summary }: { summary: GroupSummary }) {
  const meter = summary.reconciliation.meterUsedUsd;
  const list = summary.reconciliation.exportListCostUsd;
  const max = Math.max(meter, list, 1);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-muted-foreground" />
            Reconciliation
          </CardTitle>
          <CardDescription>Official Go meter vs daily export list cost</CardDescription>
        </div>
        <Badge variant="info" className="shrink-0 gap-1 font-normal">
          <ArrowRightLeft className="h-3 w-3" />
          Info
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              Official Go meter
            </span>
            <span className="font-medium tabular-nums">{formatUsd(meter, true)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500" style={{ width: `${(meter / max) * 100}%` }} />
          </div>
          <div className="text-right text-[11px] text-muted-foreground">
            {formatPct(summary.quota.month.percent)} of monthly limit
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-sky-500" />
              Export list cost
            </span>
            <span className="font-medium tabular-nums">{formatUsd(list, true)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-gradient-to-r from-sky-400 to-blue-500" style={{ width: `${(list / max) * 100}%` }} />
          </div>
          <div className="text-right text-[11px] text-muted-foreground">Billing basis</div>
        </div>
        <div className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>{summary.reconciliation.note}</p>
        </div>
      </CardContent>
    </Card>
  );
}
