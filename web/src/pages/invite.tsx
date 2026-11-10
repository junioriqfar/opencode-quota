import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, Loader2, LogIn, Mail, UserPlus } from "lucide-react";
import { AuthLayout } from "@/components/auth-layout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useApi } from "@/hooks/use-api";
import { useAuth } from "@/lib/auth-context";
import { post } from "@/lib/api";
import { notifyError, notifySuccess } from "@/lib/notify";
import { usePageMeta } from "@/hooks/use-page-meta";

interface InvitePreview {
  invite: {
    groupName: string;
    email: string | null;
    role: "owner" | "member";
    expiresAt: string;
  };
}

export function InvitePage() {
  const { token = "" } = useParams();
  const { user, loading: authLoading } = useAuth();
  const preview = useApi<InvitePreview>(token ? `/api/invites/${encodeURIComponent(token)}` : null);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const next = `/invite/${encodeURIComponent(token)}`;
  usePageMeta({
    title: preview.error
      ? "Invitation unavailable"
      : preview.data?.invite
        ? `Join ${preview.data.invite.groupName}`
        : "Group invitation",
  });

  const accept = async () => {
    setError(null);
    setAccepting(true);
    try {
      const result = await post<{ group: { id: string; name: string } }>(
        `/api/invites/${encodeURIComponent(token)}/accept`,
      );
      notifySuccess(`Joined ${result.group.name}.`);
      navigate(`/app/g/${result.group.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not accept the invitation.");
      notifyError(err, "Could not accept the invitation.");
    } finally {
      setAccepting(false);
    }
  };

  if (preview.loading || authLoading) {
    return (
      <AuthLayout title="Group invitation" subtitle="Loading invitation details…">
        <div className="flex justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </AuthLayout>
    );
  }

  if (preview.error) {
    return (
      <AuthLayout title="Group invitation" subtitle="This invitation is not available.">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Invitation unavailable</AlertTitle>
          <AlertDescription>{preview.error.message}</AlertDescription>
        </Alert>
      </AuthLayout>
    );
  }

  const invite = preview.data?.invite;

  return (
    <AuthLayout
      title={invite ? `Join ${invite.groupName}` : "Group invitation"}
      subtitle={
        invite
          ? `You have been invited as a ${invite.role}. Group data is private to its members.`
          : "Group invitation"
      }
    >
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {!user ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Sign in with the invited email address to accept this invitation.
          </p>
          <Button asChild className="w-full">
            <Link to={`/login?next=${encodeURIComponent(next)}`}>
              <LogIn />
              Sign in to accept
            </Link>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link to={`/signup?next=${encodeURIComponent(next)}`}>
              <UserPlus />
              Create an account
            </Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {invite?.email && (
            <Alert variant="info">
              <Mail className="h-4 w-4" />
              <AlertDescription>
                This invitation is reserved for <strong className="break-all">{invite.email}</strong>. You are signed in as{" "}
                <strong className="break-all">{user.email}</strong>.
              </AlertDescription>
            </Alert>
          )}
          <Button className="w-full" onClick={accept} disabled={accepting}>
            {accepting ? <Loader2 className="animate-spin" /> : <UserPlus />}
            Accept invitation
          </Button>
        </div>
      )}
    </AuthLayout>
  );
}
