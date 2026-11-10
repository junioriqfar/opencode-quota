import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  CalendarRange,
  Crown,
  Gauge,
  LayoutGrid,
  Loader2,
  Lock,
  MailPlus,
  Pencil,
  Plug,
  PlugZap,
  Plus,
  PlusCircle,
  RefreshCw,
  UserPlus,
  UserRound,
  Users,
} from "lucide-react";
import type { GroupListItem, PendingInvite } from "@shared/types";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/hooks/use-api";
import { usePageMeta } from "@/hooks/use-page-meta";
import { post } from "@/lib/api";
import { notifyError, notifySuccess } from "@/lib/notify";
import { formatPct, formatDateTime, relativeTime } from "@/lib/format";

export function GroupsPage() {
  const groups = useApi<{ groups: GroupListItem[] }>("/api/groups");
  const pending = useApi<{ invites: PendingInvite[] }>("/api/invites");
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  usePageMeta({ title: "Your groups" });

  const acceptInvite = async (invite: PendingInvite) => {
    setError(null);
    setAcceptingId(invite.id);
    try {
      const result = await post<{ group: { id: string; name: string } }>("/api/invites/accept", {
        inviteId: invite.id,
      });
      pending.refresh();
      groups.refresh();
      window.dispatchEvent(new Event("groups:changed"));
      notifySuccess(`Joined ${result.group.name}.`);
      navigate(`/app/g/${result.group.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not accept the invitation.");
      notifyError(err, "Could not accept the invitation.");
    } finally {
      setAcceptingId(null);
    }
  };

  const createGroup = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setCreating(true);
    try {
      const result = await post<{ group: { id: string } }>("/api/groups", { name });
      setName("");
      groups.refresh();
      window.dispatchEvent(new Event("groups:changed"));
      notifySuccess("Group created. Connect your read-only key next.");
      if (result.group?.id) navigate(`/app/g/${result.group.id}/admin?tab=connection`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the group.");
      notifyError(err, "Could not create the group.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <AppShell>
      <PageHeader
        icon={<LayoutGrid className="h-6 w-6 text-primary" />}
        title="Your groups"
        description="Each group is private. Members can see every member and usage inside that group."
        meta={
          <>
            {groups.data ? (
              <Badge variant="outline" className="font-normal">
                <Users className="h-3 w-3" />
                {groups.data.groups.length} group{groups.data.groups.length === 1 ? "" : "s"}
              </Badge>
            ) : null}
            {pending.data?.invites.length ? (
              <Badge variant="default" className="font-normal">
                <MailPlus className="h-3 w-3" />
                {pending.data.invites.length} pending invitation
                {pending.data.invites.length === 1 ? "" : "s"}
              </Badge>
            ) : null}
          </>
        }
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => document.getElementById("group-name")?.focus()}
          >
            <Plus />
            New group
          </Button>
        }
      />

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
        <section className="space-y-3">
          {pending.data?.invites.length ? (
            <Card className="border-primary/40 bg-primary/5">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <MailPlus className="h-4 w-4 text-primary" />
                  Pending invitations
                </CardTitle>
                <CardDescription>
                  These invitations were sent to your email. Accept one to join its group.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {pending.data.invites.map((invite) => (
                  <div
                    key={invite.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background/70 p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{invite.groupName}</p>
                      <p className="text-xs text-muted-foreground">
                        Invited by {invite.invitedBy} as a {invite.role} · expires{" "}
                        {formatDateTime(invite.expiresAt)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => acceptInvite(invite)}
                      disabled={acceptingId === invite.id}
                    >
                      {acceptingId === invite.id ? <Loader2 className="animate-spin" /> : <UserPlus />}
                      Accept
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
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
                className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <Card className="transition-colors hover:border-primary/30 hover:bg-muted/20">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/15 to-sky-500/10 text-emerald-600 dark:text-emerald-400">
                          <Activity className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <CardTitle className="truncate" title={group.name}>{group.name}</CardTitle>
                          <CardDescription className="truncate">
                            Owner {group.ownerName} · {group.memberCount} member{group.memberCount === 1 ? "" : "s"}
                          </CardDescription>
                        </div>
                      </div>
                      <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
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
                      <div className="mt-2 w-full space-y-1">
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Gauge className="h-3 w-3" />
                            Monthly quota
                          </span>
                          <span className="font-medium tabular-nums text-foreground">
                            {formatPct(group.monthlyPercent)}
                          </span>
                        </div>
                        <Progress
                          value={Math.min(100, group.monthlyPercent)}
                          className="h-1.5"
                          indicatorClassName={
                            group.monthlyPercent >= 85
                              ? "bg-gradient-to-r from-rose-500 to-red-500"
                              : group.monthlyPercent >= 60
                                ? "bg-gradient-to-r from-amber-400 to-orange-500"
                                : "bg-gradient-to-r from-emerald-400 to-teal-500"
                          }
                        />
                      </div>
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
                  <Button
                    size="sm"
                    className="mt-3"
                    onClick={() => document.getElementById("group-name")?.focus()}
                  >
                    <Plus />
                    Create your first group
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </section>

        <Card className="h-fit lg:sticky lg:top-20">
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
