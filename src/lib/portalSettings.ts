import "server-only";
import { prisma } from "@/lib/prisma";

export type PortalSettings = {
  woo_visible_to_admin: boolean;
  ai_visible_to_admin:  boolean;
  app_name:      string;
  primary_color: string;
  accent_color:  string;
  sidebar_color: string;
  logo_url:      string;
};

const DEFAULTS: PortalSettings = {
  woo_visible_to_admin: false,
  ai_visible_to_admin:  false,
  app_name:      "Order Portal",
  primary_color: "#6b2e1a",
  accent_color:  "#c9a535",
  sidebar_color: "#ffffff",
  logo_url:      "/uploads/logo.png",
};

export async function getPortalSettings(): Promise<PortalSettings> {
  try {
    const rows = await prisma.$queryRaw<{ key: string; value: string }[]>`
      SELECT key, value FROM portal_settings
      WHERE key IN (
        'woo_visible_to_admin', 'ai_visible_to_admin',
        'app_name', 'primary_color', 'accent_color', 'sidebar_color', 'logo_url'
      )
    `;
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return {
      woo_visible_to_admin: (map["woo_visible_to_admin"] ?? "false") === "true",
      ai_visible_to_admin:  (map["ai_visible_to_admin"]  ?? "false") === "true",
      app_name:      map["app_name"]      ?? DEFAULTS.app_name,
      primary_color: map["primary_color"] ?? DEFAULTS.primary_color,
      accent_color:  map["accent_color"]  ?? DEFAULTS.accent_color,
      sidebar_color: map["sidebar_color"] ?? DEFAULTS.sidebar_color,
      logo_url:      map["logo_url"]      ?? DEFAULTS.logo_url,
    };
  } catch {
    return DEFAULTS;
  }
}

/** Convert a hex color to H S% L% values for CSS */
export function hexToHslParts(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const r = parseInt(m[1].slice(0, 2), 16) / 255;
  const g = parseInt(m[1].slice(2, 4), 16) / 255;
  const b = parseInt(m[1].slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

/** Returns brand CSS variables as a style object for the <html> element.
 *  Inline styles on <html> have the highest specificity — always override @theme. */
export function buildBrandVars(primaryHex: string, sidebarHex = "#ffffff", accentHex = "#c9a535"): Record<string, string> {
  const hsl = hexToHslParts(primaryHex);
  if (!hsl) return {};
  const [h, s, l] = hsl;
  const dk  = Math.max(0, l - 12);
  const ink = Math.max(0, l - 22);
  const mut = Math.min(90, l + 20);
  const crm = Math.min(97, l + 43);
  const car = Math.min(90, l + 16);

  // Sidebar: auto-detect dark vs light to flip foreground colors
  const sidebarHsl = hexToHslParts(sidebarHex);
  const sidebarL   = sidebarHsl ? sidebarHsl[2] : 100;
  const isDark     = sidebarL < 45;

  const sidebarFg      = isDark ? "rgba(255,255,255,0.88)" : `hsl(${h} ${s}% ${ink}%)`;
  const sidebarMuted   = isDark ? "rgba(255,255,255,0.45)" : `hsl(${h} ${Math.max(0, s - 12)}% ${mut}%)`;
  // Use var(--color-brand) so sidebar active color auto-follows primary color live changes
  const sidebarActiveBg  = isDark ? "rgba(255,255,255,0.13)" : "var(--color-brand)";
  const sidebarActiveFg  = "#ffffff";
  const sidebarHoverBg   = isDark ? "rgba(255,255,255,0.07)" : `hsl(${h} ${Math.max(0, s - 18)}% ${crm}%)`;
  const sidebarBorder    = isDark ? "rgba(255,255,255,0.08)" : "#f0ebe4";
  const sidebarIconBg    = isDark ? "rgba(255,255,255,0.10)" : `hsl(${h} ${Math.max(0, s - 18)}% ${crm}%)`;
  const sidebarIconColor = isDark ? "rgba(255,255,255,0.75)" : "var(--color-brand)";

  return {
    "--color-brand":      primaryHex,
    "--color-gold":       accentHex ?? "#c9a535",
    "--color-brand-dark": `hsl(${h} ${s}% ${dk}%)`,
    "--color-ink":        `hsl(${h} ${s}% ${ink}%)`,
    "--color-ink-muted":  `hsl(${h} ${Math.max(0, s - 12)}% ${mut}%)`,
    "--color-cream":      `hsl(${h} ${Math.max(0, s - 18)}% ${crm}%)`,
    "--color-caramel":    `hsl(${h} ${Math.max(0, s - 8)}% ${car}%)`,
    "--color-focus":      `hsl(${h} ${Math.max(0, s - 8)}% ${car}%)`,
    // Sidebar tokens
    "--sb-bg":         sidebarHex,
    "--sb-fg":         sidebarFg,
    "--sb-muted":      sidebarMuted,
    "--sb-active-bg":  sidebarActiveBg,
    "--sb-active-fg":  sidebarActiveFg,
    "--sb-hover-bg":   sidebarHoverBg,
    "--sb-border":     sidebarBorder,
    "--sb-icon-bg":    sidebarIconBg,
    "--sb-icon-color": sidebarIconColor,
  };
}
