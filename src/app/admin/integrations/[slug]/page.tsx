"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

type Field = { key: string; label: string; type?: "password" | "text" | "url"; hint?: string; multiline?: boolean };
type SaveState = "idle" | "saving" | "saved" | "error";

type IntegrationMeta = {
  name:     string;
  desc:     string;
  category: string;
  iconBg:   string;
  icon:     React.ReactNode;
  features: string[];
};

const META: Record<string, IntegrationMeta> = {
  "whatsapp": {
    name: "WhatsApp Business",
    desc: "Connect your WhatsApp Business number via Meta API to send & receive messages, create approved message templates, run bot automations and manage your team inbox.",
    category: "Messaging",
    iconBg: "bg-[#25D366]/10",
    features: [
      "Send & receive WhatsApp messages from the team inbox",
      "Create and send Meta-approved message templates",
      "Run automated bot flows for customer enquiries",
      "Broadcast campaigns using approved templates",
      "Assign conversations to agents",
      "24-hour messaging window management",
    ],
    icon: (
      <svg viewBox="0 0 24 24" fill="#25D366" className="h-8 w-8">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
        <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.121 1.528 5.849L.057 23.899a.75.75 0 00.921.921l6.05-1.471A11.943 11.943 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.857a9.834 9.834 0 01-5.032-1.381l-.36-.214-3.733.907.922-3.638-.235-.374A9.857 9.857 0 012.143 12C2.143 6.55 6.55 2.143 12 2.143S21.857 6.55 21.857 12 17.45 21.857 12 21.857z"/>
      </svg>
    ),
  },
  "woocommerce": {
    name: "WooCommerce",
    desc: "Pull products, categories and orders directly from your WooCommerce store into the bot and customer portal.",
    category: "E-Commerce",
    iconBg: "bg-[#7f54b3]/10",
    features: [
      "Browse product categories in WhatsApp bot flows",
      "Show individual products with price and image",
      "Send order tracking links to customers",
      "Sync products to bot for search and card display",
      "REST API connection — no plugin needed",
    ],
    icon: (
      <svg viewBox="0 0 24 24" className="h-8 w-8 text-[#7f54b3]">
        <path fill="currentColor" d="M2.2 2h19.6C22.99 2 24 3.01 24 4.2v10.08c0 1.19-1.01 2.2-2.2 2.2H13.5l1.63 3.27-4.36-3.27H2.2C1.01 16.48 0 15.47 0 14.28V4.2C0 3.01 1.01 2 2.2 2zm2.01 3.33c-.31.04-.54.19-.65.5-.06.18-.04.37.02.56l2.18 6.93 2.27-4.46 2.27 4.46 2.18-6.93c.11-.37-.04-.75-.38-.92a.76.76 0 00-.99.34l-1.08 3.9-1.98-3.88-2.01 3.88-1.08-3.9c-.11-.36-.41-.52-.75-.48zm11.06.12c-.72.04-1.37.46-1.68 1.11-.31.66-.25 1.46.17 2.06.43.61 1.16.93 1.9.84.74-.09 1.38-.59 1.63-1.3.25-.7.08-1.49-.43-2.02a1.87 1.87 0 00-1.59-.69zm0 .98c.36-.01.71.17.91.47.2.3.24.69.09 1.02-.14.34-.46.57-.82.61-.36.04-.72-.12-.94-.42-.22-.3-.26-.7-.1-1.04.16-.34.5-.57.86-.64z"/>
      </svg>
    ),
  },
  "google-sheets": {
    name: "Google Sheets",
    desc: "Auto-sync new WhatsApp contacts into a Google Sheet. Every new contact is added automatically, and you can export your full list on demand.",
    category: "Analytics",
    iconBg: "bg-green-50",
    features: [
      "New contacts automatically added to your sheet",
      "Export all contacts with a single click",
      "Maps name, phone and WhatsApp number",
      "Works alongside Google OAuth credentials",
      "Choose which spreadsheet to sync into",
    ],
    icon: (
      <svg viewBox="0 0 24 24" className="h-8 w-8 text-green-600" fill="currentColor">
        <path d="M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2zm-7 14H7v-2h5v2zm5-4H7v-2h10v2zm0-4H7V7h10v2z"/>
      </svg>
    ),
  },
  "bot-server": {
    name: "Bot Server",
    desc: "Configure the connection between this portal and your Python WhatsApp bot — the URL it runs on, and the shared secrets for secure communication.",
    category: "Automation",
    iconBg: "bg-[#0f172a]/8",
    features: [
      "Portal calls the bot to reload config on changes",
      "Bot calls the portal webhook on incoming messages",
      "Shared secrets authenticate all bot ↔ portal calls",
      "Supports any URL — local or cloud-hosted",
      "Required for all WhatsApp flow automations",
    ],
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8 text-[#0f172a]">
        <rect x="3" y="11" width="18" height="10" rx="2"/>
        <path d="M12 11V7M8 7h8M9 15h.01M15 15h.01"/>
      </svg>
    ),
  },
  "google-oauth": {
    name: "Google OAuth",
    desc: "Required to enable Google Sheets sync. Add your OAuth 2.0 Client ID and Secret from Google Cloud Console.",
    category: "Analytics",
    iconBg: "bg-blue-50",
    features: [
      "One-time setup — enter once and connect",
      "Enables the Google Sheets integration",
      "Secure OAuth 2.0 flow via Google",
      "Credentials stored encrypted in your database",
      "Set up in Google Cloud Console → Credentials",
    ],
    icon: (
      <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
    ),
  },
  "ccavenue": {
    name: "CCAvenue",
    desc: "Generate CCAvenue payment links for WhatsApp customers. Accept cards, UPI, netbanking and wallets — confirm payments automatically via webhook.",
    category: "Payment",
    iconBg: "bg-white",
    features: [
      "Generate CCAvenue Checkout links directly from the bot",
      "Supports cards, UPI, netbanking, EMI and wallets",
      "Webhook confirms payment and sends WhatsApp notification",
      "Test mode supported — use staging credentials to test first",
      "Working key stored securely — never exposed to the browser",
    ],
    icon: (
      <img src="https://tfvoiztdfxdmkwrvfmds.supabase.co/storage/v1/object/public/indialt-storage/logos/1764772763568-ticse6wkbai.png" alt="CCAvenue" className="h-12 w-12 object-contain" />
    ),
  },
  "stripe": {
    name: "Stripe",
    desc: "Send Stripe payment links via WhatsApp and receive payment confirmation notifications automatically via webhook.",
    category: "Payment",
    iconBg: "bg-[#635bff]/10",
    features: [
      "Generate Stripe Checkout links directly from the bot",
      "Supports cards, Apple Pay, Google Pay and more",
      "Webhook confirms payment and sends WhatsApp notification",
      "Test mode supported — use test keys to verify the flow first",
      "Secret key stored securely — never exposed to the browser",
    ],
    icon: (
      <svg viewBox="0 0 24 24" className="h-8 w-8 text-[#635bff]" fill="currentColor">
        <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.591-7.305z"/>
      </svg>
    ),
  },
  "paypal": {
    name: "PayPal",
    desc: "Generate PayPal payment links for WhatsApp customers and receive payment notifications via webhook. Supports sandbox and live modes.",
    category: "Payment",
    iconBg: "bg-[#003087]/8",
    features: [
      "Generate PayPal order links directly from the bot",
      "Supports PayPal balance, cards and Pay Later",
      "Webhook confirms payment and sends WhatsApp notification",
      "Sandbox mode for testing before going live",
      "Client secret stored securely — never exposed to the browser",
    ],
    icon: (
      <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none">
        <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797h-2.19c-.524 0-.968.382-1.05.9l-1.12 7.106zm14.146-14.42a3.35 3.35 0 0 0-.607-.541c-.013.076-.026.175-.041.26-.93 4.778-4.005 7.201-9.138 7.201h-2.19a.563.563 0 0 0-.556.479l-1.187 7.527h-.506l-.24 1.516a.56.56 0 0 0 .554.647h3.882c.46 0 .85-.334.922-.788.06-.26.76-4.852.816-5.09a.932.932 0 0 1 .923-.788h.58c3.76 0 6.705-1.528 7.566-5.946.36-1.847.174-3.388-.778-4.477z" fill="#009cde"/>
        <path d="M6.635 5.263c.045-.283.283-.49.572-.49h8.104c.96 0 1.85.063 2.658.195a5.89 5.89 0 0 1 1.022.26c.254.091.49.2.707.327.256-1.631-.002-2.74-.88-3.746C17.764.557 15.954 0 13.565 0H6.107C5.583 0 5.134.382 5.053.9L2.03 20.382a.562.562 0 0 0 .555.647H6.59l1.047-6.636 1-8.13z" fill="#012169"/>
      </svg>
    ),
  },
  "openai": {
    name: "OpenAI",
    desc: "Add your OpenAI API key to power AI replies inside the bot. When a customer message doesn't match a flow, the bot asks the AI — which can also search WooCommerce products and reply naturally.",
    category: "Automation",
    iconBg: "bg-[#10a37f]/10",
    features: [
      "AI fallback replies when no flow matches the message",
      "Natural language product search via WooCommerce",
      "Replies with product names, prices and links",
      "Key stored securely in the portal database",
      "Bot calls portal /api/bot/ai-reply — key never leaves the portal",
    ],
    icon: (
      <svg viewBox="0 0 24 24" className="h-8 w-8 text-[#10a37f]" fill="currentColor">
        <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.032.067L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.843-3.376 2.02-1.164a.076.076 0 0 1 .071 0l4.83 2.786a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.402-.673zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08-4.778 2.758a.795.795 0 0 0-.392.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.993l-2.597 1.5-2.607-1.5z"/>
      </svg>
    ),
  },
};

const FIELDS: Record<string, Field[]> = {
  "whatsapp": [
    { key: "wa_phone_number_id",     label: "Phone Number ID",     hint: "Found in Meta Business Suite → WhatsApp → API Setup" },
    { key: "wa_business_account_id", label: "Business Account ID", hint: "Found in Meta Business Suite → WhatsApp → API Setup" },
    { key: "wa_access_token",        label: "Access Token",        type: "password", hint: "Permanent token from Meta — never share this" },
  ],
  "whatsapp-flows": [
    { key: "wa_flow_id",        label: "Flow ID",          hint: "Copy from WhatsApp Manager → Account tools → Flows → your flow's Flow ID column" },
    { key: "flows_private_key", label: "RSA Private Key",  multiline: true, hint: "Paste the full contents of flows_private.pem including the -----BEGIN PRIVATE KEY----- and -----END PRIVATE KEY----- lines" },
  ],
  "woocommerce": [
    { key: "wc_url",             label: "Store URL",       type: "url",      hint: "Your WordPress site, e.g. https://shop.yourstore.com" },
    { key: "wc_consumer_key",    label: "Consumer Key",    type: "password", hint: "WooCommerce → Settings → Advanced → REST API" },
    { key: "wc_consumer_secret", label: "Consumer Secret", type: "password", hint: "WooCommerce → Settings → Advanced → REST API" },
  ],
  "bot-server": [
    { key: "bot_url",              label: "Bot Server URL",       type: "url",      hint: "URL of your Python bot server" },
    { key: "sync_secret",          label: "Sync Secret",          type: "password", hint: "Shared secret for portal ↔ bot sync requests" },
    { key: "inbox_webhook_secret", label: "Inbox Webhook Secret", type: "password", hint: "Shared secret for bot → portal inbox webhook" },
  ],
  "google-oauth": [
    { key: "google_oauth_client_id",     label: "OAuth Client ID",     hint: "Google Cloud Console → Credentials → OAuth 2.0 Client ID" },
    { key: "google_oauth_client_secret", label: "OAuth Client Secret", type: "password", hint: "Google Cloud Console → Credentials → OAuth 2.0 Client Secret" },
  ],
  "openai": [
    { key: "openai_api_key", label: "API Key", type: "password", hint: "platform.openai.com → API keys → Create new secret key" },
  ],
  "ccavenue": [
    { key: "ccavenue_merchant_id",  label: "Merchant ID",  hint: "CCAvenue dashboard → Profile → Merchant ID" },
    { key: "ccavenue_access_code",  label: "Access Code",  hint: "CCAvenue dashboard → Payment Gateway → Access Code" },
    { key: "ccavenue_working_key",  label: "Working Key",  type: "password", hint: "CCAvenue dashboard → Payment Gateway → Working Key — keep this secret" },
    { key: "ccavenue_website_url",  label: "Website URL",  type: "url", hint: "Your website URL as registered with CCAvenue, e.g. https://yourstore.com" },
  ],
  "stripe": [
    { key: "stripe_secret_key",      label: "Secret Key",      type: "password", hint: "Stripe Dashboard → Developers → API keys → Secret key (sk_live_… or sk_test_…)" },
    { key: "stripe_webhook_secret",  label: "Webhook Secret",  type: "password", hint: "Stripe Dashboard → Developers → Webhooks → Signing secret (whsec_…)" },
    { key: "stripe_success_url",     label: "Success URL",     type: "url",      hint: "URL to redirect customers to after a successful payment" },
  ],
  "paypal": [
    { key: "paypal_client_id",      label: "Client ID",      hint: "PayPal Developer → My Apps & Credentials → App → Client ID" },
    { key: "paypal_client_secret",  label: "Client Secret",  type: "password", hint: "PayPal Developer → My Apps & Credentials → App → Secret" },
    { key: "paypal_mode",           label: "Mode",           hint: "Enter 'sandbox' for testing or 'live' for production" },
    { key: "paypal_success_url",    label: "Success URL",    type: "url",      hint: "URL to redirect customers to after a successful payment" },
  ],
};

function Spinner() {
  return <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.3"/><path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></svg>;
}

const inputCls = "h-9 w-full rounded-lg border border-[#e5e7eb] bg-white px-3 font-mono text-sm text-[#0f172a] placeholder:text-[#9ca3af] focus:border-[#94a3b8] focus:outline-none transition";

// ── Google Sheets sub-form ────────────────────────────────────────────────

function GoogleSheetsConfig() {
  const [loading,       setLoading]       = useState(true);
  const [connected,     setConnected]     = useState(false);
  const [oauthReady,    setOauthReady]    = useState(false);
  const [sheetId,       setSheetId]       = useState<string | null>(null);
  const [sheetName,     setSheetName]     = useState<string | null>(null);
  const [sheetInput,    setSheetInput]    = useState("");
  const [saving,        setSaving]        = useState(false);
  const [exporting,     setExporting]     = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [msg,           setMsg]           = useState<{ ok: boolean; text: string; url?: string } | null>(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/integrations/google/sheets").then((r) => r.json());
      if (r.ok) {
        setConnected(r.data.connected);
        setOauthReady(r.data.oauthConfigured ?? false);
        setSheetId(r.data.sheetId);
        setSheetName(r.data.sheetName);
      }
    } catch { /**/ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("google") === "connected") setMsg({ ok: true, text: "Google account connected!" });
    if (params.get("google") === "error")     setMsg({ ok: false, text: "Google connection failed. Please try again." });
    loadStatus();
  }, [loadStatus]);

  async function handleSaveSheet() {
    if (!sheetInput.trim()) return;
    setSaving(true); setMsg(null);
    try {
      const r = await fetch("/api/admin/integrations/google/sheets", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: sheetInput.trim() }),
      }).then((r) => r.json());
      if (!r.ok) throw new Error(r.error ?? "Failed");
      setSheetId(r.data.id);
      setSheetName(r.data.name);
      setSheetInput("");
      setMsg({ ok: true, text: `Sheet "${r.data.name}" connected` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Failed to connect sheet" });
    } finally {
      setSaving(false);
    }
  }

  async function handleExport() {
    setExporting(true); setMsg(null);
    try {
      const r = await fetch("/api/admin/customers/export-sheets", { method: "POST" }).then((r) => r.json());
      if (r.ok) setMsg({ ok: true, text: `${r.data.count} contacts exported`, url: r.data.sheetUrl });
      else setMsg({ ok: false, text: r.error ?? "Export failed" });
    } catch { setMsg({ ok: false, text: "Export failed" }); }
    setExporting(false);
  }

  async function handleDisconnect() {
    if (!confirm("Disconnect Google Sheets? Auto-sync will stop.")) return;
    setDisconnecting(true);
    await fetch("/api/admin/integrations/google/disconnect", { method: "POST" });
    setConnected(false); setSheetId(null); setSheetName(null);
    setMsg({ ok: true, text: "Google account disconnected" });
    setDisconnecting(false);
  }

  return (
    <div className="space-y-4">
      {/* Connection status */}
      <div className="rounded-lg border border-[#e5e7eb] bg-white px-4 py-4 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[13px] font-semibold text-[#0f172a]">Google Account</p>
            <p className="text-[11px] text-[#64748b] mt-0.5">
              {connected ? "Your Google account is connected and syncing." : oauthReady ? "OAuth credentials saved — ready to connect." : "Configure Google OAuth integration first, then connect."}
            </p>
          </div>
          {loading ? <Spinner /> : connected ? (
            <div className="flex items-center gap-2.5 shrink-0">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Connected
              </span>
              <button onClick={handleDisconnect} disabled={disconnecting}
                className="h-8 rounded-lg border border-[#e5e7eb] bg-white px-3 text-[12px] font-medium text-[#64748b] hover:border-red-200 hover:text-red-500 transition">
                {disconnecting ? "…" : "Disconnect"}
              </button>
            </div>
          ) : oauthReady ? (
            <a href="/api/admin/integrations/google/connect"
              className="shrink-0 flex h-8 items-center gap-1.5 rounded-lg bg-[#0f172a] px-3 text-[13px] font-semibold text-white hover:bg-[#1e293b] transition">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
                <path d="M12 0C5.372 0 0 5.373 0 12s5.372 12 12 12c6.627 0 12-5.373 12-12S18.627 0 12 0zm.14 19.018c-3.868 0-7-3.14-7-7.018 0-3.878 3.132-7.018 7-7.018 1.89 0 3.47.697 4.682 1.829l-1.974 1.978v-.004c-.735-.702-1.667-1.062-2.708-1.062-2.31 0-4.187 1.956-4.187 4.273 0 2.315 1.877 4.277 4.187 4.277 2.096 0 3.522-1.202 3.816-2.852H12.14v-2.737h6.585c.088.47.135.96.135 1.474 0 4.01-2.677 6.86-6.72 6.86z"/>
              </svg>
              Connect Google
            </a>
          ) : null}
        </div>
        {!loading && !connected && !oauthReady && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 text-amber-500 shrink-0">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <p className="text-[12px] font-medium text-amber-700">Go to <span className="font-semibold">Integrations → Google OAuth</span> and save your credentials first</p>
          </div>
        )}
      </div>

      {/* Sheet URL input */}
      {connected && (
        <div className="space-y-3">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#64748b] mb-1.5">
              Google Sheet URL or ID
            </label>
            <p className="text-[11px] text-[#64748b] mb-2">Open your Google Sheet, copy the URL from the browser, and paste it here.</p>
            <div className="flex gap-2">
              <input type="text" value={sheetInput} onChange={(e) => setSheetInput(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/…"
                className={inputCls + " flex-1"} />
              <button onClick={handleSaveSheet} disabled={saving || !sheetInput.trim()}
                className="h-9 shrink-0 flex items-center gap-1.5 rounded-lg bg-[#0f172a] px-4 text-[13px] font-semibold text-white hover:bg-[#1e293b] transition disabled:opacity-40">
                {saving ? <><Spinner /> Saving…</> : "Connect"}
              </button>
            </div>
          </div>
          {sheetName && sheetId && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
              <p className="text-[12px] text-emerald-700 flex items-center gap-1.5 min-w-0">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0"><polyline points="20 6 9 17 4 12"/></svg>
                <span className="truncate">
                  Syncing to{" "}
                  <strong>
                    {sheetName === sheetId
                      ? `…${sheetId.slice(-12)}`
                      : sheetName}
                  </strong>
                  {" "}— new contacts added automatically
                </span>
              </p>
              <a href={`https://docs.google.com/spreadsheets/d/${sheetId}`} target="_blank" rel="noopener noreferrer"
                className="text-[12px] font-semibold text-emerald-700 underline underline-offset-2 shrink-0">
                Open →
              </a>
            </div>
          )}
        </div>
      )}

      {connected && sheetId && (
        <button onClick={handleExport} disabled={exporting}
          className="h-9 flex items-center gap-2 rounded-lg border border-[#34a853]/30 bg-[#f0faf4] px-4 text-[13px] font-semibold text-[#1e7e34] hover:bg-[#dcf5e5] transition disabled:opacity-50">
          {exporting ? <><Spinner /> Exporting…</> : (
            <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>Export all contacts now</>
          )}
        </button>
      )}

      {msg && (
        <div className={`rounded-lg px-4 py-3 text-[13px] flex items-center justify-between gap-3 ${msg.ok ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-600 border border-red-200"}`}>
          <span>{msg.text}</span>
          {msg.url && <a href={msg.url} target="_blank" rel="noopener noreferrer" className="text-[12px] font-semibold underline underline-offset-2 shrink-0">Open Sheet →</a>}
        </div>
      )}
    </div>
  );
}

// ── Generic credentials form ──────────────────────────────────────────────

function CredentialsForm({ fields }: { fields: Field[] }) {
  const [values,         setValues]         = useState<Record<string, string>>({});
  const [savedValues,    setSavedValues]    = useState<Record<string, string>>({});
  const [saveState,      setSaveState]      = useState<SaveState>("idle");
  const [loaded,         setLoaded]         = useState(false);
  const [isConfigured,   setIsConfigured]   = useState(false);
  const [showDisconnect, setShowDisconnect] = useState(false);
  const [disconnecting,  setDisconnecting]  = useState(false);
  const router = useRouter();

  const hasChanges = loaded && fields.some((f) => (values[f.key] ?? "") !== (savedValues[f.key] ?? ""));

  useEffect(() => {
    fetch("/api/admin/integrations")
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) {
          setValues(j.data);
          setSavedValues(j.data);
          setIsConfigured(fields.filter((f) => !f.multiline).every((f) => j.data[f.key]?.trim()));
          setLoaded(true);
        }
      })
      .catch(() => {});
  }, [fields]);

  async function save() {
    setSaveState("saving");
    try {
      for (const f of fields) {
        await fetch("/api/admin/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: f.key, value: values[f.key] ?? "" }),
        });
      }
      setSavedValues({ ...values });
      const configured = fields.filter((f) => !f.multiline).every((f) => values[f.key]?.trim());
      setIsConfigured(configured);
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2500);
    } catch {
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 3000);
    }
  }

  async function disconnect() {
    setDisconnecting(true);
    try {
      for (const f of fields) {
        await fetch("/api/admin/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: f.key, value: "" }),
        });
      }
      setValues({});
      setIsConfigured(false);
      setShowDisconnect(false);
    } catch { /**/ }
    finally { setDisconnecting(false); }
  }

  if (!loaded) {
    return (
      <div className="space-y-5 animate-pulse">
        <div className="flex items-center gap-3 rounded-lg border border-[#e5e7eb] bg-white px-4 py-3">
          <div className="h-7 w-7 shrink-0 rounded-full bg-[#e5e7eb]" />
          <div className="space-y-1.5 flex-1">
            <div className="h-3 w-32 rounded bg-[#e5e7eb]" />
            <div className="h-2.5 w-56 rounded bg-[#e5e7eb]" />
          </div>
        </div>
        {fields.map((f) => (
          <div key={f.key} className="space-y-1.5">
            <div className="h-2.5 w-24 rounded bg-[#e5e7eb]" />
            <div className="h-9 w-full rounded-lg bg-[#e5e7eb]" />
            <div className="h-2 w-48 rounded bg-[#e5e7eb]" />
          </div>
        ))}
        <div className="h-9 w-28 rounded-lg bg-[#e5e7eb]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {fields.map((f) => (
        <div key={f.key}>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#64748b] mb-1.5">{f.label}</label>
          {f.multiline ? (
            <textarea
              rows={6}
              value={values[f.key] ?? ""}
              onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value }))}
              placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;...&#10;-----END RSA PRIVATE KEY-----"
              autoComplete="off"
              className={inputCls + " resize-y font-mono text-xs leading-relaxed"}
            />
          ) : (
            <input
              type={f.type === "password" ? "password" : f.type === "url" ? "url" : "text"}
              value={values[f.key] ?? ""}
              onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value }))}
              placeholder={f.type === "password" ? "••••••••••••" : f.type === "url" ? "https://" : ""}
              autoComplete="off"
              className={inputCls}
            />
          )}
          {f.hint && <p className="mt-1.5 text-[11px] text-[#64748b]">{f.hint}</p>}
        </div>
      ))}

      <div className="flex items-center gap-3 pt-4 border-t border-[#f1f5f9]">
        {(hasChanges || saveState !== "idle") && (
          <button onClick={save} disabled={saveState === "saving"}
            className="h-9 flex items-center gap-2 rounded-lg bg-[#0f172a] px-5 text-[13px] font-semibold text-white hover:bg-[#1e293b] transition disabled:opacity-50">
            {saveState === "saving" && <Spinner />}
            {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved ✓" : saveState === "error" ? "Error — retry" : isConfigured ? "Update" : "Save credentials"}
          </button>
        )}
        {isConfigured && (
          <button onClick={() => setShowDisconnect(true)}
            className="h-9 flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-4 text-[13px] font-semibold text-red-600 hover:bg-red-100 transition">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
              <path d="M18.36 6.64A9 9 0 0 1 20.77 15M5.63 5.63A9 9 0 1 0 15 20.77M8.71 2.71A9 9 0 0 1 18.36 6.64"/>
              <line x1="1" y1="1" x2="23" y2="23"/>
            </svg>
            Disconnect
          </button>
        )}
        {saveState === "error" && (
          <span className="text-[12px] text-red-500">Something went wrong. Check values and try again.</span>
        )}
      </div>

      {/* Disconnect confirmation modal */}
      {showDisconnect && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => !disconnecting && setShowDisconnect(false)}>
          <div onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-xl border border-[#e5e7eb] bg-white p-6 shadow-xl mx-4">
            <div className="flex items-center justify-center h-11 w-11 rounded-full bg-red-100 mx-auto mb-4">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-red-600">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
            <h3 className="text-[15px] font-bold text-[#0f172a] text-center mb-1">Disconnect integration?</h3>
            <p className="text-[13px] text-[#64748b] text-center mb-6">This will clear all saved credentials. Any features relying on this integration will stop working.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowDisconnect(false)} disabled={disconnecting}
                className="flex-1 h-9 rounded-lg border border-[#e5e7eb] text-[13px] font-semibold text-[#374151] hover:bg-[#f6f8fa] transition disabled:opacity-40">
                Cancel
              </button>
              <button onClick={disconnect} disabled={disconnecting}
                className="flex-1 h-9 flex items-center justify-center gap-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-[13px] font-semibold text-white transition disabled:opacity-40">
                {disconnecting ? <><Spinner /> Disconnecting…</> : "Yes, disconnect"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main detail page ──────────────────────────────────────────────────────

export default function IntegrationDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [isConfigured, setIsConfigured] = useState(false);
  const [statusLoaded, setStatusLoaded] = useState(false);

  useEffect(() => {
    const required: Record<string, string[]> = {
      "whatsapp":     ["wa_phone_number_id", "wa_access_token"],
      "woocommerce":  ["wc_url", "wc_consumer_key"],
      "bot-server":   ["bot_url", "inbox_webhook_secret"],
      "google-oauth": ["google_oauth_client_id", "google_oauth_client_secret"],
      "openai":       ["openai_api_key"],
      "ccavenue":     ["ccavenue_merchant_id", "ccavenue_access_code", "ccavenue_working_key"],
      "stripe":       ["stripe_secret_key"],
      "paypal":       ["paypal_client_id", "paypal_client_secret"],
    };
    const keys = required[slug];
    if (!keys) { setStatusLoaded(true); return; }
    fetch("/api/admin/integrations")
      .then((r) => r.json())
      .then((j) => { if (j.ok) setIsConfigured(keys.every((k) => j.data[k]?.trim())); })
      .catch(() => {})
      .finally(() => setStatusLoaded(true));
  }, [slug]);

  const meta = META[slug];

  if (!meta) {
    return (
      <div className="px-6 py-6 lg:px-8">
        <Link href="/admin/integrations" className="flex items-center gap-1.5 text-[13px] text-[#64748b] hover:text-[#0f172a] transition mb-6">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          Back to Integrations
        </Link>
        <p className="text-[13px] text-[#64748b]">Integration not found.</p>
      </div>
    );
  }

  const fields = FIELDS[slug];
  const flowsFields = FIELDS["whatsapp-flows"];
  const hasConfig = fields || slug === "google-sheets";

  return (
    <div className="px-6 py-6 lg:px-8">

      {/* Breadcrumb */}
      <Link href="/admin/integrations"
        className="inline-flex items-center gap-1.5 text-[12px] text-[#64748b] hover:text-[#0f172a] transition mb-5">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        Integrations
        <span className="text-[#d1d5db]">/</span>
        <span className="text-[#0f172a]">{meta.name}</span>
      </Link>

      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className={`h-14 w-14 rounded-xl ${meta.iconBg} flex items-center justify-center shrink-0`}>
          {meta.icon}
        </div>
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold text-[#0f172a]">{meta.name}</h1>
            {statusLoaded && (
              isConfigured
                ? <span className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Connected
                  </span>
                : <span className="flex items-center gap-1.5 rounded-full border border-[#e5e7eb] bg-[#f6f8fa] px-2.5 py-0.5 text-[11px] font-semibold text-[#9ca3af]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#d1d5db]" />Not connected
                  </span>
            )}
          </div>
          <p className="text-[12px] font-medium text-[#64748b] mt-0.5">{meta.category}</p>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 max-w-5xl">

        {/* Left — About + What's included */}
        <div className="space-y-4">
          <div className="rounded-xl border border-[#e5e7eb] bg-[#f6f8fa] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#64748b] mb-2">About</p>
            <p className="text-[13px] text-[#374151] leading-relaxed">{meta.desc}</p>
          </div>

          <div className="rounded-xl border border-[#e5e7eb] bg-[#f6f8fa] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#64748b] mb-3">What&apos;s included</p>
            <ul className="space-y-2.5">
              {meta.features.map((feat, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <div className="mt-0.5 h-4 w-4 shrink-0 rounded-md bg-[#0f172a]/8 flex items-center justify-center">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-2.5 w-2.5 text-[#0f172a]"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <p className="text-[12px] text-[#374151] leading-relaxed">{feat}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Right — Credentials */}
        <div className="space-y-4">
          {hasConfig && (
            <div className="rounded-xl border border-[#e5e7eb] bg-[#f6f8fa] p-5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#64748b] mb-4">Credentials</p>
              {slug === "google-sheets" ? (
                <GoogleSheetsConfig />
              ) : fields ? (
                <CredentialsForm fields={fields} />
              ) : null}
            </div>
          )}

          {/* WhatsApp Flows block — only on whatsapp slug */}
          {slug === "whatsapp" && (
            <div className="rounded-xl border border-[#e5e7eb] bg-[#f6f8fa] p-5">
              <div className="flex items-center gap-2.5 mb-1">
                <div className="h-7 w-7 rounded-lg bg-[#25D366]/10 flex items-center justify-center shrink-0">
                  <svg viewBox="0 0 24 24" fill="none" stroke="#25D366" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                    <rect x="3" y="3" width="7" height="5" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/>
                    <rect x="8" y="16" width="8" height="5" rx="1"/>
                    <path d="M6.5 8v3a2 2 0 002 2h7a2 2 0 002-2V8M12 11v5"/>
                  </svg>
                </div>
                <p className="text-[13px] font-bold text-[#0f172a]">WhatsApp Flows</p>
              </div>
              <p className="text-[12px] text-[#64748b] leading-relaxed mb-4">
                WhatsApp Flows lets customers complete checkout, fill forms, and pick delivery slots — all inside WhatsApp without leaving the chat. Paste your Flow ID from Meta and the RSA private key to enable encrypted communication between Meta and this portal.
              </p>
              <CredentialsForm fields={flowsFields} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
