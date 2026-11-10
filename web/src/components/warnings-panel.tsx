import { TriangleAlert } from "lucide-react";
import type { GroupSummary } from "@shared/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function WarningsPanel({
  summary,
  hideBillWarning = false,
}: {
  summary: GroupSummary;
  hideBillWarning?: boolean;
}) {
  const warnings = summary.warnings.filter(
    (warning) => !(hideBillWarning && warning.toLowerCase().includes("total bill")),
  );
  if (warnings.length === 0) return null;
  return (
    <Alert variant="warning">
      <TriangleAlert className="h-4 w-4" />
      <AlertTitle>Needs attention</AlertTitle>
      <AlertDescription>
        <ul className="list-disc space-y-1 pl-4">
          {warnings.map((warning) => (
            <li key={warning} className="break-words">{warning}</li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
