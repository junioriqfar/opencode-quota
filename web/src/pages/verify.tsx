import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AuthLayout } from "@/components/auth-layout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { notifyError, notifySuccess } from "@/lib/notify";
import { usePageMeta } from "@/hooks/use-page-meta";
import type { CurrentUser } from "@shared/types";
import { safeNextPath } from "@shared/redirect";

export function VerifyPage() {
  const [search] = useSearchParams();
  const token = search.get("token") ?? "";
  const next = safeNextPath(search.get("next")) ?? "/app";
  const loginHref = next === "/app" ? "/login" : `/login?next=${encodeURIComponent(next)}`;
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  usePageMeta({ title: error ? "Verification failed" : "Verify email" });

  useEffect(() => {
    if (!token) {
      setError("Verification token is missing.");
      return;
    }
    if (started.current) return;
    started.current = true;
    api<{ user: CurrentUser }>(`/api/auth/verify?token=${encodeURIComponent(token)}`)
      .then((result) => {
        setUser(result.user);
        notifySuccess("Email verified.");
        navigate(next, { replace: true });
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Verification failed.");
        notifyError(err, "Verification failed.");
      });
  }, [token, setUser, navigate, next]);

  return (
    <AuthLayout title="Verifying your email" subtitle="One moment while we activate your account.">
      {error ? (
        <div className="space-y-4">
          <Alert variant="destructive">
            <AlertTitle>Verification failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <Button asChild className="w-full" variant="outline">
            <Link to={loginHref}>Back to sign in</Link>
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          Verifying…
        </div>
      )}
    </AuthLayout>
  );
}
