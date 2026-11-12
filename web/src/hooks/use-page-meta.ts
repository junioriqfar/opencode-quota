import { useLayoutEffect } from "react";
import { pageTitle } from "@shared/brand";
import { brandFavicon } from "@/lib/favicon";

const FAVICON_SELECTOR = 'link[data-app-favicon]';

export function usePageMeta({ title }: { title?: string | null }) {
  const fullTitle = pageTitle(title);

  useLayoutEffect(() => {
    document.title = fullTitle;
  }, [fullTitle]);

  useLayoutEffect(() => {
    let link = document.querySelector<HTMLLinkElement>(FAVICON_SELECTOR);
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      link.type = "image/svg+xml";
      link.dataset.appFavicon = "";
      document.head.appendChild(link);
    }
    // Always use the OpenCode Quota mark, matching the app header.
    link.setAttribute("href", brandFavicon());
  }, []);
}
