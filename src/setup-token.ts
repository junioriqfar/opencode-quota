import { randomBytes } from "node:crypto";
import { config } from "./config.ts";

let generatedToken: string | null = null;
let logged = false;

/**
 * Returns the configured setup token, or a process-local generated one.
 * Never writes to .env and never rotates on page access.
 */
export function getSetupToken(): string | null {
  if (config.setupToken) return config.setupToken;
  if (config.isProduction) return null;
  if (!generatedToken) generatedToken = randomBytes(24).toString("base64url");
  return generatedToken;
}

/**
 * Logs the generated token once per process. The token stays stable until
 * the server restarts or setup succeeds.
 */
export function logGeneratedSetupToken(): void {
  if (config.setupToken) return;
  if (config.isProduction) {
    if (!logged) {
      logged = true;
      console.warn(
        "[setup] SETUP_TOKEN is not configured; setup is disabled in production.",
      );
    }
    return;
  }
  const token = getSetupToken();
  if (!token || logged) return;
  logged = true;
  console.log(`[setup] SETUP_TOKEN is not configured. Generated setup token: ${token}`);
}

export function clearSetupToken(): void {
  generatedToken = null;
}
