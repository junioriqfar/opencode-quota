import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, Loader2, Mail } from "lucide-react";
import { AuthLayout } from "@/components/auth-layout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { post } from "@/lib/api";
import { notifyError, notifySuccess } from "@/lib/notify";

export function ForgotPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ message: string; devResetUrl?: string } | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await post<{ message: string; devResetUrl?: string }>("/api/auth/forgot", { email });
      setResult(response);
      notifySuccess("Reset link sent.");
    } catch (err) {
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
          <Button className="w-full" type="submit" disabled={submitting}>
            {submitting && <Loader2 className="animate-spin" />}
            Send reset link
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
