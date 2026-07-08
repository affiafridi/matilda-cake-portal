import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { getPortalSettings, buildBrandVars } from "@/lib/portalSettings";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-jakarta",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const { app_name } = await getPortalSettings();
  return {
    title: app_name,
    description: `Internal order operations portal for ${app_name}.`,
    icons: {
      icon: [{ url: "/uploads/favicon.webp", type: "image/webp" }],
      shortcut: ["/uploads/favicon.webp"],
      apple: ["/uploads/favicon.webp"],
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { primary_color, accent_color, sidebar_color } = await getPortalSettings();
  const brandVars = buildBrandVars(primary_color, sidebar_color, accent_color);

  return (
    <html lang="en" className={jakarta.variable} style={brandVars as React.CSSProperties}>
      <body className="antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
