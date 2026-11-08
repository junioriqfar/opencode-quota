import { config } from "./config.ts";

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

let warned = false;

export async function sendEmail(input: SendEmailInput): Promise<{ sent: boolean; error?: string }> {
  if (!config.resendApiKey) {
    if (!warned) {
      warned = true;
      console.warn("[email] RESEND_API_KEY is empty; emails will be logged to the console.");
    }
    console.log(`[email] to=${input.to} subject=${input.subject}`);
    console.log(`[email] ${input.text}`);
    return { sent: false };
  }

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
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      const body = await response.text();
      console.error(`[email] Resend failed (${response.status}): ${body.slice(0, 300)}`);
      return { sent: false, error: `Email provider error (${response.status}).` };
    }
    return { sent: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[email] Resend request failed: ${message}`);
    return { sent: false, error: "Could not send email." };
  }
}

function layout(title: string, body: string): string {
  return `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f8fafc;padding:32px">
  <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:28px">
    <h1 style="margin:0 0 12px;font-size:20px;color:#0f172a">${title}</h1>
    <div style="font-size:14px;line-height:1.6;color:#334155">${body}</div>
    <p style="margin-top:24px;font-size:12px;color:#94a3b8">Quota Status</p>
  </div>
</body></html>`;
}

export async function sendVerificationEmail(email: string, token: string): Promise<{ link: string; sent: boolean }> {
  const link = `${config.appUrl}/verify?token=${encodeURIComponent(token)}`;
  const result = await sendEmail({
    to: email,
    subject: "Verify your Quota Status email",
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
    subject: "Reset your Quota Status password",
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

export async function sendInviteEmail(email: string, groupName: string, token: string): Promise<{ link: string; sent: boolean }> {
  const link = `${config.appUrl}/invite/${encodeURIComponent(token)}`;
  const result = await sendEmail({
    to: email,
    subject: `You are invited to ${groupName} on Quota Status`,
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
