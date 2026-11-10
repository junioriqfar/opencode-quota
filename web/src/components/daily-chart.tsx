import { BarChart3, CalendarDays } from "lucide-react";
import type { HistoryResponse } from "@shared/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDay, formatDayLong, formatUsd } from "@/lib/format";
import { colorForId } from "@/lib/chart-colors";
import { cn } from "@/lib/utils";

function axisLabel(value: number): string {
  if (value >= 100) return `$${value.toFixed(0)}`;
  if (value >= 10) return `$${value.toFixed(1)}`;
  return `$${value.toFixed(2)}`;
}

export function DailyChart({ history, className }: { history: HistoryResponse; className?: string }) {
  const colors = new Map(
    history.members.map((member) => [member.userId, colorForId(member.userId)]),
  );
  const max = Math.max(...history.days.map((day) => day.totalUsd), 0.01);
  const ticks = [1, 0.75, 0.5, 0.25, 0];
  const labelEvery = Math.max(1, Math.ceil(history.days.length / 6));

  return (
    <Card className={cn(className)}>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-2">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            Daily usage
          </CardTitle>
          <CardDescription>List cost per day, stacked by member</CardDescription>
        </div>
        <Badge variant="outline" className="shrink-0 font-normal tabular-nums">
          <CalendarDays className="h-3 w-3" />
          {formatUsd(history.days.reduce((sum, day) => sum + day.totalUsd, 0), true)}
        </Badge>
      </CardHeader>
      <CardContent>
        {history.days.length === 0 ? (
          <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
            No daily data yet.
          </div>
        ) : (
          <>
            <div className="relative mt-2 h-[236px] pl-11">
              <div className="pointer-events-none absolute inset-y-0 left-11 right-0">
                {ticks.map((tick) => (
                  <div key={tick} className="absolute left-0 right-0 border-t border-border/60" style={{ bottom: `${tick * 100}%` }} />
                ))}
              </div>
              <div className="pointer-events-none absolute inset-y-0 left-0 w-9">
                {ticks.map((tick) => (
                  <div key={tick} className="absolute right-1 -translate-y-1/2 text-[10px] tabular-nums text-muted-foreground" style={{ bottom: `${tick * 100}%` }}>
                    {axisLabel(max * tick)}
                  </div>
                ))}
              </div>
              <div className="absolute inset-y-0 left-11 right-0 flex items-end gap-[3px]">
                {history.days.map((day) => {
                  const height = Math.max(0, (day.totalUsd / max) * 100);
                  const sorted = [...day.members].sort((a, b) => b.costUsd - a.costUsd);
                  return (
                    <div key={day.day} className="group relative flex h-full min-w-0 flex-1 items-end">
                      <div
                        className="relative w-full overflow-hidden rounded-t-[3px] bg-muted/40 transition-opacity group-hover:opacity-90"
                        style={{ height: `${height}%` }}
                        title={`${formatDayLong(day.day)} · ${formatUsd(day.totalUsd, true)}`}
                      >
                        <div className="flex h-full w-full flex-col-reverse">
                          {sorted.map((member) => {
                            const share = day.totalUsd > 0 ? member.costUsd / day.totalUsd : 0;
                            return (
                              <div
                                key={member.userId}
                                style={{ height: `${share * 100}%`, backgroundColor: colors.get(member.userId) }}
                                className="w-full"
                              />
                            );
                          })}
                        </div>
                      </div>
                      <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-max max-w-[220px] -translate-x-1/2 rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg group-hover:block">
                        <div className="font-medium">{formatDayLong(day.day)}</div>
                        <div className="mt-1 space-y-1">
                          {sorted.map((member) => (
                            <div key={member.userId} className="flex items-center justify-between gap-3">
                              <span className="flex items-center gap-1.5 text-muted-foreground">
                                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colors.get(member.userId) }} />
                                <span className="max-w-[120px] truncate">{member.name}</span>
                              </span>
                              <span className="tabular-nums">{formatUsd(member.costUsd, true)}</span>
                            </div>
                          ))}
                        </div>
                        <div className="mt-1.5 flex justify-between border-t pt-1 font-medium">
                          <span>Total</span>
                          <span className="tabular-nums">{formatUsd(day.totalUsd, true)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="ml-11 mt-2 flex justify-between gap-1 text-[10px] text-muted-foreground">
              {history.days.map((day, index) => {
                const show = index === 0 || index === history.days.length - 1 || index % labelEvery === 0;
                return (
                  <span key={day.day} className="min-w-0 flex-1 overflow-hidden text-center">
                    {show ? formatDay(day.day) : ""}
                  </span>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs">
              {history.members.map((member) => (
                <span key={member.userId} className="inline-flex min-w-0 max-w-[180px] items-center gap-1.5">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colors.get(member.userId) }} />
                  <span className="truncate">{member.name}</span>
                </span>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
