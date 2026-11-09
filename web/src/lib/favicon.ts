const GROUP_COLORS = [
  "#047857",
  "#0369a1",
  "#6d28d9",
  "#b45309",
  "#be123c",
  "#0f766e",
  "#4338ca",
  "#a21caf",
];

function svgDataUri(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function colorForId(id: string): string {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  }
  return GROUP_COLORS[hash % GROUP_COLORS.length]!;
}

const BRAND_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#10b981"/>
      <stop offset="0.5" stop-color="#0ea5e9"/>
      <stop offset="1" stop-color="#8b5cf6"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="15" fill="url(#g)"/>
  <path d="M13 34h11l4-11 9 22 5-11h9" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

export function brandFavicon(): string {
  return svgDataUri(BRAND_SVG);
}

export function groupFavicon({
  name,
  id,
  admin = false,
}: {
  name: string;
  id: string;
  admin?: boolean;
}): string {
  const initial = Array.from(name.trim())[0]?.toUpperCase() ?? "G";
  const background = colorForId(id);
  const safeInitial = escapeXml(initial);
  const adminDot = admin
    ? '<circle cx="50" cy="14" r="7" fill="#fff" stroke="#0b1220" stroke-width="2"/>'
    : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="15" fill="${background}"/>
  <text x="32" y="35" text-anchor="middle" dominant-baseline="central" font-family="Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif" font-size="34" font-weight="700" fill="#fff">${safeInitial}</text>
  <rect x="0" y="56" width="64" height="8" fill="url(#brand)"/>
  <defs>
    <linearGradient id="brand" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#10b981"/>
      <stop offset="0.5" stop-color="#0ea5e9"/>
      <stop offset="1" stop-color="#8b5cf6"/>
    </linearGradient>
  </defs>
  ${adminDot}
</svg>`;
  return svgDataUri(svg);
}
