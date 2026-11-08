import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  CalendarRange,
  Crown,
  Gauge,
  LayoutGrid,
  Lock,
  Pencil,
  Plug,
  PlugZap,
  Plus,
  PlusCircle,
  RefreshCw,
  UserRound,
  Users,
} from "lucide-react";
import type { GroupListItem } from "@shared/types";
import { AppShell } from "@/components/app-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/hooks/use-api";
import { post } from "@/lib/api";
import { formatPct, relativeTime } from "@/lib/format";

export function GroupsPage() {
  const groups = useApi<{ groups: GroupListItem[] }>("/api/groups");
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const createGroup = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setCreating(true);
    try {
      const result = await post<{ group: { id: string } }>("/api/groups", { name });
      setName("");
      groups.refresh();
      window.dispatchEvent(new Event("groups:changed"));
      if (result.group?.id) navigate(`/app/g/${result.group.id}/admin?tab=connection`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the group.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <AppShell>
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <LayoutGrid className="h-6 w-6 text-primary" />
            Your groups
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Each group is private. Members can see every member and usage inside that group.
          </p>
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <section className="space-y-3">
          {groups.loading ? (
            <>
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </>
          ) : groups.data?.groups.length ? (
            groups.data.groups.map((group) => (
              <Link
                key={group.id}
                to={
                  group.role === "owner" && !group.consoleStatus
                    ? `/app/g/${group.id}/admin?tab=connection`
                    : `/app/g/${group.id}`
                }
                className="block"
              >
                <Card className="transition-colors hover:border-primary/30 hover:bg-muted/20">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/15 to-sky-500/10 text-emerald-600 dark:text-emerald-400">
                          <Activity className="h-5 w-5" />
                        </div>
                        <div>
                          <CardTitle>{group.name}</CardTitle>
                          <CardDescription>
                            Owner {group.ownerName} · {group.memberCount} member{group.memberCount === 1 ? "" : "s"}
                          </CardDescription>
                        </div>
                      </div>
                      <ArrowRight className="mt-1 h-4 w-4 text-muted-foreground" />
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant={group.role === "owner" ? "default" : "outline"} className="font-normal">
                      {group.role === "owner" ? <Crown className="h-3 w-3" /> : <UserRound className="h-3 w-3" />}
                      {group.role === "owner" ? "Owner" : "Member"}
                    </Badge>
                    {group.consoleStatus ? (
                      <Badge
                        variant={group.consoleStatus === "valid" ? "success" : "warning"}
                        className="font-normal"
                      >
                        {group.consoleStatus === "valid" ? <PlugZap className="h-3 w-3" /> : <Plug className="h-3 w-3" />}
                        Console {group.consoleStatus === "valid" ? "connected" : group.consoleStatus}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="font-normal">
                        <Plug className="h-3 w-3 text-muted-foreground" />
                        No Console connection
                      </Badge>
                    )}
                    {group.currentPeriod && (
                      <Badge variant="secondary" className="font-normal">
                        <CalendarRange className="h-3 w-3" />
                        {group.currentPeriod.label}
                      </Badge>
                    )}
                    {group.periodStatus === "finalized" && (
                      <Badge variant="success" className="font-normal">
                        <Lock className="h-3 w-3" />
                        Finalized
                      </Badge>
                    )}
                    {group.periodStatus === "draft" && (
                      <Badge variant="secondary" className="font-normal">
                        <Pencil className="h-3 w-3" />
                        Draft
                      </Badge>
                    )}
                    {group.monthlyPercent !== null && (
                      <Badge variant="info" className="font-normal">
                        <Gauge className="h-3 w-3" />
                        Monthly {formatPct(group.monthlyPercent)}
                      </Badge>
                    )}
                    <span className="ml-auto inline-flex items-center gap-1 text-muted-foreground">
                      <RefreshCw className="h-3 w-3" />
                      Sync {relativeTime(group.lastSyncAt)}
                    </span>
                  </CardContent>
                </Card>
              </Link>
            ))
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Users className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="font-medium">No groups yet</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Create your first group, connect an OpenCode read-only key, and invite members.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </section>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PlusCircle className="h-4 w-4 text-muted-foreground" />
              Create a group
            </CardTitle>
            <CardDescription>
              A group maps to one OpenCode Console workspace. The super-admin controls the group limit.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={createGroup}>
              <div className="space-y-1.5">
                <Label htmlFor="group-name">Group name</Label>
                <Input
                  id="group-name"
                  placeholder="Opencode Go"
                  required
                  minLength={2}
                  maxLength={80}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <Button className="w-full" type="submit" disabled={creating || !name.trim()}>
                <Plus />
                Create group
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
