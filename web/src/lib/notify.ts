import { toast } from "sonner";

export function notifySuccess(message: string): void {
  toast.success(message);
}

export function notifyError(error: unknown, fallback: string): void {
  toast.error(error instanceof Error ? error.message : fallback);
}

export function notifyInfo(message: string): void {
  toast.info(message);
}
