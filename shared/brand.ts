export const APP_NAME = "OpenCode Quota";
export const APP_DESCRIPTION =
  "Private multi-tenant quota, usage, and bill-splitting dashboard for OpenCode Go workspaces.";

export function pageTitle(page?: string | null): string {
  const trimmed = page?.trim();
  return trimmed ? `${trimmed} · ${APP_NAME}` : APP_NAME;
}
