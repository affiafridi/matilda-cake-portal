import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Matilda Cakes — Order Portal",
  description: "Internal order operations portal for Matilda Cakes.",
  icons: {
    icon: [{ url: "/uploads/favicon.webp", type: "image/webp" }],
    shortcut: ["/uploads/favicon.webp"],
    apple: ["/uploads/favicon.webp"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={jakarta.variable}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
