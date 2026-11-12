import { config } from "./config.ts";

/**
 * Log an unexpected error. Production only emits the message, never the full
 * error object (which can include database parameters or stack context).
 */
export function logError(context: string, error: unknown): void {
  if (config.isProduction) {
    console.error(`${context}: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  console.error(context, error);
}
