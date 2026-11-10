import { Link, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Activity,
  Check,
  ChevronDown,
  Copyright,
  KeyRound,
  LogOut,
  Moon,
  Shield,
  Sun,
  Users,
} from "lucide-react";
import type { GroupListItem } from "@shared/types";
import { APP_NAME } from "@shared/brand";
import { ChangePasswordDialog } from "@/components/change-password-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useApi } from "@/hooks/use-api";
import { useTheme } from "@/hooks/use-theme";
import { useAuth } from "@/lib/auth-context";
import { notifySuccess } from "@/lib/notify";

/** Two-letter avatar initials, falling back to the email when no name is set. */
function initials(name: string | undefined, email: string | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length > 1) {
    return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
  }
  if (parts.length === 1) return (parts[0]!.slice(0, 2) || "?").toUpperCase();
  return (email?.trim()[0] ?? "?").toUpperCase();
}

export function AppShell({
  children,
  groupId,
}: {
  children: ReactNode;
  groupId?: string;
}) {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const groups = useApi<{ groups: GroupListItem[] }>("/api/groups");
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  // Opening a modal while the dropdown is still closing leaves Radix's
  // body pointer-events lock in place, so outside clicks stop working.
  // Defer the dialog until the menu has fully closed.
  const openPasswordOnMenuClose = useRef(false);

  useEffect(() => {
    const handler = () => groups.refresh();
    window.addEventListener("groups:changed", handler);
    return () => window.removeEventListener("groups:changed", handler);
  }, [groups.refresh]);

  const handleLogout = async () => {
    setLogoutOpen(false);
    await logout();
    notifySuccess("Signed out.");
    navigate("/login");
  };

  return (
    <div className="relative min-h-screen overflow-x-clip">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-lg focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-35 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
      <div className="relative z-10">
        <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/65">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-3 md:px-6">
            <Link to="/app" className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 via-sky-500 to-violet-500 text-white shadow-md shadow-emerald-500/20">
                <Activity className="h-[18px] w-[18px]" />
              </span>
              <span className="truncate text-sm font-semibold">{APP_NAME}</span>
            </Link>

            {groups.data && groups.data.groups.length > 0 && (
              <div className="order-2 w-full sm:order-none sm:ml-1 sm:w-auto">
                <Select
                  value={groupId}
                  onValueChange={(value) => {
                    if (!value) return;
                    const target = groups.data?.groups.find((group) => group.id === value);
                    if (target?.role === "owner" && !target.consoleStatus) {
                      navigate(`/app/g/${value}/admin?tab=connection`);
                    } else {
                      navigate(`/app/g/${value}`);
                    }
                  }}
                >
                  <SelectTrigger className="w-full sm:w-[230px]" aria-label="Current group">
                    <Users className="mr-2 h-4 w-4 text-muted-foreground" />
                    <SelectValue placeholder="Select group…" />
                  </SelectTrigger>
                  <SelectContent>
                    {groups.data.groups.map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="order-1 ml-auto flex items-center sm:order-none">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="h-9 gap-2 px-1.5 sm:pr-2.5"
                    aria-label="Account menu"
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 via-sky-500 to-violet-500 text-[11px] font-semibold text-white shadow-sm shadow-emerald-500/20"
                    >
                      {initials(user?.name, user?.email)}
                    </span>
                    <span className="max-w-[120px] truncate text-sm font-medium sm:max-w-[160px]">
                      {user?.name}
                    </span>
                    <ChevronDown className="hidden text-muted-foreground sm:block" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-60"
                  onCloseAutoFocus={(event) => {
                    event.preventDefault();
                    if (openPasswordOnMenuClose.current) {
                      openPasswordOnMenuClose.current = false;
                      setPasswordOpen(true);
                    }
                  }}
                >
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col gap-0.5">
                      <span className="truncate text-sm font-medium">{user?.name}</span>
                      <span className="truncate text-xs text-muted-foreground">{user?.email}</span>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Theme
                  </DropdownMenuLabel>
                  <DropdownMenuItem onSelect={() => setTheme("light")}>
                    <Sun />
                    Light
                    {theme === "light" && <Check className="ml-auto" />}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setTheme("dark")}>
                    <Moon />
                    Dark
                    {theme === "dark" && <Check className="ml-auto" />}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => {
                      openPasswordOnMenuClose.current = true;
                    }}
                  >
                    <KeyRound />
                    Change password
                  </DropdownMenuItem>
                  {user?.isSuperadmin && (
                    <DropdownMenuItem asChild>
                      <Link to="/admin">
                        <Shield />
                        Super-admin
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => setLogoutOpen(true)}
                    className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                  >
                    <LogOut />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>
        <main id="main" className="mx-auto max-w-6xl px-4 py-6 md:px-6 lg:py-8">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 pb-6 text-xs text-muted-foreground md:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
            <span>{APP_NAME} · Private group workspace · data visible to group members only</span>
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Copyright className="h-3 w-3" aria-hidden="true" />
              {new Date().getFullYear()}
            </span>
          </div>
        </footer>
      </div>

      <AlertDialog open={logoutOpen} onOpenChange={setLogoutOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out?</AlertDialogTitle>
            <AlertDialogDescription>
              You will need to sign in again to access your groups.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleLogout();
              }}
            >
              Sign out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
    </div>
  );
}
