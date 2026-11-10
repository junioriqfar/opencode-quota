import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        element: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
        },
      ) => string;
      remove: (widgetId: string) => void;
      reset: (widgetId: string) => void;
    };
  }
}

export interface TurnstileHandle {
  reset: () => void;
}

let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Could not load Turnstile."));
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

export const Turnstile = forwardRef<TurnstileHandle, {
  siteKey: string;
  onToken: (token: string) => void;
}>(function Turnstile({ siteKey, onToken }, ref) {
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const callback = useRef(onToken);
  callback.current = onToken;

  useImperativeHandle(ref, () => ({
    reset() {
      if (widget.current && window.turnstile) {
        window.turnstile.reset(widget.current);
        callback.current("");
      }
    },
  }), []);

  useEffect(() => {
    if (!siteKey || !container.current) return;
    let cancelled = false;
    void loadScript().then(() => {
      if (cancelled || !window.turnstile || !container.current || widget.current) return;
      widget.current = window.turnstile.render(container.current, {
        sitekey: siteKey,
        theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
        callback: (token) => callback.current(token),
        "expired-callback": () => callback.current(""),
      });
    });
    return () => {
      cancelled = true;
      if (widget.current && window.turnstile) {
        window.turnstile.remove(widget.current);
        widget.current = null;
      }
    };
  }, [siteKey]);

  if (!siteKey) return null;
  return <div ref={container} className="flex justify-center" />;
});
Turnstile.displayName = "Turnstile";
