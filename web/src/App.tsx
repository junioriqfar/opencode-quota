import { Link, Navigate, Route, Routes } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { RequireAuth, RequireSuperadmin } from "@/components/require-auth";
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
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="text-center">
        <p className="text-sm font-medium text-muted-foreground">404</p>
        <h1 className="mt-1 text-2xl font-semibold">Page not found</h1>
        <Button asChild variant="link" className="mt-4">
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
