import { config } from "./config.ts";

let warned = false;

export async function verifyTurnstile(token: string | undefined, ip: string): Promise<boolean> {
  if (!config.turnstileSecretKey) {
    if (!warned) {
      warned = true;
      console.warn("[turnstile] TURNSTILE_SECRET_KEY is empty; Turnstile is disabled in dev mode.");
    }
    return true;
  }
  if (!token) return false;
  try {
    const form = new URLSearchParams();
    form.set("secret", config.turnstileSecretKey);
    form.set("response", token);
    if (ip && ip !== "local") form.set("remoteip", ip);
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return false;
    const result = (await response.json()) as { success?: boolean };
    return result.success === true;
  } catch {
    return false;
  }
}
