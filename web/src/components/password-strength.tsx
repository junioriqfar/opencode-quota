import { Check, X } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export const PASSWORD_RULES = [
  { key: "uppercase", label: "Uppercase", test: (value: string) => /[A-Z]/.test(value) },
  { key: "lowercase", label: "Lowercase", test: (value: string) => /[a-z]/.test(value) },
  { key: "number", label: "Number", test: (value: string) => /[0-9]/.test(value) },
  { key: "symbol", label: "Symbol", test: (value: string) => /[^A-Za-z0-9]/.test(value) },
] as const;

export function passwordRules(value: string) {
  return PASSWORD_RULES.map((rule) => ({ ...rule, ok: rule.test(value) }));
}

export function missingPasswordRules(value: string): string[] {
  return passwordRules(value)
    .filter((rule) => !rule.ok)
    .map((rule) => rule.label.toLowerCase());
}

export function PasswordStrength({ value }: { value: string }) {
  const rules = passwordRules(value);
  const passed = rules.filter((rule) => rule.ok).length;
  const strength = Math.round((passed / rules.length) * 100);
  const label =
    passed <= 1 ? "Weak" : passed === 2 ? "Fair" : passed === 3 ? "Good" : "Strong";
  const color =
    passed <= 1
      ? "bg-gradient-to-r from-rose-500 to-red-500"
      : passed === 2
        ? "bg-gradient-to-r from-amber-400 to-orange-500"
        : passed === 3
          ? "bg-gradient-to-r from-sky-400 to-blue-500"
          : "bg-gradient-to-r from-emerald-400 to-teal-500";

  return (
    <div className="space-y-1.5">
      <Progress
        value={strength}
        className="h-1.5"
        indicatorClassName={color}
        aria-label="Password strength"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">
          Strength: <span className="font-medium text-foreground">{label}</span>
        </span>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {rules.map((rule) => (
            <span
              key={rule.key}
              className={cn(
                "inline-flex items-center gap-1 text-[11px]",
                rule.ok ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
              )}
            >
              {rule.ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
              {rule.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
