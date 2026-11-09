import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, type ReactNode } from "react";
import { Activity, LogOut, Moon, Shield, Sun, Users } from "lucide-react";
import type { GroupListItem } from "@shared/types";
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

  useEffect(() => {
    const handler = () => groups.refresh();
    window.addEventListener("groups:changed", handler);
    return () => window.removeEventListener("groups:changed", handler);
  }, [groups.refresh]);

  const handleLogout = async () => {
    await logout();
    notifySuccess("Signed out.");
    navigate("/login");
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-35 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
      <div className="relative z-10">
        <header className="border-b bg-card/70 backdrop-blur supports-[backdrop-filter]:bg-card/55">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 md:px-6">
            <Link to="/app" className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 via-sky-500 to-violet-500 text-white shadow-md shadow-emerald-500/20">
                <Activity className="h-[18px] w-[18px]" />
              </span>
              <span className="hidden text-sm font-semibold sm:block">Quota Status</span>
            </Link>

            {groups.data && groups.data.groups.length > 0 && (
              <div className="ml-1">
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
                  <SelectTrigger className="w-[190px] md:w-[240px]">
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

            <div className="ml-auto flex items-center gap-1.5">
              {user?.isSuperadmin && (
                <Button variant={location.pathname.startsWith("/admin") ? "secondary" : "ghost"} size="sm" asChild>
                  <Link to="/admin">
                    <Shield />
                    <span className="hidden sm:inline">Super-admin</span>
                  </Link>
                </Button>
              )}
              <span className="hidden max-w-[160px] truncate text-sm text-muted-foreground md:block">
                {user?.name}
              </span>
              <Button variant="ghost" size="icon" onClick={toggle} title="Toggle theme">
                {theme === "dark" ? <Sun /> : <Moon />}
              </Button>
              <Button variant="ghost" size="icon" onClick={handleLogout} title="Sign out">
                <LogOut />
              </Button>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6 md:px-6 lg:py-8">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 pb-6 text-xs text-muted-foreground md:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
            <span>Private group workspace · data visible to group members only</span>
            <span className="tabular-nums">{new Date().getFullYear()}</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
