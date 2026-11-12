import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2 } from "lucide-react";
import { AuthLayout } from "@/components/auth-layout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { notifyError, notifySuccess } from "@/lib/notify";
import { usePageMeta } from "@/hooks/use-page-meta";
import { safeNextPath } from "@shared/redirect";

export function VerifyPage() {
  const [search] = useSearchParams();
  const token = search.get("token") ?? "";
  const next = safeNextPath(search.get("next")) ?? "/app";
  const loginHref = next === "/app" ? "/login" : `/login?next=${encodeURIComponent(next)}`;
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const started = useRef(false);
  usePageMeta({
    title: done ? "Email verified" : error ? "Verification failed" : "Verify email",
  });

  useEffect(() => {
    if (!token) {
      setError("Verification token is missing.");
      return;
    }
    if (started.current) return;
    started.current = true;
    api<{ ok: boolean; email: string; next: string | null }>(
      `/api/auth/verify?token=${encodeURIComponent(token)}`,
    )
      .then(() => {
        setDone(true);
        notifySuccess("Email verified. Sign in to continue.");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Verification failed.");
        notifyError(err, "Verification failed.");
      });
  }, [token]);

  return (
    <AuthLayout
      title={done ? "Email verified" : "Verifying your email"}
      subtitle={
        done
          ? "Your address is confirmed. Sign in to continue."
          : "One moment while we activate your account."
      }
    >
      {done ? (
        <div className="space-y-4">
          <Alert variant="info">
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>Email verified</AlertTitle>
            <AlertDescription>
              You can now sign in with your email and password.
            </AlertDescription>
          </Alert>
          <Button asChild className="w-full">
            <Link to={loginHref}>Sign in</Link>
          </Button>
        </div>
      ) : error ? (
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
