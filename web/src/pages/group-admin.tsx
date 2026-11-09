import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  Boxes,
  Check,
  CheckCircle2,
  Clock3,
  Clipboard,
  Crown,
  Eye,
  GitBranch,
  KeyRound,
  Link2,
  Loader2,
  Lock,
  Mail,
  Network,
  PieChart,
  Plug,
  PlugZap,
  Plus,
  Receipt,
  RefreshCw,
  Save,
  ScrollText,
  Settings2,
  Trash2,
  Unplug,
  UserMinus,
  UserPlus,
  UserRound,
  Users,
  XCircle,
} from "lucide-react";
import type {
  AuditLogItem,
  ConsoleStatus,
  GroupSummary,
  InviteItem,
  MemberListItem,
  PeriodInfo,
  ServiceAccountItem,
} from "@shared/types";
import { AppShell } from "@/components/app-shell";
import { MemberModelUsageDialog } from "@/components/member-model-usage";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApi } from "@/hooks/use-api";
import { usePageMeta } from "@/hooks/use-page-meta";
import { del, patch, post, put } from "@/lib/api";
import { notifyError, notifyInfo, notifySuccess } from "@/lib/notify";
import { formatDateTime, formatIdr, formatPct, formatUsd, relativeTime } from "@/lib/format";

interface GroupBase {
  group: {
    id: string;
    name: string;
    role: "owner" | "member";
    ownerName: string;
    memberCount: number;
    isOwner: boolean;
  };
  connection: ConsoleStatus;
  periods: PeriodInfo[];
}

const TABS = ["connection", "members", "mapping", "billing", "audit", "settings"] as const;
type Tab = (typeof TABS)[number];

function copy(text: string): void {
  navigator.clipboard
    .writeText(text)
    .then(() => notifySuccess("Copied to clipboard."))
    .catch(() => notifyError(null, "Could not copy to clipboard."));
}

export function GroupAdminPage() {
  const { groupId = "" } = useParams();
  const [search, setSearch] = useSearchParams();
  const rawTab = search.get("tab") as Tab | null;
  const tab: Tab = rawTab && TABS.includes(rawTab) ? rawTab : "connection";
  const setTab = (value: string) => setSearch({ tab: value });

  const group = useApi<GroupBase>(groupId ? `/api/groups/${groupId}` : null);
  usePageMeta({
    title: group.data?.group.name ? `${group.data.group.name} · Admin` : "Group admin",
    group: group.data?.group
      ? { id: group.data.group.id, name: group.data.group.name, admin: true }
      : null,
  });
  const members = useApi<{ members: MemberListItem[] }>(groupId ? `/api/groups/${groupId}/members` : null);
  const invites = useApi<{ invites: InviteItem[] }>(groupId ? `/api/groups/${groupId}/invites` : null);
  const accounts = useApi<{ accounts: ServiceAccountItem[] }>(groupId ? `/api/groups/${groupId}/service-accounts` : null);
  const periods = useApi<{ periods: PeriodInfo[] }>(groupId ? `/api/groups/${groupId}/periods` : null);
  const audit = useApi<{ logs: AuditLogItem[] }>(groupId ? `/api/groups/${groupId}/audit` : null);

  const [selectedPeriod, setSelectedPeriod] = useState<string>("");
  useEffect(() => {
    if (selectedPeriod) return;
    const list = periods.data?.periods ?? [];
    const first = list.find((period) => period.status === "draft") ?? list[0];
    if (first) setSelectedPeriod(first.id);
  }, [periods.data, selectedPeriod]);

  const summary = useApi<GroupSummary>(
    groupId && selectedPeriod
      ? `/api/groups/${groupId}/summary?periodId=${encodeURIComponent(selectedPeriod)}`
      : null,
  );

  if (group.loading && !group.data) {
    return (
      <AppShell groupId={groupId}>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="mt-4 h-72 w-full" />
      </AppShell>
    );
  }

  if (group.error || !group.data) {
    return (
      <AppShell groupId={groupId}>
        <Alert variant="destructive">
          <AlertTitle>Could not load this group</AlertTitle>
          <AlertDescription>{group.error?.message ?? "Group not found."}</AlertDescription>
        </Alert>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/app">
            <ArrowLeft />
            Back to groups
          </Link>
        </Button>
      </AppShell>
    );
  }

  if (!group.data.group.isOwner) {
    return (
      <AppShell groupId={groupId}>
        <Alert variant="destructive">
          <AlertTitle>Owner access required</AlertTitle>
          <AlertDescription>Only the group owner can manage connection, members, mapping, and billing.</AlertDescription>
        </Alert>
        <Button asChild variant="outline" className="mt-4">
          <Link to={`/app/g/${groupId}`}>
            <ArrowLeft />
            Back to dashboard
          </Link>
        </Button>
      </AppShell>
    );
  }

  const connection = group.data.connection;

  return (
    <AppShell groupId={groupId}>
      <PageHeader
        backTo={connection.connected ? `/app/g/${groupId}` : "/app"}
        backLabel={connection.connected ? "Back to dashboard" : "Back to groups"}
        title={`Manage ${group.data.group.name}`}
        description="Owner-only controls. Changes are recorded in the audit log."
        meta={
          <Badge variant={connection.connected ? "success" : "warning"} className="font-normal">
            {connection.connected ? <CheckCircle2 className="h-3 w-3" /> : <Plug className="h-3 w-3" />}
            Console {connection.connected ? connection.status : "not connected"}
          </Badge>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4 !h-auto w-full grid grid-cols-3 gap-1 sm:flex sm:flex-wrap sm:justify-start">
          <TabsTrigger value="connection" className="h-10 gap-1.5 sm:h-9">
            <PlugZap className="h-4 w-4" />
            Connection
          </TabsTrigger>
          <TabsTrigger value="members" className="h-10 gap-1.5 sm:h-9">
            <Users className="h-4 w-4" />
            Members
          </TabsTrigger>
          <TabsTrigger value="mapping" className="h-10 gap-1.5 sm:h-9">
            <GitBranch className="h-4 w-4" />
            Mapping
          </TabsTrigger>
          <TabsTrigger value="billing" className="h-10 gap-1.5 sm:h-9">
            <Receipt className="h-4 w-4" />
            Billing
          </TabsTrigger>
          <TabsTrigger value="audit" className="h-10 gap-1.5 sm:h-9">
            <ScrollText className="h-4 w-4" />
            Audit
          </TabsTrigger>
          <TabsTrigger value="settings" className="h-10 gap-1.5 sm:h-9">
            <Settings2 className="h-4 w-4" />
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="connection">
          <ConnectionTab
            groupId={groupId}
            connection={connection}
            onChanged={() => {
              group.refresh();
              periods.refresh();
              summary.refresh();
            }}
          />
        </TabsContent>

        <TabsContent value="members">
          <MembersTab
            groupId={groupId}
            periodId={selectedPeriod}
            members={members}
            invites={invites}
            onChanged={() => {
              members.refresh();
              invites.refresh();
              group.refresh();
            }}
          />
        </TabsContent>

        <TabsContent value="mapping">
          <MappingTab
            groupId={groupId}
            accounts={accounts}
            members={members}
            onChanged={() => {
              accounts.refresh();
              summary.refresh();
            }}
          />
        </TabsContent>

        <TabsContent value="billing">
          <BillingTab
            groupId={groupId}
            periods={periods.data?.periods ?? []}
            selectedPeriod={selectedPeriod}
            onSelectPeriod={setSelectedPeriod}
            summary={summary}
            onChanged={() => {
              summary.refresh();
              periods.refresh();
              group.refresh();
              accounts.refresh();
            }}
          />
        </TabsContent>

        <TabsContent value="audit">
          <AuditTab audit={audit} />
        </TabsContent>

        <TabsContent value="settings">
          <SettingsTab
            groupId={groupId}
            name={group.data.group.name}
            onChanged={() => {
              group.refresh();
              members.refresh();
              window.dispatchEvent(new Event("groups:changed"));
            }}
          />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

function ConnectionTab({
  groupId,
  connection,
  onChanged,
}: {
  groupId: string;
  connection: ConsoleStatus;
  onChanged: () => void;
}) {
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const saveKey = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setSaving(true);
    try {
      await put(`/api/groups/${groupId}/console`, { key });
      setKey("");
      setMessage("Console key verified and saved. An initial sync has started.");
      notifySuccess("Console key verified and saved.");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect the key.");
      notifyError(err, "Could not connect the key.");
    } finally {
      setSaving(false);
    }
  };

  const sync = async () => {
    setError(null);
    setMessage(null);
    setSyncing(true);
    try {
      const result = await post<{ rows: number }>(`/api/groups/${groupId}/sync`);
      setMessage(`Sync finished: ${result.rows} usage rows processed.`);
      notifySuccess(`Sync finished: ${result.rows} usage rows processed.`);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed.");
      notifyError(err, "Sync failed.");
    } finally {
      setSyncing(false);
    }
  };

  const disconnect = async () => {
    if (!window.confirm("Disconnect the Console key? Sync will stop until a new key is connected.")) return;
    setError(null);
    setMessage(null);
    try {
      await del(`/api/groups/${groupId}/console`);
      setMessage("Console connection removed.");
      notifySuccess("Console connection removed.");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not disconnect.");
      notifyError(err, "Could not disconnect.");
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {!connection.connected && (
        <Alert variant="info" className="lg:col-span-2">
          <KeyRound className="h-4 w-4" />
          <AlertTitle>Next step: connect your OpenCode read-only key</AlertTitle>
          <AlertDescription>
            <ol className="list-decimal space-y-1 pl-4">
              <li>Create a dedicated read-only service account key in OpenCode Console.</li>
              <li>Paste the key in the form on the right.</li>
              <li>Verify and connect; the first sync starts automatically.</li>
            </ol>
          </AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PlugZap className="h-4 w-4 text-muted-foreground" />
            OpenCode Console connection
          </CardTitle>
          <CardDescription>
            Use a dedicated service account key with read-only permission. The key is encrypted at rest and never returned.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {message && (
            <Alert variant="info">
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2 rounded-lg border p-3 text-sm">
            <Row label="Status" value={connection.connected ? connection.status : "not connected"} />
            <Row label="Key" value={connection.keyHint ?? "—"} />
            <Row label="Plan" value={connection.plan ?? "—"} />
            <Row label="Workspace" value={connection.orgId ?? "—"} />
            <Row label="Last verified" value={formatDateTime(connection.lastVerifiedAt)} />
            <Row label="Last sync" value={connection.lastSyncAt ? `${relativeTime(connection.lastSyncAt)} (${formatDateTime(connection.lastSyncAt)})` : "never"} />
            {connection.lastError && <Row label="Last error" value={connection.lastError} danger />}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={sync} disabled={!connection.connected || syncing} variant="outline">
              {syncing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Sync now
            </Button>
            {connection.connected && (
              <Button onClick={disconnect} variant="destructive" size="sm">
                <Unplug />
                Disconnect
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-muted-foreground" />
            {connection.connected ? "Rotate read-only key" : "Connect read-only key"}
          </CardTitle>
          <CardDescription>
            Create a service account in OpenCode Console, add a key with read permission, and paste it here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={saveKey}>
            <div className="space-y-1.5">
              <Label htmlFor="console-key">Read-only service account key</Label>
              <PasswordInput
                id="console-key"
                autoComplete="off"
                placeholder="oc_sk_..."
                required
                minLength={20}
                value={key}
                onChange={(event) => setKey(event.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                The key must belong to a service account with <strong>read</strong> permission, not All and not a personal key.
              </p>
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : <Save />}
              {connection.connected ? "Verify and rotate" : "Verify and connect"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={danger ? "max-w-[60%] break-all text-right text-destructive" : "max-w-[60%] break-all text-right"}>
        {value}
      </span>
    </div>
  );
}

function SettingsTab({
  groupId,
  name,
  onChanged,
}: {
  groupId: string;
  name: string;
  onChanged: () => void;
}) {
  const navigate = useNavigate();
  const [groupName, setGroupName] = useState(name);
  const [confirmName, setConfirmName] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setGroupName(name);
  }, [name]);

  const rename = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    const next = groupName.trim();
    if (next === name) {
      setMessage("The group name is unchanged.");
      notifyInfo("The group name is unchanged.");
      return;
    }
    setSaving(true);
    try {
      await patch(`/api/groups/${groupId}`, { name: next });
      onChanged();
      setMessage("Group renamed.");
      notifySuccess("Group renamed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not rename the group.");
      notifyError(err, "Could not rename the group.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setError(null);
    setMessage(null);
    if (confirmName.trim() !== name) {
      setError(`Type "${name}" exactly to confirm deletion.`);
      return;
    }
    setDeleting(true);
    try {
      await del(`/api/groups/${groupId}`, { confirmName: confirmName.trim() });
      window.dispatchEvent(new Event("groups:changed"));
      notifySuccess("Group deleted permanently.");
      navigate("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the group.");
      notifyError(err, "Could not delete the group.");
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {message && (
        <Alert variant="info">
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-muted-foreground" />
              Group name
            </CardTitle>
            <CardDescription>
              Rename the label shown to every member. This does not change anything in OpenCode Console.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={rename}>
              <div className="space-y-1.5">
                <Label htmlFor="group-settings-name">Name</Label>
                <Input
                  id="group-settings-name"
                  required
                  minLength={2}
                  maxLength={80}
                  value={groupName}
                  onChange={(event) => setGroupName(event.target.value)}
                />
              </div>
              <Button type="submit" disabled={saving || !groupName.trim()}>
                {saving ? <Loader2 className="animate-spin" /> : <Save />}
                Save name
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-4 w-4" />
              Delete group
            </CardTitle>
            <CardDescription>
              Permanently remove this group, its members, invites, Console connection, usage, and billing periods.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">
              This action cannot be undone. You will be asked to confirm with the group name.
            </p>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmName("");
                setError(null);
                setDeleteOpen(true);
              }}
            >
              <Trash2 />
              Delete group permanently
            </Button>
          </CardContent>
        </Card>
      </div>

      <AlertDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (deleting) return;
          setDeleteOpen(open);
          if (!open) setConfirmName("");
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Delete “{name}” permanently?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This removes the group, its members, invites, Console connection, usage data, and billing
              periods. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="group-delete-confirm">
              Type <span className="font-mono">{name}</span> to confirm
            </Label>
            <Input
              id="group-delete-confirm"
              autoComplete="off"
              placeholder={name}
              value={confirmName}
              onChange={(event) => {
                setConfirmName(event.target.value);
                if (error) setError(null);
              }}
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting || confirmName.trim() !== name}
              onClick={(event) => {
                event.preventDefault();
                void remove();
              }}
            >
              {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MembersTab({
  groupId,
  periodId,
  members,
  invites,
  onChanged,
}: {
  groupId: string;
  periodId: string;
  members: ReturnType<typeof useApi<{ members: MemberListItem[] }>>;
  invites: ReturnType<typeof useApi<{ invites: InviteItem[] }>>;
  onChanged: () => void;
}) {
  const [email, setEmail] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newLink, setNewLink] = useState<string | null>(null);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const expandedMember =
    (members.data?.members ?? []).find((member) => member.userId === expandedUserId) ?? null;

  const createInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setNewLink(null);
    setCreating(true);
    try {
      const result = await post<{ invite: InviteItem; link: string; emailSent: boolean }>(
        `/api/groups/${groupId}/invites`,
        { email: email.trim() || null },
      );
      setNewLink(result.link);
      setEmail("");
      invites.refresh();
      notifySuccess(result.emailSent ? "Invitation created and emailed." : "Invitation created.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the invite.");
      notifyError(err, "Could not create the invite.");
    } finally {
      setCreating(false);
    }
  };

  const removeMember = async (userId: string, name: string) => {
    if (!window.confirm(`Remove ${name} from this group? Historical periods keep their mapping.`)) return;
    setError(null);
    try {
      await del(`/api/groups/${groupId}/members/${userId}`);
      members.refresh();
      invites.refresh();
      onChanged();
      notifySuccess("Member removed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove the member.");
      notifyError(err, "Could not remove the member.");
    }
  };

  const revokeInvite = async (inviteId: string) => {
    setError(null);
    try {
      await del(`/api/groups/${groupId}/invites/${inviteId}`);
      invites.refresh();
      notifySuccess("Invitation revoked.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not revoke the invite.");
      notifyError(err, "Could not revoke the invite.");
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              Members
            </CardTitle>
            <CardDescription>All members can see each other and usage in this group.</CardDescription>
          </CardHeader>
          <CardContent>
            {members.loading ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead className="text-right">Mapped</TableHead>
                      <TableHead className="text-right">List cost</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(members.data?.members ?? []).map((member) => (
                      <TableRow key={member.userId}>
                        <TableCell className="font-medium">{member.name}</TableCell>
                        <TableCell className="text-muted-foreground">{member.email ?? "—"}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <Badge variant={member.role === "owner" ? "default" : "outline"} className="font-normal">
                              {member.role === "owner" ? <Crown className="h-3 w-3" /> : <UserRound className="h-3 w-3" />}
                              {member.role === "owner" ? "Owner" : "Member"}
                            </Badge>
                            {member.status === "removed" && (
                              <Badge variant="secondary">
                                <UserMinus className="h-3 w-3" />
                                Removed
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{member.mappedAccounts}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatUsd(member.listCostUsd, true)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              title={
                                expandedUserId === member.userId
                                  ? "Hide model usage"
                                  : "Show model usage"
                              }
                              onClick={() =>
                                setExpandedUserId((current) =>
                                  current === member.userId ? null : member.userId,
                                )
                              }
                            >
                              <Boxes />
                            </Button>
                            {member.role !== "owner" && member.status === "active" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                title="Remove member"
                                onClick={() => removeMember(member.userId, member.name)}
                              >
                                <UserMinus />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {expandedMember && (
                  <MemberModelUsageDialog
                    open={!!expandedMember}
                    onOpenChange={(open) => {
                      if (!open) setExpandedUserId(null);
                    }}
                    groupId={groupId}
                    userId={expandedMember.userId}
                    name={expandedMember.name}
                    periodId={periodId || undefined}
                  />
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-muted-foreground" />
              Invite a member
            </CardTitle>
            <CardDescription>
              Email is optional. If empty, a one-time link is generated that you can send manually.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={createInvite}>
              <div className="space-y-1.5">
                <Label htmlFor="invite-email">Email (optional)</Label>
                <Input id="invite-email" type="email" placeholder="friend@example.com" value={email} onChange={(event) => setEmail(event.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={creating}>
                {creating ? <Loader2 className="animate-spin" /> : <Plus />}
                Create invite
              </Button>
            </form>
            {newLink && (
              <div className="mt-4 space-y-2 rounded-lg border bg-muted/40 p-3">
                <div className="text-xs font-medium">Invite link</div>
                <div className="break-all text-[11px] text-muted-foreground">{newLink}</div>
                <Button size="sm" variant="outline" onClick={() => copy(newLink)}>
                  <Clipboard />
                  Copy link
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            Invitations
          </CardTitle>
          <CardDescription>Pending links can be copied and sent manually. Email is delivered by Resend when configured.</CardDescription>
        </CardHeader>
        <CardContent>
          {(invites.data?.invites ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No invitations yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Link</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(invites.data?.invites ?? []).map((invite) => (
                  <TableRow key={invite.id}>
                    <TableCell>{invite.email ?? "Link invite"}</TableCell>
                    <TableCell>
                      <Badge variant={invite.status === "pending" ? "info" : invite.status === "accepted" ? "success" : "secondary"} className="font-normal">
                        {invite.status === "pending" ? (
                          <Clock3 className="h-3 w-3" />
                        ) : invite.status === "accepted" ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : (
                          <XCircle className="h-3 w-3" />
                        )}
                        {invite.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDateTime(invite.expiresAt)}</TableCell>
                    <TableCell>
                      {invite.link ? (
                        <Button size="sm" variant="ghost" onClick={() => copy(invite.link!)}>
                          <Link2 />
                          Copy
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {invite.status === "pending" && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => revokeInvite(invite.id)}
                          title="Revoke invite"
                        >
                          <Trash2 />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MappingTab({
  groupId,
  accounts,
  members,
  onChanged,
}: {
  groupId: string;
  accounts: ReturnType<typeof useApi<{ accounts: ServiceAccountItem[] }>>;
  members: ReturnType<typeof useApi<{ members: MemberListItem[] }>>;
  onChanged: () => void;
}) {
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const account of accounts.data?.accounts ?? []) {
      next[account.accountId] = account.mappedUserId ?? "";
    }
    setSelection(next);
  }, [accounts.data]);

  const activeMembers = (members.data?.members ?? []).filter((member) => member.status === "active");

  const save = async (accountId: string) => {
    const userId = selection[accountId];
    setError(null);
    setMessage(null);
    if (!userId) {
      setError("Choose a member first.");
      notifyError(null, "Choose a member first.");
      return;
    }
    setSavingId(accountId);
    try {
      await put(`/api/groups/${groupId}/mappings/${accountId}`, { userId });
      setMessage("Mapping saved.");
      notifySuccess("Mapping saved.");
      accounts.refresh();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the mapping.");
      notifyError(err, "Could not save the mapping.");
    } finally {
      setSavingId(null);
    }
  };

  const unmap = async (accountId: string) => {
    setError(null);
    setMessage(null);
    try {
      await del(`/api/groups/${groupId}/mappings/${accountId}`);
      setMessage("Mapping removed.");
      notifySuccess("Mapping removed.");
      accounts.refresh();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove the mapping.");
      notifyError(err, "Could not remove the mapping.");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Network className="h-4 w-4 text-muted-foreground" />
          Service account mapping
        </CardTitle>
        <CardDescription>
          Map each service account to a group member. Unmapped accounts with usage block finalization.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {message && (
          <Alert variant="info">
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}
        {accounts.loading ? (
          <Skeleton className="h-48 w-full" />
        ) : (accounts.data?.accounts ?? []).length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            No service accounts yet. Connect the Console key and run a sync first.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Keys</TableHead>
                <TableHead className="text-right">List cost</TableHead>
                <TableHead>Member</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(accounts.data?.accounts ?? []).map((account) => (
                <TableRow key={account.accountId}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{account.name}</span>
                      {account.isReader && (
                        <Badge variant="secondary">
                          <Eye className="h-3 w-3" />
                          Reader
                        </Badge>
                      )}
                      {!account.isReader && !account.isMapped && account.listCostUsd > 0 && (
                        <Badge variant="warning">
                          <AlertTriangle className="h-3 w-3" />
                          Unmapped
                        </Badge>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground">Last active {formatDateTime(account.lastActiveAt)}</div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{account.keyNames.join(", ") || "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatUsd(account.listCostUsd, true)}</TableCell>
                  <TableCell>
                    {account.isReader ? (
                      <span className="text-xs text-muted-foreground">Excluded from billing</span>
                    ) : (
                      <Select
                        value={selection[account.accountId] || undefined}
                        onValueChange={(value) =>
                          setSelection((current) => ({ ...current, [account.accountId]: value }))
                        }
                      >
                        <SelectTrigger className="min-w-[180px]">
                          <SelectValue placeholder="Select member…" />
                        </SelectTrigger>
                        <SelectContent>
                          {activeMembers.map((member) => (
                            <SelectItem key={member.userId} value={member.userId}>
                              {member.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {!account.isReader && (
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => save(account.accountId)}
                          disabled={savingId === account.accountId}
                        >
                          {savingId === account.accountId ? <Loader2 className="animate-spin" /> : <Check />}
                          Save
                        </Button>
                        {account.isMapped && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => unmap(account.accountId)}
                            title="Remove mapping"
                          >
                            <Trash2 />
                          </Button>
                        )}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function BillingTab({
  groupId,
  periods,
  selectedPeriod,
  onSelectPeriod,
  summary,
  onChanged,
}: {
  groupId: string;
  periods: PeriodInfo[];
  selectedPeriod: string;
  onSelectPeriod: (periodId: string) => void;
  summary: ReturnType<typeof useApi<GroupSummary>>;
  onChanged: () => void;
}) {
  const [totalIdr, setTotalIdr] = useState("");
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const period = useMemo(
    () => periods.find((entry) => entry.id === selectedPeriod) ?? null,
    [periods, selectedPeriod],
  );

  useEffect(() => {
    setTotalIdr(summary.data?.bill.totalIdr === null || summary.data?.bill.totalIdr === undefined ? "" : String(summary.data.bill.totalIdr));
  }, [summary.data?.period.id, summary.data?.bill.totalIdr]);

  if (periods.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No billing period yet. Connect the Console key and run a sync first.
        </CardContent>
      </Card>
    );
  }

  const parseIdr = (raw: string): number => Number.parseInt(raw.replace(/[^\d]/g, ""), 10);

  const save = async () => {
    if (!period) return;
    const value = parseIdr(totalIdr);
    if (!Number.isFinite(value)) {
      setError("Enter a valid IDR amount.");
      notifyError(null, "Enter a valid IDR amount.");
      return;
    }
    setError(null);
    setMessage(null);
    setSaving(true);
    try {
      await put(`/api/groups/${groupId}/periods/${period.id}/bill`, { totalIdr: value });
      setMessage("Total bill saved.");
      notifySuccess("Total bill saved.");
      summary.refresh();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the bill.");
      notifyError(err, "Could not save the bill.");
    } finally {
      setSaving(false);
    }
  };

  const finalize = async () => {
    if (!period) return;
    setError(null);
    setMessage(null);
    setFinalizing(true);
    try {
      await post(`/api/groups/${groupId}/periods/${period.id}/finalize`);
      setMessage("Period finalized. Amounts are now locked.");
      notifySuccess("Period finalized. Amounts are now locked.");
      summary.refresh();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not finalize the period.");
      notifyError(err, "Could not finalize the period.");
    } finally {
      setFinalizing(false);
    }
  };

  const reopen = async () => {
    if (!period) return;
    if (
      !window.confirm(
        "Reopen this period? Amounts will become editable and members will see a draft again. Usage will be re-synced for the last 90 days.",
      )
    ) {
      return;
    }
    setError(null);
    setMessage(null);
    setReopening(true);
    try {
      const result = await post<{ sync?: { rows?: number; error?: string } }>(
        `/api/groups/${groupId}/periods/${period.id}/reopen`,
      );
      if (result.sync?.error) {
        const detail = result.sync.error.replace(/\.$/, "");
        const text = `Period reopened, but the usage re-sync failed: ${detail}. Use Sync now to retry.`;
        setMessage(text);
        notifyInfo(text);
      } else if (typeof result.sync?.rows === "number") {
        const text = `Period reopened. Re-synced ${result.sync.rows} usage rows from the last 90 days.`;
        setMessage(text);
        notifySuccess(text);
      } else {
        setMessage("Period reopened.");
        notifySuccess("Period reopened.");
      }
      summary.refresh();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reopen the period.");
      notifyError(err, "Could not reopen the period.");
    } finally {
      setReopening(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-muted-foreground" />
            Billing &amp; finalization
          </CardTitle>
          <CardDescription>Set the actual IDR bill, then finalize once all usage is mapped.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {message && (
            <Alert variant="info">
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-1.5">
            <Label>Period</Label>
            <Select value={selectedPeriod} onValueChange={onSelectPeriod}>
              <SelectTrigger>
                <SelectValue placeholder="Choose period" />
              </SelectTrigger>
              <SelectContent>
                {periods.map((entry) => (
                  <SelectItem key={entry.id} value={entry.id}>
                    {entry.label} {entry.status === "finalized" ? "· finalized" : "· draft"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="total-idr">Total bill (IDR)</Label>
            <Input
              id="total-idr"
              inputMode="numeric"
              placeholder="170000"
              value={totalIdr}
              disabled={period?.status === "finalized"}
              onChange={(event) => setTotalIdr(event.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              Enter the actual amount including tax/fees. The split uses list cost share and largest remainder.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={save} disabled={saving || period?.status === "finalized"}>
              {saving ? <Loader2 className="animate-spin" /> : <Save />}
              Save bill
            </Button>
            {period?.status === "finalized" ? (
              <Button variant="outline" onClick={reopen} disabled={reopening}>
                {reopening ? <Loader2 className="animate-spin" /> : <Lock />}
                {reopening ? "Reopening…" : "Reopen period"}
              </Button>
            ) : (
              <Button onClick={finalize} disabled={finalizing || !summary.data?.finalize.canFinalize}>
                {finalizing ? <Loader2 className="animate-spin" /> : <Lock />}
                Finalize period
              </Button>
            )}
          </div>
          {period?.status === "draft" && summary.data && summary.data.finalize.blockers.length > 0 && (
            <Alert variant="warning">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Finalization blocked</AlertTitle>
              <AlertDescription>
                <ul className="list-disc space-y-1 pl-4">
                  {summary.data.finalize.blockers.map((blocker) => (
                    <li key={blocker}>{blocker}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
          {period?.status === "finalized" && summary.data && (
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
              Finalized by {summary.data.finalize.finalizedBy ?? "owner"} at {formatDateTime(summary.data.finalize.finalizedAt)}.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PieChart className="h-4 w-4 text-muted-foreground" />
            Split preview
          </CardTitle>
          <CardDescription>List cost share and current IDR allocation.</CardDescription>
        </CardHeader>
        <CardContent>
          {summary.loading ? (
            <Skeleton className="h-48 w-full" />
          ) : summary.error ? (
            <Alert variant="destructive">
              <AlertDescription>{summary.error.message}</AlertDescription>
            </Alert>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead className="text-right">Share</TableHead>
                  <TableHead className="text-right">Bill</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(summary.data?.members ?? []).map((member) => (
                  <TableRow key={member.userId}>
                    <TableCell>
                      <div className="font-medium">{member.name}</div>
                      <div className="text-[11px] text-muted-foreground">{formatUsd(member.listCostUsd, true)} list cost</div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatPct(member.sharePct)}</TableCell>
                    <TableCell className="text-right">
                      <div className="font-medium tabular-nums">{formatIdr(member.amountIdr)}</div>
                      <div className="text-[11px] text-muted-foreground tabular-nums">{formatUsd(member.amountUsd)}</div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {summary.data?.unmapped.length ? (
            <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
              Unmapped usage: {summary.data.unmapped.map((account) => account.name).join(", ")}. Finalization is blocked until these accounts are mapped.
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function AuditTab({ audit }: { audit: ReturnType<typeof useApi<{ logs: AuditLogItem[] }>> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ScrollText className="h-4 w-4 text-muted-foreground" />
          Audit log
        </CardTitle>
        <CardDescription>Key, invite, mapping, billing, and role changes for this group.</CardDescription>
      </CardHeader>
      <CardContent>
        {audit.loading ? (
          <Skeleton className="h-48 w-full" />
        ) : (audit.data?.logs ?? []).length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            No audit entries yet. Connection, invite, mapping, and billing changes will appear here.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Target</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(audit.data?.logs ?? []).map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-muted-foreground">{formatDateTime(log.createdAt)}</TableCell>
                  <TableCell className="font-medium">{log.action}</TableCell>
                  <TableCell>{log.actorName ?? "System"}</TableCell>
                  <TableCell className="max-w-[280px] truncate text-muted-foreground">{log.target ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
