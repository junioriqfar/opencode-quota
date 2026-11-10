import { Link, Navigate, Route, Routes } from "react-router-dom";
import { Activity } from "lucide-react";
import { APP_NAME } from "@shared/brand";
import { Button } from "@/components/ui/button";
import { RequireAuth, RequireSuperadmin } from "@/components/require-auth";
import { usePageMeta } from "@/hooks/use-page-meta";
import { ForgotPage } from "@/pages/forgot";
import { GroupAdminPage } from "@/pages/group-admin";
import { GroupDashboardPage } from "@/pages/group-dashboard";
import { GroupsPage } from "@/pages/groups";
import { InvitePage } from "@/pages/invite";
import { LoginPage } from "@/pages/login";
import { ResetPage } from "@/pages/reset";
import { SetupPage } from "@/pages/setup";
import { SignupPage } from "@/pages/signup";
import { SuperadminPage } from "@/pages/superadmin";
import { VerifyPage } from "@/pages/verify";

function NotFound() {
  usePageMeta({ title: "Page not found" });
  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-muted/30 px-4">
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-50 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
      <div className="relative w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-xl shadow-foreground/5">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 via-sky-500 to-violet-500 text-white shadow-lg shadow-emerald-500/20">
          <Activity className="h-6 w-6" />
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {APP_NAME}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Page not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you are looking for does not exist or has moved.
        </p>
        <Button asChild className="mt-5">
          <Link to="/app">Back to groups</Link>
        </Button>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/app" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/verify" element={<VerifyPage />} />
      <Route path="/forgot" element={<ForgotPage />} />
      <Route path="/reset" element={<ResetPage />} />
      <Route path="/setup" element={<SetupPage />} />
      <Route path="/invite/:token" element={<InvitePage />} />

      <Route
        path="/app"
        element={
          <RequireAuth>
            <GroupsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/app/g/:groupId"
        element={
          <RequireAuth>
            <GroupDashboardPage />
          </RequireAuth>
        }
      />
      <Route
        path="/app/g/:groupId/admin"
        element={
          <RequireAuth>
            <GroupAdminPage />
          </RequireAuth>
        }
      />
      <Route
        path="/admin"
        element={
          <RequireAuth>
            <RequireSuperadmin>
              <SuperadminPage />
            </RequireSuperadmin>
          </RequireAuth>
        }
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
