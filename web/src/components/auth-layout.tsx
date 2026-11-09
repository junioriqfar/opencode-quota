import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Activity } from "lucide-react";
import { APP_NAME } from "@shared/brand";

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-muted/30 px-4 py-10">
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-50 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
      <div className="pointer-events-none absolute left-1/2 top-[-180px] h-[380px] w-[760px] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="relative z-10 w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <Link to="/login" className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 via-sky-500 to-violet-500 text-white shadow-lg shadow-emerald-500/20">
            <Activity className="h-6 w-6" />
          </Link>
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {APP_NAME}
          </span>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <div className="rounded-xl border bg-card p-6 shadow-xl shadow-foreground/5">{children}</div>
        {footer && <div className="mt-4 text-center text-sm text-muted-foreground">{footer}</div>}
      </div>
    </div>
  );
}
