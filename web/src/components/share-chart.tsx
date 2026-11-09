import { PieChart, Users } from "lucide-react";
import type { GroupSummary } from "@shared/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPct, formatUsdShare } from "@/lib/format";
import { colorForId } from "@/lib/chart-colors";
import { cn } from "@/lib/utils";

export function ShareChart({ summary, className }: { summary: GroupSummary; className?: string }) {
  const data = summary.members
    .filter((member) => member.listCostUsd > 0)
    .map((member) => ({
      userId: member.userId,
      name: member.name,
      value: member.listCostUsd,
      share: member.sharePct,
      color: colorForId(member.userId),
    }));
  const total = data.reduce((sum, entry) => sum + entry.value, 0);
  let cursor = 0;
  const stops = data
    .map((entry) => {
      const start = total > 0 ? (cursor / total) * 100 : 0;
      cursor += entry.value;
      const end = total > 0 ? (cursor / total) * 100 : 0;
      return `${entry.color} ${start.toFixed(3)}% ${end.toFixed(3)}%`;
    })
    .join(", ");

  return (
    <Card className={cn(className)}>
      <CardHeader className="flex-row items-start justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="flex items-center gap-2">
            <PieChart className="h-4 w-4 text-muted-foreground" />
            Usage share
          </CardTitle>
          <CardDescription>List cost proportion for this period</CardDescription>
        </div>
        <Badge variant="outline" className="font-normal">
          <Users className="h-3 w-3" />
          {data.length} {data.length === 1 ? "member" : "members"}
        </Badge>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="flex h-[210px] items-center justify-center text-sm text-muted-foreground">
            No usage yet.
          </div>
        ) : (
          <>
            <div className="relative mx-auto mt-1 h-[188px] w-[188px]">
              <div
                className="absolute inset-0 rounded-full shadow-inner ring-1 ring-border/60"
                style={{ background: `conic-gradient(${stops})` }}
                role="img"
                aria-label="Usage share by member"
              />
              <div className="absolute inset-[27%] rounded-full bg-card shadow-[inset_0_1px_6px_rgba(0,0,0,0.06)]" />
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Total</div>
                <div className="text-lg font-semibold tabular-nums">{formatUsdShare(summary.total.listCostUsd)}</div>
                <div className="text-[10px] text-muted-foreground">list cost</div>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {data.map((entry) => (
                <div key={entry.userId} className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
                    <span className="truncate">{entry.name}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 tabular-nums">
                    <span className="text-muted-foreground">{formatUsdShare(entry.value)}</span>
                    <span className="w-14 text-right font-medium">{formatPct(entry.share)}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
