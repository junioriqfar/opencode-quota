import { useRef, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { AlertCircle, CheckCircle2, Loader2, UserPlus } from "lucide-react";
import { safeNextPath } from "@shared/redirect";
import { AuthLayout } from "@/components/auth-layout";
import { Turnstile, type TurnstileHandle } from "@/components/turnstile";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { PasswordStrength, missingPasswordRules } from "@/components/password-strength";
import { useAuth } from "@/lib/auth-context";
import { notifyError, notifySuccess } from "@/lib/notify";
import { usePageMeta } from "@/hooks/use-page-meta";

export function SignupPage() {
  const { user, loading, config, signup, setupRequired } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const turnstileRef = useRef<TurnstileHandle>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<{ email: string; devVerifyUrl?: string; emailSent: boolean } | null>(null);
  const [search] = useSearchParams();
  const next = safeNextPath(search.get("next"));
  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : "/login";
  usePageMeta({ title: success ? "Check your email" : "Create account" });

  if (!loading && user) return <Navigate to="/app" replace />;
  if (!loading && setupRequired) return <Navigate to="/setup" replace />;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    const missing = missingPasswordRules(password);
    if (missing.length > 0) {
      setError(`Password must include ${missing.join(", ")}.`);
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (config?.turnstileSiteKey && !turnstileToken) {
      setError("Please complete the Turnstile check.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await signup({ name, email, password, turnstileToken, next });
      setSuccess({ email: result.email, devVerifyUrl: result.devVerifyUrl, emailSent: result.emailSent });
      notifySuccess("Account created. Check your email.");
    } catch (err) {
      turnstileRef.current?.reset();
      setTurnstileToken("");
      setError(err instanceof Error ? err.message : "Sign up failed.");
      notifyError(err, "Sign up failed.");
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <AuthLayout
        title="Check your email"
        subtitle="Verify your address to activate your account."
        footer={<Link className="font-medium text-foreground underline-offset-4 hover:underline" to={loginHref}>Back to sign in</Link>}
      >
        <div className="space-y-4">
          <Alert variant="info">
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>Verification email sent</AlertTitle>
            <AlertDescription>
              We sent a verification link to <strong className="break-all">{success.email}</strong>.
              {success.devVerifyUrl && (
                <p className="mt-2">
                  Development mode:{" "}
                  <a className="font-medium underline underline-offset-4" href={success.devVerifyUrl}>
                    open verification link
                  </a>
                </p>
              )}
              {!success.emailSent && !success.devVerifyUrl && (
                <p className="mt-2">Email delivery is not configured. Ask the administrator for the link.</p>
              )}
            </AlertDescription>
          </Alert>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Create an account"
      subtitle="Open signup is enabled. You can create or join groups after verification."
      footer={
        <>
          Already have an account?{" "}
          <Link className="font-medium text-foreground underline-offset-4 hover:underline" to={loginHref}>
            Sign in
          </Link>
        </>
      }
    >
      <form className="space-y-4" onSubmit={submit}>
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <PasswordInput id="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm">Confirm</Label>
            <PasswordInput id="confirm" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
        </div>
        <PasswordStrength value={password} />
        <Turnstile ref={turnstileRef} siteKey={config?.turnstileSiteKey ?? ""} onToken={setTurnstileToken} />
        <Button className="w-full" type="submit" disabled={submitting}>
          {submitting ? <Loader2 className="animate-spin" /> : <UserPlus />}
          Create account
        </Button>
        {!config?.turnstileSiteKey && (
          <p className="text-center text-[11px] text-muted-foreground">
            Turnstile is disabled in development. Configure keys before production.
          </p>
        )}
      </form>
    </AuthLayout>
  );
}
