import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, Loader2, Mail, Send } from "lucide-react";
import { AuthLayout } from "@/components/auth-layout";
import { Turnstile, type TurnstileHandle } from "@/components/turnstile";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { post } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { notifyError, notifySuccess } from "@/lib/notify";
import { usePageMeta } from "@/hooks/use-page-meta";

export function ForgotPage() {
  const { config } = useAuth();
  const [email, setEmail] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const turnstileRef = useRef<TurnstileHandle>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ message: string; devResetUrl?: string } | null>(null);
  usePageMeta({ title: result ? "Check your email" : "Forgot password" });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (config?.turnstileSiteKey && !turnstileToken) {
      setError("Please complete the Turnstile check.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await post<{ message: string; devResetUrl?: string }>("/api/auth/forgot", {
        email,
        turnstileToken,
      });
      setResult(response);
      notifySuccess("Reset link sent.");
    } catch (err) {
      turnstileRef.current?.reset();
      setTurnstileToken("");
      setError(err instanceof Error ? err.message : "Could not request a reset link.");
      notifyError(err, "Could not request a reset link.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Forgot password"
      subtitle="We will send a one-time reset link if the account exists."
      footer={<Link className="font-medium text-foreground underline-offset-4 hover:underline" to="/login">Back to sign in</Link>}
    >
      {result ? (
        <Alert variant="info">
          <Mail className="h-4 w-4" />
          <AlertTitle>Check your email</AlertTitle>
          <AlertDescription>
            {result.message}
            {result.devResetUrl && (
              <p className="mt-2">
                Development mode:{" "}
                <a className="font-medium underline underline-offset-4" href={result.devResetUrl}>
                  open reset link
                </a>
              </p>
            )}
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
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <Turnstile ref={turnstileRef} siteKey={config?.turnstileSiteKey ?? ""} onToken={setTurnstileToken} />
          <Button className="w-full" type="submit" disabled={submitting}>
            {submitting ? <Loader2 className="animate-spin" /> : <Send />}
            Send reset link
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
