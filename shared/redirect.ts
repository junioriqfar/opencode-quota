/**
 * Restrict post-auth redirects to internal app paths, so a crafted `next`
 * value can never send a user to another origin.
 */
export function safeNextPath(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const path = value.trim();
  if (path.length === 0 || path.length > 2048) return undefined;
  if (!path.startsWith("/")) return undefined;
  if (path.startsWith("//") || path.startsWith("/\\")) return undefined;
  if (/[\u0000-\u001f\u007f]/.test(path)) return undefined;
  return path;
}
