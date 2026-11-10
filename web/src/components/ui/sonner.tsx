import { Toaster as Sonner, type ToasterProps } from "sonner";
import { useTheme } from "@/hooks/use-theme";

export function Toaster(props: ToasterProps) {
  const { theme } = useTheme();
  return (
    <Sonner
      theme={theme}
      className="toaster group"
      richColors
      closeButton
      position="top-right"
      mobileOffset={{ top: 64, right: 12, left: 12 }}
      toastOptions={{ duration: 4000 }}
      {...props}
    />
  );
}
