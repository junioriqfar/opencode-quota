import { CalendarClock, CalendarRange, CircleAlert, CircleCheck, Timer, TrendingUp, TriangleAlert } from "lucide-react";
import type { GroupSummary, QuotaMeter } from "@shared/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatDateTime, formatPct, formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";

function tone(percent: number) {
  if (percent >= 85) {
    return {
      label: "Critical",
      badge: "destructive" as const,
      bar: "bg-gradient-to-r from-rose-500 to-red-500",
      text: "text-rose-600 dark:text-rose-400",
    };
  }
  if (percent >= 60) {
    return {
      label: "Watch",
      badge: "warning" as const,
      bar: "bg-gradient-to-r from-amber-400 to-orange-500",
      text: "text-amber-600 dark:text-amber-400",
    };
  }
  return {
    label: "Healthy",
    badge: "success" as const,
    bar: "bg-gradient-to-r from-emerald-400 to-teal-500",
    text: "text-emerald-600 dark:text-emerald-400",
  };
}

function MeterCard({
  label,
  hint,
  meter,
  icon: Icon,
}: {
  label: string;
  hint: string;
  meter: QuotaMeter;
  icon: typeof Timer;
}) {
  const colors = tone(meter.percent);
  const StatusIcon =
    meter.percent >= 85 ? CircleAlert : meter.percent >= 60 ? TriangleAlert : CircleCheck;
  return (
    <Card className="relative overflow-hidden">
      <div className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-gradient-to-br from-primary/10 to-transparent blur-2xl" />
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Icon className="h-[18px] w-[18px]" />
            </span>
            <div>
              <div className="text-sm font-medium">{label}</div>
              <div className="text-[11px] text-muted-foreground">{hint}</div>
            </div>
          </div>
          <Badge variant={colors.badge}>
            <StatusIcon className="h-3 w-3" />
            {colors.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-end justify-between gap-2">
          <div className={cn("text-2xl font-semibold tabular-nums tracking-tight", colors.text)}>
            {formatPct(meter.percent)}
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <div className="font-medium text-foreground">{formatUsd(meter.usedUsd, true)}</div>
            <div>of {formatUsd(meter.limitUsd, true)}</div>
          </div>
        </div>
        <Progress
          value={Math.min(100, meter.percent)}
          indicatorClassName={colors.bar}
          className="h-2.5"
          aria-label={`${label} quota ${formatPct(meter.percent)}`}
        />
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <CalendarClock className="h-3.5 w-3.5" />
          <span>Resets {formatDateTime(meter.resetsAt)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

export function QuotaCards({ summary }: { summary: GroupSummary }) {
  return (
    <section className="grid gap-3 md:grid-cols-3">
      <MeterCard label="Monthly" hint="Main period limit" meter={summary.quota.month} icon={CalendarRange} />
      <MeterCard label="Weekly" hint="7-day sub-limit" meter={summary.quota.week} icon={TrendingUp} />
      <MeterCard label="5 hours" hint="Rolling window" meter={summary.quota.fiveHour} icon={Timer} />
      <div className="hidden text-[11px] text-muted-foreground lg:col-span-3 lg:block">
        Per-member quota is a proportional estimate of the official monthly meter.
      </div>
    </section>
  );
}
