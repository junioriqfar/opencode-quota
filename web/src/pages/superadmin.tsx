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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApi } from "@/hooks/use-api";
import { post, put } from "@/lib/api";
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save settings.");
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the group.");
    }
  };

  const syncGroup = async (group: SuperadminGroup) => {
    setError(null);
    try {
      await post(`/api/admin/groups/${group.id}/sync`);
      groups.refresh();
      health.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not trigger sync.");
    }
  };

  return (
    <AppShell>
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-semibold tracking-tight">Super-admin</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage tenants, signup policy, group limits, and sync health. Console keys stay encrypted and invisible.
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="font-normal">
            <Users className="mr-1 h-3.5 w-3.5" />
            {health.data?.users ?? "—"} users
          </Badge>
          <Badge variant="outline" className="font-normal">
            <FolderKanban className="mr-1 h-3.5 w-3.5" />
            {health.data?.groups ?? "—"} groups
          </Badge>
        </div>
      </div>

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
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Group</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Console</TableHead>
                    <TableHead>Last sync</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(groups.data?.groups ?? []).map((group) => (
                    <TableRow key={group.id}>
                      <TableCell>
                        <div className="font-medium">{group.name}</div>
                        <div className="text-[11px] text-muted-foreground">{group.memberCount} members</div>
                      </TableCell>
                      <TableCell>
                        <div>{group.ownerName}</div>
                        <div className="text-[11px] text-muted-foreground">{group.ownerEmail}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={group.status === "active" ? "success" : "secondary"} className="font-normal">
                          {group.status === "active" ? <CheckCircle2 className="h-3 w-3" /> : <PauseCircle className="h-3 w-3" />}
                          {group.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
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
                      </TableCell>
                      <TableCell className="text-muted-foreground">{relativeTime(group.lastSyncAt)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" title="Sync now" onClick={() => syncGroup(group)}>
                            <RefreshCw />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => toggleGroup(group)}>
                            {group.status === "active" ? <PauseCircle /> : <PlayCircle />}
                            {group.status === "active" ? "Disable" : "Enable"}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
