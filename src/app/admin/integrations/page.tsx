"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

// ── Integration catalogue ─────────────────────────────────────────────────

type IntegrationStatus = "configured" | "configure" | "coming_soon";
type Category = "All" | "Messaging" | "E-Commerce" | "Automation" | "Analytics" | "CRM" | "Payment";

type IntegrationDef = {
  slug:       string;
  name:       string;
  desc:       string;
  category:   Exclude<Category, "All">;
  status:     IntegrationStatus;
  iconBg:     string;
  icon:       React.ReactNode;
};

const INTEGRATIONS: IntegrationDef[] = [
  {
    slug: "whatsapp",
    name: "WhatsApp Business",
    desc: "Connect your WhatsApp Business number to send & receive messages, create Meta message templates, run automations and manage your team inbox.",
    category: "Messaging",
    status: "configure",
    iconBg: "bg-[#25D366]/10",
    icon: (
      <svg viewBox="0 0 24 24" fill="#25D366" className="h-6 w-6">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
        <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.121 1.528 5.849L.057 23.899a.75.75 0 00.921.921l6.05-1.471A11.943 11.943 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.857a9.834 9.834 0 01-5.032-1.381l-.36-.214-3.733.907.922-3.638-.235-.374A9.857 9.857 0 012.143 12C2.143 6.55 6.55 2.143 12 2.143S21.857 6.55 21.857 12 17.45 21.857 12 21.857z"/>
      </svg>
    ),
  },
  {
    slug: "instagram",
    name: "Instagram DM",
    desc: "Receive and reply to Instagram Direct Messages from the team inbox alongside WhatsApp, with AI auto-replies.",
    category: "Messaging",
    status: "configure",
    iconBg: "bg-[#E1306C]/10",
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" style={{ fill: "url(#ig-list-grad)" }}>
        <defs>
          <linearGradient id="ig-list-grad" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#FCAF45"/>
            <stop offset="50%" stopColor="#E1306C"/>
            <stop offset="100%" stopColor="#833AB4"/>
          </linearGradient>
        </defs>
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
      </svg>
    ),
  },
  {
    slug: "woocommerce",
    name: "WooCommerce",
    desc: "Pull products, categories and orders directly from your WooCommerce store into the bot and customer portal.",
    category: "E-Commerce",
    status: "configure",
    iconBg: "bg-[#7f54b3]/10",
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6 text-[#7f54b3]">
        <path fill="currentColor" d="M2.2 2h19.6C22.99 2 24 3.01 24 4.2v10.08c0 1.19-1.01 2.2-2.2 2.2H13.5l1.63 3.27-4.36-3.27H2.2C1.01 16.48 0 15.47 0 14.28V4.2C0 3.01 1.01 2 2.2 2zm2.01 3.33c-.31.04-.54.19-.65.5-.06.18-.04.37.02.56l2.18 6.93 2.27-4.46 2.27 4.46 2.18-6.93c.11-.37-.04-.75-.38-.92a.76.76 0 00-.99.34l-1.08 3.9-1.98-3.88-2.01 3.88-1.08-3.9c-.11-.36-.41-.52-.75-.48zm11.06.12c-.72.04-1.37.46-1.68 1.11-.31.66-.25 1.46.17 2.06.43.61 1.16.93 1.9.84.74-.09 1.38-.59 1.63-1.3.25-.7.08-1.49-.43-2.02a1.87 1.87 0 00-1.59-.69zm0 .98c.36-.01.71.17.91.47.2.3.24.69.09 1.02-.14.34-.46.57-.82.61-.36.04-.72-.12-.94-.42-.22-.3-.26-.7-.1-1.04.16-.34.5-.57.86-.64z"/>
      </svg>
    ),
  },
  {
    slug: "google-sheets",
    name: "Google Sheets",
    desc: "Auto-sync new WhatsApp contacts into a Google Sheet and export your full contact list on demand.",
    category: "Analytics",
    status: "configure",
    iconBg: "bg-green-50",
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6 text-green-600" fill="currentColor">
        <path d="M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2zm-7 14H7v-2h5v2zm5-4H7v-2h10v2zm0-4H7V7h10v2z"/>
      </svg>
    ),
  },
  {
    slug: "openai",
    name: "OpenAI",
    desc: "Connect your OpenAI API key to enable AI-powered replies in the bot — product search, smart responses, and natural language understanding.",
    category: "Automation",
    status: "configure",
    iconBg: "bg-[#10a37f]/10",
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6 text-[#10a37f]" fill="currentColor">
        <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.032.067L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.843-3.376 2.02-1.164a.076.076 0 0 1 .071 0l4.83 2.786a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.402-.673zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08-4.778 2.758a.795.795 0 0 0-.392.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.993l-2.597 1.5-2.607-1.5z"/>
      </svg>
    ),
  },
  {
    slug: "bot-server",
    name: "Bot Server",
    desc: "Configure the connection between this portal and your Python WhatsApp bot — URL, sync secret and webhook secret.",
    category: "Automation",
    status: "configure",
    iconBg: "bg-[#0f172a]/8",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6 text-[#0f172a]">
        <rect x="3" y="11" width="18" height="10" rx="2"/>
        <path d="M12 11V7M8 7h8M9 15h.01M15 15h.01"/>
      </svg>
    ),
  },
  {
    slug: "google-oauth",
    name: "Google OAuth",
    desc: "Required to enable Google Sheets sync. Add your OAuth 2.0 credentials from Google Cloud Console.",
    category: "Analytics",
    status: "configure",
    iconBg: "bg-blue-50",
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
    ),
  },
  {
    slug: "ccavenue",
    name: "CCAvenue",
    desc: "Generate CCAvenue payment links for WhatsApp customers. Accept cards, UPI, netbanking and wallets — confirm payments automatically.",
    category: "Payment",
    status: "configure",
    iconBg: "bg-white",
    icon: (
      <img src="https://tfvoiztdfxdmkwrvfmds.supabase.co/storage/v1/object/public/indialt-storage/logos/1764772763568-ticse6wkbai.png" alt="CCAvenue" className="h-9 w-9 object-contain" />
    ),
  },
  {
    slug: "stripe",
    name: "Stripe",
    desc: "Send Stripe payment links via WhatsApp and receive payment confirmation notifications automatically.",
    category: "Payment",
    status: "configure",
    iconBg: "bg-[#635bff]/10",
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6 text-[#635bff]" fill="currentColor">
        <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.591-7.305z"/>
      </svg>
    ),
  },
  {
    slug: "paypal",
    name: "PayPal",
    desc: "Generate PayPal payment links for WhatsApp customers and receive payment notifications via webhook.",
    category: "Payment",
    status: "configure",
    iconBg: "bg-[#003087]/8",
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none">
        <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797h-2.19c-.524 0-.968.382-1.05.9l-1.12 7.106zm14.146-14.42a3.35 3.35 0 0 0-.607-.541c-.013.076-.026.175-.041.26-.93 4.778-4.005 7.201-9.138 7.201h-2.19a.563.563 0 0 0-.556.479l-1.187 7.527h-.506l-.24 1.516a.56.56 0 0 0 .554.647h3.882c.46 0 .85-.334.922-.788.06-.26.76-4.852.816-5.09a.932.932 0 0 1 .923-.788h.58c3.76 0 6.705-1.528 7.566-5.946.36-1.847.174-3.388-.778-4.477z" fill="#009cde"/>
        <path d="M6.635 5.263c.045-.283.283-.49.572-.49h8.104c.96 0 1.85.063 2.658.195a5.89 5.89 0 0 1 1.022.26c.254.091.49.2.707.327.256-1.631-.002-2.74-.88-3.746C17.764.557 15.954 0 13.565 0H6.107C5.583 0 5.134.382 5.053.9L2.03 20.382a.562.562 0 0 0 .555.647H6.59l1.047-6.636 1-8.13z" fill="#012169"/>
      </svg>
    ),
  },
  {
    slug: "zoho-crm",
    name: "Zoho CRM",
    desc: "Sync WhatsApp contacts and conversations as leads or contacts in your Zoho account.",
    category: "CRM",
    status: "coming_soon",
    iconBg: "bg-red-50",
    icon: (
      <svg viewBox="0 0 40 40" className="h-6 w-6" fill="none">
        <rect width="40" height="40" rx="8" fill="#E42527"/>
        <text x="6" y="28" fontSize="20" fontWeight="bold" fill="white" fontFamily="sans-serif">Z</text>
      </svg>
    ),
  },
  {
    slug: "shopify",
    name: "Shopify",
    desc: "Connect your Shopify store to send order updates and product info via WhatsApp.",
    category: "E-Commerce",
    status: "coming_soon",
    iconBg: "bg-[#95BF47]/10",
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6 text-[#5a8e13]" fill="currentColor">
        <path d="M15.337.956s-.235-.037-.612-.037c-.463 0-1.037.14-1.537.378C12.535.462 11.875 0 10.875 0 8.875 0 6.875 1.5 5.875 3.875c-.75 2.063-.5 3.063-.5 3.063l-3.5 1.062S0 8.5 0 9.375v13.25C0 23.5.5 24 1.375 24H18.5c.875 0 1.375-.5 1.375-1.375V4.125c0-.75-.375-1.313-1.063-1.5l-3.475-1.67zM12 2c.5 0 .875.25 1.125.625-.438.188-.938.438-1.375.688-.938-1.25-2-2-3.125-2C9.25.5 10.125.875 10.875 1.5 11.25 1.75 11.625 2 12 2zM9.25 21.5H4.75v-1.25H9.25v1.25zm0-3H4.75v-1.25H9.25v1.25zm0-3H4.75v-1.25H9.25v1.25zm5.75 6H11v-1.25h4v1.25zm0-3H11v-1.25h4v1.25zm0-3H11v-1.25h4v1.25z"/>
      </svg>
    ),
  },
  {
    slug: "zapier",
    name: "Zapier",
    desc: "Connect your WhatsApp conversations to 5,000+ apps through Zapier automations.",
    category: "Automation",
    status: "coming_soon",
    iconBg: "bg-[#ff4a00]/10",
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6 text-[#ff4a00]" fill="currentColor">
        <path d="M11.994 0C5.367 0 0 5.367 0 11.994S5.367 24 11.994 24 24 18.633 24 12.006C23.988 5.379 18.62.012 11.994 0zm5.85 13.36h-3.735a.19.19 0 00-.142.063.19.19 0 00-.054.147l.26 3.712a.192.192 0 01-.18.205.197.197 0 01-.15-.063l-4.26-4.26a.196.196 0 010-.277l4.26-4.26a.196.196 0 01.277 0 .2.2 0 01.053.149l-.26 3.712a.19.19 0 00.196.21h3.735a.196.196 0 01.196.196v.27a.196.196 0 01-.196.196z"/>
      </svg>
    ),
  },
];

const CATEGORIES: Category[] = ["All", "Messaging", "E-Commerce", "Automation", "Analytics", "CRM", "Payment"];

const REQUIRED_KEYS: Record<string, string[]> = {
  "whatsapp":     ["wa_phone_number_id", "wa_access_token"],
  "instagram":    ["instagram_page_access_token"],
  "woocommerce":  ["wc_url", "wc_consumer_key"],
  "bot-server":   ["bot_url", "inbox_webhook_secret"],
  "google-oauth": ["google_oauth_client_id", "google_oauth_client_secret"],
  "openai":       ["openai_api_key"],
  "ccavenue":     ["ccavenue_merchant_id", "ccavenue_access_code"],
  "stripe":       ["stripe_secret_key"],
  "paypal":       ["paypal_client_id", "paypal_client_secret"],
};

// ── Component ─────────────────────────────────────────────────────────────

export default function IntegrationsPage() {
  const [activeCategory, setActiveCategory] = useState<Category>("All");
  const [savedValues,    setSavedValues]    = useState<Record<string, string>>({});
  const [gsConnected,    setGsConnected]    = useState(false);
  const [loaded,         setLoaded]         = useState(false);
  const [isSuperAdmin,   setIsSuperAdmin]   = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/integrations").then((r) => r.json()).then((j) => { if (j.ok) setSavedValues(j.data); }).catch(() => {}),
      fetch("/api/admin/integrations/google/sheets").then((r) => r.json()).then((j) => { if (j.ok) setGsConnected(j.data.connected); }).catch(() => {}),
      fetch("/api/auth/me").then((r) => r.json()).then((j) => { if (j?.data?.role === "SUPER_ADMIN") setIsSuperAdmin(true); }).catch(() => {}),
    ]).finally(() => setLoaded(true));
  }, []);

  function resolveStatus(slug: string, base: IntegrationStatus): IntegrationStatus {
    if (base === "coming_soon") return "coming_soon";
    if (slug === "google-sheets") return gsConnected ? "configured" : "configure";
    const required = REQUIRED_KEYS[slug];
    if (!required) return base;
    return required.every((k) => savedValues[k]?.trim()) ? "configured" : "configure";
  }

  const integrations = INTEGRATIONS
    .filter((i) => i.slug !== "instagram" || isSuperAdmin)
    .map((i) => ({ ...i, status: resolveStatus(i.slug, i.status) }))
    .sort((a, b) => {
      const order = { configured: 0, configure: 1, coming_soon: 2 };
      return order[a.status] - order[b.status];
    });
  const filtered = activeCategory === "All" ? integrations : integrations.filter((i) => i.category === activeCategory);

  return (
    <div className="px-6 py-6 lg:px-8">

      {/* Skeleton while loading */}
      {!loaded && (
        <div className="animate-pulse">

          {/* Active integrations row */}
          <div className="mb-6">
            <div className="h-2.5 w-32 rounded bg-[#e5e7eb] mb-3" />
            <div className="flex flex-wrap gap-2">
              {[100, 120, 110, 96, 130, 104].map((w, i) => (
                <div key={i} className="flex items-center gap-2.5 rounded-xl border border-[#e5e7eb] bg-white px-3 py-2" style={{ width: w }}>
                  <div className="h-7 w-7 rounded-lg bg-[#e5e7eb] shrink-0" />
                  <div className="space-y-1.5 flex-1">
                    <div className="h-2.5 w-full rounded bg-[#e5e7eb]" />
                    <div className="h-2 w-3/4 rounded bg-[#e5e7eb]" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tab bar */}
          <div className="flex gap-0.5 border-b border-[#e5e7eb] mb-6">
            {[32, 64, 80, 72, 64, 40, 56].map((w, i) => (
              <div key={i} className="h-10 rounded-t bg-[#f1f5f9]" style={{ width: w }} />
            ))}
          </div>

          {/* Cards grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-[#e5e7eb] bg-[#f6f8fa] p-5 space-y-3.5">
                <div className="flex items-start justify-between">
                  <div className="h-10 w-10 rounded-xl bg-[#e5e7eb]" />
                  <div className="h-5 w-20 rounded-full bg-[#e5e7eb]" />
                </div>
                <div className="space-y-1.5">
                  <div className="h-3 w-32 rounded bg-[#e5e7eb]" />
                  <div className="h-2.5 w-20 rounded bg-[#e5e7eb]" />
                </div>
                <div className="space-y-1.5 pt-1">
                  <div className="h-2 w-full rounded bg-[#e5e7eb]" />
                  <div className="h-2 w-5/6 rounded bg-[#e5e7eb]" />
                  <div className="h-2 w-2/3 rounded bg-[#e5e7eb]" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Category filter tabs + Grid */}
      {loaded && (
        <>
          {/* Active integrations */}
          {integrations.filter((i) => i.status === "configured").length > 0 && (
            <div className="mb-6">
              <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#64748b]">Active integrations</p>
              <div className="flex flex-wrap gap-2">
                {integrations.filter((i) => i.status === "configured").map((int) => (
                  <Link key={int.slug} href={`/admin/integrations/${int.slug}`}
                    className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-white px-3 py-2 hover:border-emerald-300 transition">
                    <div className={`h-7 w-7 rounded-lg ${int.iconBg} flex items-center justify-center shrink-0`}>
                      <span className="scale-75 flex items-center justify-center">{int.icon}</span>
                    </div>
                    <div>
                      <p className="text-[12px] font-semibold text-[#0f172a] leading-tight">{int.name}</p>
                      <p className="text-[10px] text-emerald-600 font-medium flex items-center gap-1 mt-0.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" /> Active
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Underline tab bar */}
          <div className="border-b border-[#e5e7eb] mb-6">
            <div className="flex items-end gap-0.5">
              {CATEGORIES.map((cat) => (
                <button key={cat} onClick={() => setActiveCategory(cat)}
                  className={[
                    "px-3.5 py-3 text-[13px] font-medium border-b-2 transition-colors select-none",
                    activeCategory === cat
                      ? "border-[#0f172a] text-[#0f172a]"
                      : "border-transparent text-[#64748b] hover:text-[#374151]",
                  ].join(" ")}>
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((int) => {
              const isConfigured = int.status === "configured";
              const isClickable  = int.status !== "coming_soon";

              const card = (
                <div className={[
                  "group relative flex flex-col h-full rounded-xl border p-5 transition",
                  isConfigured
                    ? "border-emerald-200 bg-[#f6f8fa] hover:border-emerald-300 cursor-pointer"
                    : isClickable
                      ? "border-[#e5e7eb] bg-[#f6f8fa] hover:border-[#94a3b8] cursor-pointer"
                      : "border-[#e5e7eb] bg-[#f6f8fa] opacity-55 cursor-default",
                ].join(" ")}>

                  {/* Icon + badge row */}
                  <div className="flex items-start justify-between mb-4">
                    <div className={`h-10 w-10 rounded-xl ${int.iconBg} flex items-center justify-center shrink-0`}>
                      {int.icon}
                    </div>
                    {isConfigured ? (
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                        Configured
                      </span>
                    ) : int.status === "coming_soon" ? (
                      <span className="rounded-full border border-[#e5e7eb] bg-white px-2.5 py-0.5 text-[11px] font-medium text-[#9ca3af]">
                        Coming soon
                      </span>
                    ) : null}
                  </div>

                  {/* Name + category */}
                  <p className="text-[13px] font-bold text-[#0f172a] mb-0.5">{int.name}</p>
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-[11px] font-medium text-[#64748b]">{int.category}</p>
                    {int.slug === "whatsapp" && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#0866ff] bg-[#0866ff]/8 px-1.5 py-0.5 rounded-full">
                        <svg viewBox="0 0 290 191" className="h-3 w-5 shrink-0" xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink">
                          <defs>
                            <linearGradient id="mlg1" x1="61" y1="117" x2="259" y2="127" gradientUnits="userSpaceOnUse">
                              <stop style={{stopColor:"#0064e1"}} offset="0"/>
                              <stop style={{stopColor:"#0064e1"}} offset="0.4"/>
                              <stop style={{stopColor:"#0073ee"}} offset="0.83"/>
                              <stop style={{stopColor:"#0082fb"}} offset="1"/>
                            </linearGradient>
                            <linearGradient id="mlg2" x1="45" y1="139" x2="45" y2="66" gradientUnits="userSpaceOnUse">
                              <stop style={{stopColor:"#0082fb"}} offset="0"/>
                              <stop style={{stopColor:"#0064e0"}} offset="1"/>
                            </linearGradient>
                          </defs>
                          <path style={{fill:"#0081fb"}} d="m31.06,125.96c0,10.98 2.41,19.41 5.56,24.51 4.13,6.68 10.29,9.51 16.57,9.51 8.1,0 15.51-2.01 29.79-21.76 11.44-15.83 24.92-38.05 33.99-51.98l15.36-23.6c10.67-16.39 23.02-34.61 37.18-46.96 11.56-10.08 24.03-15.68 36.58-15.68 21.07,0 41.14,12.21 56.5,35.11 16.81,25.08 24.97,56.67 24.97,89.27 0,19.38-3.82,33.62-10.32,44.87-6.28,10.88-18.52,21.75-39.11,21.75l0-31.02c17.63,0 22.03-16.2 22.03-34.74 0-26.42-6.16-55.74-19.73-76.69-9.63-14.86-22.11-23.94-35.84-23.94-14.85,0-26.8,11.2-40.23,31.17-7.14,10.61-14.47,23.54-22.7,38.13l-9.06,16.05c-18.2,32.27-22.81,39.62-31.91,51.75-15.95,21.24-29.57,29.29-47.5,29.29-21.27,0-34.72-9.21-43.05-23.09-6.8-11.31-10.14-26.15-10.14-43.06z"/>
                          <path style={{fill:"url(#mlg1)"}} d="m24.49,37.3c14.24-21.95 34.79-37.3 58.36-37.3 13.65,0 27.22,4.04 41.39,15.61 15.5,12.65 32.02,33.48 52.63,67.81l7.39,12.32c17.84,29.72 27.99,45.01 33.93,52.22 7.64,9.26 12.99,12.02 19.94,12.02 17.63,0 22.03-16.2 22.03-34.74l27.4-.86c0,19.38-3.82,33.62-10.32,44.87-6.28,10.88-18.52,21.75-39.11,21.75-12.8,0-24.14-2.78-36.68-14.61-9.64-9.08-20.91-25.21-29.58-39.71l-25.79-43.08c-12.94-21.62-24.81-37.74-31.68-45.04-7.39-7.85-16.89-17.33-32.05-17.33-12.27,0-22.69,8.61-31.41,21.78z"/>
                          <path style={{fill:"url(#mlg2)"}} d="m82.35,31.23c-12.27,0-22.69,8.61-31.41,21.78-12.33,18.61-19.88,46.33-19.88,72.95 0,10.98 2.41,19.41 5.56,24.51l-26.48,17.44c-6.8-11.31-10.14-26.15-10.14-43.06 0-30.75 8.44-62.8 24.49-87.55 14.24-21.95 34.79-37.3 58.36-37.3z"/>
                        </svg>
                        via Meta API
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] text-[#64748b] leading-relaxed line-clamp-2">{int.desc}</p>

                  {/* Arrow on hover */}
                  {isClickable && (
                    <div className="mt-4 flex items-center gap-1 text-[12px] font-semibold text-[#0f172a] opacity-0 group-hover:opacity-100 transition-opacity">
                      View & configure
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                        <path d="M5 12h14M12 5l7 7-7 7"/>
                      </svg>
                    </div>
                  )}
                </div>
              );

              return isClickable ? (
                <Link key={int.slug} href={`/admin/integrations/${int.slug}`} className="block h-full">
                  {card}
                </Link>
              ) : (
                <div key={int.slug} className="h-full">{card}</div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
