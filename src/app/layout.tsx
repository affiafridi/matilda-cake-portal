import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
