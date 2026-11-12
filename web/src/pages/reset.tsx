import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { AuthLayout } from "@/components/auth-layout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { PasswordStrength, missingPasswordRules } from "@/components/password-strength";
import { post } from "@/lib/api";
import { notifyError, notifySuccess } from "@/lib/notify";
import { usePageMeta } from "@/hooks/use-page-meta";

export function ResetPage() {
  const [search] = useSearchParams();
  const token = search.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  usePageMeta({ title: !token ? "Invalid reset link" : done ? "Password updated" : "Reset password" });

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
    setSubmitting(true);
    try {
      await post("/api/auth/reset", { token, password });
      setDone(true);
      notifySuccess("Password updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset your password.");
      notifyError(err, "Could not reset your password.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <AuthLayout title="Reset password" subtitle="The reset link is incomplete.">
        <Alert variant="destructive">
          <AlertDescription>This reset link is invalid. Request a new one.</AlertDescription>
        </Alert>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Choose a new password"
      subtitle="You will be signed out of all sessions after resetting."
      footer={<Link className="font-medium text-foreground underline-offset-4 hover:underline" to="/login">Back to sign in</Link>}
    >
      {done ? (
        <Alert variant="info">
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>Password updated</AlertTitle>
          <AlertDescription>
            You can now <Link className="font-medium underline underline-offset-4" to="/login">sign in</Link> with your new password.
          </AlertDescription>
        </Alert>
      ) : (
        <form className="space-y-4" onSubmit={submit}>
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="password">New password</Label>
            <PasswordInput id="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm">Confirm password</Label>
            <PasswordInput id="confirm" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          <PasswordStrength value={password} />
          <Button className="w-full" type="submit" disabled={submitting}>
            {submitting && <Loader2 className="animate-spin" />}
            Reset password
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
