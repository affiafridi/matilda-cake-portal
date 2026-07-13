import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { getPortalSettings } from "@/lib/portalSettings";

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
    robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
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
  return (
    <html lang="en" className={jakarta.variable}>
      <body className="antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
