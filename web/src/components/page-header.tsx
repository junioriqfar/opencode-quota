import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PageHeader({
  icon,
  title,
  description,
  meta,
  actions,
  backTo,
  backLabel,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  backTo?: string;
  backLabel?: string;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {backTo && (
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="-ml-2 shrink-0"
              title={backLabel ?? "Back"}
            >
              <Link to={backTo}>
                <ArrowLeft />
              </Link>
            </Button>
          )}
          <h1 className="flex min-w-0 items-center gap-2 text-2xl font-semibold tracking-tight [&>svg]:shrink-0">
            {icon}
            <span className="truncate">{title}</span>
          </h1>
        </div>
        {meta && <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div>}
        {description && (
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
