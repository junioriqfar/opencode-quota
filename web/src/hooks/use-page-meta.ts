import { useLayoutEffect, useMemo } from "react";
import { pageTitle } from "@shared/brand";
import { brandFavicon, groupFavicon } from "@/lib/favicon";

const FAVICON_SELECTOR = 'link[data-app-favicon]';

export function usePageMeta({
  title,
  group,
}: {
  title?: string | null;
  group?: { name: string; id: string; admin?: boolean } | null;
}) {
  const fullTitle = pageTitle(title);

  useLayoutEffect(() => {
    document.title = fullTitle;
  }, [fullTitle]);

  const faviconHref = useMemo(
    () => (group ? groupFavicon(group) : brandFavicon()),
    [group?.id, group?.name, group?.admin],
  );

  useLayoutEffect(() => {
    let link = document.querySelector<HTMLLinkElement>(FAVICON_SELECTOR);
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      link.type = "image/svg+xml";
      link.dataset.appFavicon = "";
      document.head.appendChild(link);
    }
    const previous = link.getAttribute("href") ?? "/favicon.svg";
    link.setAttribute("href", faviconHref);
    return () => {
      if (link?.getAttribute("href") === faviconHref) {
        link.setAttribute("href", previous || "/favicon.svg");
      }
    };
  }, [faviconHref]);
}
