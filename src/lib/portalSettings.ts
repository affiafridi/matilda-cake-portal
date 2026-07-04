import "server-only";
import { prisma } from "@/lib/prisma";

export type PortalSettings = {
  woo_visible_to_admin: boolean;
  ai_visible_to_admin:  boolean;
  app_name:     string;
  primary_color: string;
  logo_url:      string;
};

const DEFAULTS: PortalSettings = {
  woo_visible_to_admin: false,
  ai_visible_to_admin:  false,
  app_name:     "Order Portal",
  primary_color: "#6b2e1a",
  logo_url:      "/uploads/logo.png",
};

export async function getPortalSettings(): Promise<PortalSettings> {
  try {
    const rows = await prisma.$queryRaw<{ key: string; value: string }[]>`
      SELECT key, value FROM portal_settings
      WHERE key IN (
        'woo_visible_to_admin', 'ai_visible_to_admin',
        'app_name', 'primary_color', 'logo_url'
      )
    `;
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return {
      woo_visible_to_admin: (map["woo_visible_to_admin"] ?? "false") === "true",
      ai_visible_to_admin:  (map["ai_visible_to_admin"]  ?? "false") === "true",
      app_name:     map["app_name"]     ?? DEFAULTS.app_name,
      primary_color: map["primary_color"] ?? DEFAULTS.primary_color,
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

/** Build a <style> block that overrides the brand CSS variables */
export function buildBrandCss(hex: string): string {
  const hsl = hexToHslParts(hex);
  if (!hsl) return "";
  const [h, s, l] = hsl;
  const dk  = Math.max(0, l - 12);
  const ink = Math.max(0, l - 22);
  const mut = Math.min(90, l + 20);
  const crm = Math.min(97, l + 43);
  const car = Math.min(90, l + 16);
  return [
    `:root{`,
    `--color-brand:${hex};`,
    `--color-brand-dark:hsl(${h} ${s}% ${dk}%);`,
    `--color-ink:hsl(${h} ${s}% ${ink}%);`,
    `--color-ink-muted:hsl(${h} ${Math.max(0, s - 12)}% ${mut}%);`,
    `--color-cream:hsl(${h} ${Math.max(0, s - 18)}% ${crm}%);`,
    `--color-caramel:hsl(${h} ${Math.max(0, s - 8)}% ${car}%);`,
    `--color-focus:hsl(${h} ${Math.max(0, s - 8)}% ${car}%);`,
    `}`,
  ].join("");
}
