import { Link } from "react-router-dom";
import { Banknote, CircleDollarSign, Gauge, Lock, Receipt, Settings2 } from "lucide-react";
import type { GroupSummary } from "@shared/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatIdr, formatUsd } from "@/lib/format";

export function BillCard({ summary }: { summary: GroupSummary }) {
  const totalIdr = summary.bill.totalIdr;
  const isFinalized = summary.period.status === "finalized";
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-muted-foreground" />
            Billing
          </CardTitle>
          <CardDescription>Total IDR is entered manually by the group owner</CardDescription>
        </div>
        <Badge variant="secondary" className="font-normal">
          <Gauge className="h-3 w-3" />
          Go {formatUsd(summary.plan.priceUsd)}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-4 ring-1 ring-primary/10">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-muted-foreground">
            <Banknote className="h-3.5 w-3.5" />
            Total bill for this period
          </div>
          <div className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">
            {totalIdr === null ? <span className="text-xl text-muted-foreground">Not set</span> : formatIdr(totalIdr)}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>Plan reference {formatUsd(summary.bill.usdReferenceTotal)}</span>
            <span className="inline-flex items-center gap-1">
              <CircleDollarSign className="h-3.5 w-3.5" />
              {summary.members.length} members
            </span>
          </div>
        </div>

        {totalIdr === null ? (
          <Alert variant="warning">
            <Settings2 className="h-4 w-4" />
            <AlertTitle>Total IDR not set</AlertTitle>
            <AlertDescription>
              The group owner must set the actual bill in the group admin page before finalizing.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            The bill is split proportionally by list cost. IDR amounts use the largest-remainder method so the total matches exactly.
          </div>
        )}

        {isFinalized && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
            <Lock className="h-3.5 w-3.5" />
            Finalized by {summary.finalize.finalizedBy ?? "owner"}. Amounts are locked.
          </div>
        )}

        {summary.group.isOwner && (
          <Button asChild variant="outline" className="w-full">
            <Link to={`/app/g/${summary.group.id}/admin?tab=billing`}>
              <Settings2 />
              Manage billing
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
