import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  FolderKanban,
  HeartPulse,
  Loader2,
  PauseCircle,
  PlayCircle,
  Plug,
  PlugZap,
  RefreshCw,
  Save,
  Settings2,
  Shield,
  Users,
  XCircle,
} from "lucide-react";
import type { AppSettings, SuperadminGroup } from "@shared/types";
import { AppShell } from "@/components/app-shell";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/hooks/use-api";
import { usePageMeta } from "@/hooks/use-page-meta";
import { post, put } from "@/lib/api";
import { notifyError, notifySuccess } from "@/lib/notify";
import { formatDateTime, relativeTime } from "@/lib/format";

interface Health {
  users: number;
  groups: number;
  connections: number;
  recentSyncs: Array<{ groupId: string; status: string; error: string | null; startedAt: string }>;
}

export function SuperadminPage() {
  const groups = useApi<{ groups: SuperadminGroup[] }>("/api/admin/groups");
  const settings = useApi<{ settings: AppSettings }>("/api/admin/settings");
  const health = useApi<Health>("/api/admin/health");
  const [maxGroups, setMaxGroups] = useState("3");
  const [signupOpen, setSignupOpen] = useState("true");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  usePageMeta({ title: "Super-admin" });

  useEffect(() => {
    if (!settings.data) return;
    setMaxGroups(String(settings.data.settings.maxGroupsPerUser));
    setSignupOpen(settings.data.settings.signupOpen ? "true" : "false");
  }, [settings.data]);

  const saveSettings = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setSaving(true);
    try {
      await put("/api/admin/settings", {
        maxGroupsPerUser: Number.parseInt(maxGroups, 10),
        signupOpen: signupOpen === "true",
      });
      settings.refresh();
      setMessage("Settings saved.");
      notifySuccess("Settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save settings.");
      notifyError(err, "Could not save settings.");
    } finally {
      setSaving(false);
    }
  };

  const toggleGroup = async (group: SuperadminGroup) => {
    setError(null);
    try {
      const action = group.status === "active" ? "disable" : "enable";
      await post(`/api/admin/groups/${group.id}/${action}`);
      groups.refresh();
      notifySuccess(action === "disable" ? "Group disabled." : "Group enabled.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the group.");
      notifyError(err, "Could not update the group.");
    }
  };

  const syncGroup = async (group: SuperadminGroup) => {
    setError(null);
    try {
      await post(`/api/admin/groups/${group.id}/sync`);
      groups.refresh();
      health.refresh();
      notifySuccess("Sync triggered.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not trigger sync.");
      notifyError(err, "Could not trigger sync.");
    }
  };

  const tenantColumns: DataTableColumn<SuperadminGroup>[] = [
    {
      key: "group",
      header: "Group",
      sortValue: (group) => group.name,
      cell: (group) => (
        <div>
          <div className="font-medium">{group.name}</div>
          <div className="text-[11px] text-muted-foreground">{group.memberCount} members</div>
        </div>
      ),
    },
    {
      key: "owner",
      header: "Owner",
      headerClassName: "hidden lg:table-cell",
      className: "hidden lg:table-cell",
      sortValue: (group) => group.ownerName,
      cell: (group) => (
        <div>
          <div>{group.ownerName}</div>
          <div className="text-[11px] text-muted-foreground">{group.ownerEmail}</div>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortValue: (group) => group.status,
      cell: (group) => (
        <Badge variant={group.status === "active" ? "success" : "secondary"} className="font-normal">
          {group.status === "active" ? <CheckCircle2 className="h-3 w-3" /> : <PauseCircle className="h-3 w-3" />}
          {group.status}
        </Badge>
      ),
    },
    {
      key: "console",
      header: "Console",
      headerClassName: "hidden lg:table-cell",
      className: "hidden lg:table-cell",
      sortValue: (group) => group.consoleStatus ?? "",
      cell: (group) => (
        <div className="flex flex-col gap-1">
          <Badge variant={group.consoleStatus === "valid" ? "success" : group.consoleStatus === "needs_reauth" ? "destructive" : "warning"} className="w-fit font-normal">
            {group.consoleStatus === "valid" ? (
              <PlugZap className="h-3 w-3" />
            ) : group.consoleStatus === "needs_reauth" ? (
              <AlertTriangle className="h-3 w-3" />
            ) : (
              <Plug className="h-3 w-3" />
            )}
            {group.consoleStatus ?? "not connected"}
          </Badge>
          {group.lastError && <span className="max-w-[220px] truncate text-[11px] text-destructive">{group.lastError}</span>}
        </div>
      ),
    },
    {
      key: "sync",
      header: "Last sync",
      className: "text-muted-foreground",
      sortValue: (group) => group.lastSyncAt ?? "",
      cell: (group) => relativeTime(group.lastSyncAt),
    },
    {
      key: "actions",
      header: "",
      headerClassName: "text-right",
      className: "text-right",
      cell: (group) => (
        <div className="flex justify-end gap-1">
          <Button size="icon" variant="ghost" title="Sync now" aria-label="Sync now" onClick={() => syncGroup(group)}>
            <RefreshCw />
          </Button>
          <Button size="sm" variant="outline" onClick={() => toggleGroup(group)}>
            {group.status === "active" ? <PauseCircle /> : <PlayCircle />}
            {group.status === "active" ? "Disable" : "Enable"}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <AppShell>
      <PageHeader
        icon={<Shield className="h-6 w-6 text-primary" />}
        title="Super-admin"
        description="Manage tenants, signup policy, group limits, and sync health. Console keys stay encrypted and invisible."
        meta={
          <>
            <Badge variant="outline" className="font-normal">
              <Users className="mr-1 h-3.5 w-3.5" />
              {health.data?.users ?? "—"} users
            </Badge>
            <Badge variant="outline" className="font-normal">
              <FolderKanban className="mr-1 h-3.5 w-3.5" />
              {health.data?.groups ?? "—"} groups
            </Badge>
          </>
        }
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              groups.refresh();
              settings.refresh();
              health.refresh();
              notifySuccess("Super-admin data refreshed.");
            }}
          >
            <RefreshCw />
            Refresh
          </Button>
        }
      />

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {message && (
        <Alert variant="info" className="mb-4">
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              Tenants
            </CardTitle>
            <CardDescription>Disable a group to block access; sync can still be triggered for diagnostics.</CardDescription>
          </CardHeader>
          <CardContent>
            {groups.loading ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <DataTable
                columns={tenantColumns}
                rows={groups.data?.groups ?? []}
                rowKey={(group) => group.id}
                showRowNumber
                initialPageSize={10}
                empty="No tenants yet."
              />
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-muted-foreground" />
                App settings
              </CardTitle>
              <CardDescription>Signup policy and per-user group limit.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={saveSettings}>
                <div className="space-y-1.5">
                  <Label htmlFor="max-groups">Max groups per user</Label>
                  <Input
                    id="max-groups"
                    type="number"
                    min={1}
                    max={100}
                    value={maxGroups}
                    onChange={(event) => setMaxGroups(event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="signup-open">Open signup</Label>
                  <Select value={signupOpen} onValueChange={setSignupOpen}>
                    <SelectTrigger id="signup-open">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Open</SelectItem>
                      <SelectItem value="false">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" disabled={saving}>
                  {saving ? <Loader2 className="animate-spin" /> : <Save />}
                  Save settings
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HeartPulse className="h-4 w-4 text-muted-foreground" />
                Health
              </CardTitle>
              <CardDescription>Recent sync runs and connection count.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Connections</span>
                <span className="font-medium tabular-nums">{health.data?.connections ?? "—"}</span>
              </div>
              <div className="space-y-1">
                {(health.data?.recentSyncs ?? []).slice(0, 5).map((run) => (
                  <div key={`${run.groupId}-${run.startedAt}`} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate text-muted-foreground">{run.groupId.slice(0, 8)}…</span>
                    <Badge variant={run.status === "ok" ? "success" : run.status === "running" ? "info" : "destructive"} className="font-normal">
                      {run.status === "ok" ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : run.status === "running" ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <XCircle className="h-3 w-3" />
                      )}
                      {run.status}
                    </Badge>
                    <span className="w-20 text-right text-muted-foreground">{formatDateTime(run.startedAt)}</span>
                  </div>
                ))}
                {!health.data?.recentSyncs.length && <p className="text-xs text-muted-foreground">No sync runs yet.</p>}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
