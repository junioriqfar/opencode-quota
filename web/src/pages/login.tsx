import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle, Loader2, Mail } from "lucide-react";
import { AuthLayout } from "@/components/auth-layout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { useAuth } from "@/lib/auth-context";
import { post } from "@/lib/api";
import { notifyError, notifySuccess } from "@/lib/notify";
import { usePageMeta } from "@/hooks/use-page-meta";

export function LoginPage() {
  const { user, loading, login, setupRequired } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [devVerifyUrl, setDevVerifyUrl] = useState<string | null>(null);
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const next = search.get("next") || "/app";
  usePageMeta({ title: "Sign in" });

  useEffect(() => {
    if (!loading && user) navigate(next, { replace: true });
  }, [loading, user, navigate, next]);

  if (!loading && user) return <Navigate to={next} replace />;
  if (!loading && setupRequired) return <Navigate to="/setup" replace />;

  const resend = async () => {
    setError(null);
    setResendMessage(null);
    setDevVerifyUrl(null);
    try {
      const result = await post<{ message: string; devVerifyUrl?: string }>(
        "/api/auth/resend-verification",
        { email },
      );
      setResendMessage(result.message);
      setDevVerifyUrl(result.devVerifyUrl ?? null);
      notifySuccess("Verification email sent.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend the verification email.");
      notifyError(err, "Could not resend the verification email.");
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setResendMessage(null);
    setDevVerifyUrl(null);
    setSubmitting(true);
    try {
      await login(email, password);
      notifySuccess("Signed in.");
      navigate(next, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed.");
      notifyError(err, "Sign in failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Access your private group dashboards."
      footer={
        <>
          New here?{" "}
          <Link className="font-medium text-foreground underline-offset-4 hover:underline" to="/signup">
            Create an account
          </Link>
        </>
      }
    >
      <form className="space-y-4" onSubmit={submit}>
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {error}
              {error.toLowerCase().includes("verify your email") && (
                <div className="mt-2">
                  <Button type="button" variant="link" className="h-auto p-0 text-sm" onClick={resend}>
                    Resend verification email
                  </Button>
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}
        {resendMessage && (
          <Alert variant="info">
            <Mail className="h-4 w-4" />
            <AlertDescription>
              {resendMessage}
              {devVerifyUrl && (
                <div className="mt-2">
                  <a className="font-medium underline underline-offset-4" href={devVerifyUrl}>
                    Open verification link
                  </a>
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <PasswordInput id="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          <div className="flex justify-end">
            <Link
              to="/forgot"
              className="text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              Forgot password?
            </Link>
          </div>
        </div>
        <Button className="w-full" type="submit" disabled={submitting}>
          {submitting && <Loader2 className="animate-spin" />}
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}
