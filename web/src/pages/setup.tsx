import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { AlertCircle, Loader2 } from "lucide-react";
import { AuthLayout } from "@/components/auth-layout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { PasswordStrength, missingPasswordRules } from "@/components/password-strength";
import { post } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { notifyError, notifySuccess } from "@/lib/notify";
import { usePageMeta } from "@/hooks/use-page-meta";
import type { CurrentUser } from "@shared/types";

export function SetupPage() {
  const { loading, setupRequired, setUser } = useAuth();
  const navigate = useNavigate();
  const [setupToken, setSetupToken] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  usePageMeta({ title: "Initial setup" });

  if (!loading && !setupRequired) return <Navigate to="/login" replace />;

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
      const result = await post<{ user: CurrentUser }>("/api/auth/setup", {
        setupToken,
        name,
        email,
        password,
      });
      setUser(result.user);
      notifySuccess("Super-admin created.");
      navigate("/app", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed.");
      notifyError(err, "Setup failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Initial setup"
      subtitle="Create the first super-admin account for this installation."
      footer={<Link className="font-medium text-foreground underline-offset-4 hover:underline" to="/login">Back to sign in</Link>}
    >
      <form className="space-y-4" onSubmit={submit}>
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="setupToken">Setup token</Label>
          <Input id="setupToken" required value={setupToken} onChange={(e) => setSetupToken(e.target.value)} placeholder="From SETUP_TOKEN in .env" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <PasswordInput id="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm">Confirm</Label>
            <PasswordInput id="confirm" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
        </div>
        <PasswordStrength value={password} />
        <Button className="w-full" type="submit" disabled={submitting}>
          {submitting && <Loader2 className="animate-spin" />}
          Create super-admin
        </Button>
        <p className="text-center text-[11px] text-muted-foreground">
          The setup token is configured on the server as <code>SETUP_TOKEN</code>.
        </p>
      </form>
    </AuthLayout>
  );
}
