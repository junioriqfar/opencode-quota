import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState, type ReactNode } from "react";
import { Activity, LogOut, Moon, Shield, Sun, Users } from "lucide-react";
import type { GroupListItem } from "@shared/types";
import { APP_NAME } from "@shared/brand";
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

export function AppShell({
  children,
  groupId,
}: {
  children: ReactNode;
  groupId?: string;
}) {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const groups = useApi<{ groups: GroupListItem[] }>("/api/groups");
  const [logoutOpen, setLogoutOpen] = useState(false);

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

            <div className="order-1 ml-auto flex items-center gap-1.5 sm:order-none">
              {user?.isSuperadmin && (
                <Button variant={location.pathname.startsWith("/admin") ? "secondary" : "ghost"} size="sm" asChild>
                  <Link to="/admin" aria-label="Super-admin">
                    <Shield />
                    <span className="hidden sm:inline">Super-admin</span>
                  </Link>
                </Button>
              )}
              <span className="hidden max-w-[160px] truncate text-sm text-muted-foreground md:block">
                {user?.name}
              </span>
              <Button variant="ghost" size="icon" onClick={toggle} title="Toggle theme" aria-label="Toggle theme">
                {theme === "dark" ? <Sun /> : <Moon />}
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setLogoutOpen(true)} title="Sign out" aria-label="Sign out">
                <LogOut />
              </Button>
            </div>
          </div>
        </header>
        <main id="main" className="mx-auto max-w-6xl px-4 py-6 md:px-6 lg:py-8">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 pb-6 text-xs text-muted-foreground md:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
            <span>{APP_NAME} · Private group workspace · data visible to group members only</span>
            <span className="tabular-nums">{new Date().getFullYear()}</span>
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
    </div>
  );
}
