import { useState } from "react";
import { Loader2 } from "lucide-react";
import { PasswordStrength, missingPasswordRules } from "@/components/password-strength";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { post } from "@/lib/api";
import { notifyError, notifyInfo, notifySuccess } from "@/lib/notify";

export function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirm("");
    setError(null);
    setSubmitting(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    const missing = missingPasswordRules(newPassword);
    if (missing.length > 0) {
      setError(`Password must include ${missing.join(", ")}.`);
      return;
    }
    if (newPassword !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (newPassword === currentPassword) {
      setError("Your new password must be different from the current one.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await post<{ ok: boolean; emailSent?: boolean }>(
        "/api/auth/change-password",
        { currentPassword, newPassword },
      );
      if (result.emailSent === false) {
        notifySuccess("Password updated. Other sessions have been signed out.");
        notifyInfo("The confirmation email could not be sent.");
      } else {
        notifySuccess("Password updated. A confirmation email has been sent.");
      }
      handleOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change your password.");
      notifyError(err, "Could not change your password.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription>
            Enter your current password, then choose a new one. All other devices will be signed out.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="current-password">Current password</Label>
            <PasswordInput
              id="current-password"
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <PasswordInput
              id="new-password"
              autoComplete="new-password"
              required
              minLength={8}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
            <PasswordStrength value={newPassword} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-new-password">Confirm new password</Label>
            <PasswordInput
              id="confirm-new-password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="animate-spin" />}
              Update password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
