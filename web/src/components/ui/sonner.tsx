import { useEffect, useState } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

function useDocumentTheme(): "light" | "dark" {
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    document.documentElement.classList.contains("dark") ? "dark" : "light",
  );

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return theme;
}

export function Toaster(props: ToasterProps) {
  const theme = useDocumentTheme();
  return (
    <Sonner
      theme={theme}
      className="toaster group"
      richColors
      closeButton
      position="top-right"
      toastOptions={{ duration: 4000 }}
      {...props}
    />
  );
}
