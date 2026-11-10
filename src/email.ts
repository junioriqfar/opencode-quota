import { config } from "./config.ts";
import { APP_NAME } from "../shared/brand.ts";
import { safeNextPath } from "../shared/redirect.ts";

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

let warned = false;

interface SendEmailOptions {
  attempts?: number;
  timeoutMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendEmail(
  input: SendEmailInput,
  options: SendEmailOptions = {},
): Promise<{ sent: boolean; error?: string }> {
  if (!config.resendApiKey) {
    if (!warned) {
      warned = true;
      console.warn("[email] RESEND_API_KEY is empty; emails will be logged to the console.");
    }
    console.log(`[email] to=${input.to} subject=${input.subject}`);
    console.log(`[email] ${input.text}`);
    return { sent: false };
  }

  const attempts = Math.max(1, options.attempts ?? 3);
  const timeoutMs = Math.max(1_000, options.timeoutMs ?? 10_000);
  let lastError = "Could not send email.";

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: config.emailFrom,
          to: [input.to],
          subject: input.subject,
          html: input.html,
          text: input.text,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.ok) {
        const body = (await response.json().catch(() => ({}))) as { id?: string };
        console.log(
          `[email] sent to=${input.to} subject=${input.subject}${body.id ? ` id=${body.id}` : ""}`,
        );
        return { sent: true };
      }
      const body = await response.text();
      console.error(
        `[email] Resend failed (${response.status}, attempt ${attempt}/${attempts}): ${body.slice(0, 300)}`,
      );
      lastError = `Email provider error (${response.status}).`;
      // Retry only rate limits and provider-side failures.
      if (response.status !== 429 && response.status < 500) {
        return { sent: false, error: lastError };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[email] attempt ${attempt}/${attempts} failed: ${message}`);
      lastError = "Could not send email.";
    }
    if (attempt < attempts) await sleep(attempt * 1_000);
  }

  return { sent: false, error: lastError };
}

function layout(title: string, body: string): string {
  return `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f8fafc;padding:32px">
  <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:28px">
    <h1 style="margin:0 0 12px;font-size:20px;color:#0f172a">${title}</h1>
    <div style="font-size:14px;line-height:1.6;color:#334155">${body}</div>
    <p style="margin-top:24px;font-size:12px;color:#94a3b8">${APP_NAME}</p>
  </div>
</body></html>`;
}

export async function sendVerificationEmail(
  email: string,
  token: string,
  nextPath?: string,
): Promise<{ link: string; sent: boolean }> {
  const next = safeNextPath(nextPath);
  const link = `${config.appUrl}/verify?token=${encodeURIComponent(token)}${
    next ? `&next=${encodeURIComponent(next)}` : ""
  }`;
  const result = await sendEmail({
    to: email,
    subject: `Verify your ${APP_NAME} email`,
    html: layout(
      "Verify your email",
      `<p>Click the button below to verify your email address.</p>
       <p><a href="${link}" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Verify email</a></p>
       <p>This link expires in 24 hours.</p>`,
    ),
    text: `Verify your email: ${link}`,
  });
  return { link, sent: result.sent };
}

export async function sendPasswordResetEmail(email: string, token: string): Promise<{ link: string; sent: boolean }> {
  const link = `${config.appUrl}/reset?token=${encodeURIComponent(token)}`;
  const result = await sendEmail({
    to: email,
    subject: `Reset your ${APP_NAME} password`,
    html: layout(
      "Reset your password",
      `<p>Click the button below to choose a new password.</p>
       <p><a href="${link}" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Reset password</a></p>
       <p>This link expires in 1 hour. If you did not request this, ignore this email.</p>`,
    ),
    text: `Reset your password: ${link}`,
  });
  return { link, sent: result.sent };
}

export async function sendPasswordChangedEmail(
  email: string,
  options: SendEmailOptions = {},
): Promise<{ sent: boolean }> {
  const when = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date());
  const link = `${config.appUrl}/forgot`;
  const result = await sendEmail({
    to: email,
    subject: `Your ${APP_NAME} password was changed`,
    html: layout(
      "Password changed",
      `<p>Your ${APP_NAME} account password was changed on <strong>${when}</strong> (Asia/Jakarta).</p>
       <p>All other devices have been signed out. If this was you, no further action is needed.</p>
       <p>If you did not change it, reset your password immediately and contact your administrator.</p>
       <p><a href="${link}" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Reset password</a></p>
       <p>If you did not request this, ignore this email.</p>`,
    ),
    text: `Your ${APP_NAME} password was changed on ${when} (Asia/Jakarta). All other devices have been signed out. If this was not you, reset your password at ${link}`,
  }, options);
  return { sent: result.sent };
}

export async function sendInviteEmail(email: string, groupName: string, token: string): Promise<{ link: string; sent: boolean }> {
  const link = `${config.appUrl}/invite/${encodeURIComponent(token)}`;
  const result = await sendEmail({
    to: email,
    subject: `You are invited to ${groupName} on ${APP_NAME}`,
    html: layout(
      `Invitation to ${groupName}`,
      `<p>You have been invited to join <strong>${groupName}</strong>.</p>
       <p><a href="${link}" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Accept invitation</a></p>
       <p>This link expires in 7 days.</p>`,
    ),
    text: `Join ${groupName}: ${link}`,
  });
  return { link, sent: result.sent };
}
