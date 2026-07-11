"use client";

import { useState, useEffect, use, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Option = {
  id?: number; label: string; value: string;
  description: string; nextStepKey: string;
  dataSource: string; sortOrder: number;
  customApiUrl: string; customApiPath: string;
  customApiLabel: string; customApiValue: string;
};
type Step = {
  id?: number; _uid?: number;
  stepKey: string; message: string;
  inputType: "button" | "list" | "message" | "search";
  isEntry: boolean; showProductCard: boolean; handoffToAgent: boolean;
  imageUrl: string; sortOrder: number; options: Option[];
  _x?: number; _y?: number; disabled?: boolean; _imgH?: number;
  captureVar?: string; label?: string; isFallback?: boolean;
};
type StepIssue = { severity: "error" | "warn"; label: string };
function validateFlow(flow: Flow): Map<string, StepIssue[]> {
  const out = new Map<string, StepIssue[]>();
  const add = (k: string, i: StepIssue) => { if (!out.has(k)) out.set(k, []); out.get(k)!.push(i); };
  const keys = new Set(flow.steps.map((s) => s.stepKey));
  const entry = flow.steps.find((s) => s.isEntry);
  const reachable = new Set<string>();
  if (entry) {
    const q = [entry.stepKey];
    while (q.length) {
      const k = q.shift()!; if (reachable.has(k)) continue; reachable.add(k);
      flow.steps.find((s) => s.stepKey === k)?.options.forEach((o) => { if (o.nextStepKey && keys.has(o.nextStepKey)) q.push(o.nextStepKey); });
    }
  }
  for (const s of flow.steps) {
    const hasDynamic = s.options.some((o) => o.dataSource !== "static");
    if (!s.showProductCard && !hasDynamic && !s.message.trim()) add(s.stepKey, { severity: "warn", label: "No message" });
    if (!s.showProductCard && (s.inputType === "button" || s.inputType === "list") && s.options.length === 0) add(s.stepKey, { severity: "error", label: "No options" });
    for (const o of s.options) if (o.nextStepKey && !keys.has(o.nextStepKey)) add(s.stepKey, { severity: "error", label: `Broken link → ${o.nextStepKey}` });
    if (entry && !reachable.has(s.stepKey) && !s.isFallback) add(s.stepKey, { severity: "warn", label: "Unreachable" });
  }
  return out;
}
type Flow = {
  id: number; name: string; description: string;
  triggerKeywords: string; isActive: boolean; isFallback: boolean; steps: Step[];
};

const CARD_W        = 260;
const CARD_HEADER_H = 46;
const CARD_IMAGE_H  = 120;
const CARD_MSG_H    = 58;
const CARD_OPT_H    = 34;
const CARD_FOOT_H   = 36;
function inputDotY(_s: Step)            { return CARD_HEADER_H / 2; }
function imgH(s: Step) { return s.imageUrl ? (s._imgH ?? CARD_IMAGE_H) : 0; }
function outputDotY(s: Step, i: number) { return CARD_HEADER_H + imgH(s) + CARD_MSG_H + i * CARD_OPT_H + CARD_OPT_H / 2; }

function slugify(s: string) { return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""); }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normaliseFlow(d: any): Flow {
  return {
    ...d, description: d.description ?? "", triggerKeywords: d.triggerKeywords ?? "", isFallback: d.isFallback ?? false,
    steps: (d.steps ?? []).map((s: Step, i: number) => ({
      ...s, showProductCard: s.showProductCard ?? false, handoffToAgent: s.handoffToAgent ?? false, imageUrl: s.imageUrl ?? "", isFallback: s.isFallback ?? false,
      label: s.label ?? undefined, captureVar: s.captureVar ?? undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      _x: s._x ?? (s as any).positionX ?? 80 + i * 320, _y: s._y ?? (s as any).positionY ?? 120,
      options: (s.options ?? []).map((o: Option) => ({
        ...o, description: o.description ?? "", nextStepKey: o.nextStepKey ?? "",
        customApiUrl: o.customApiUrl ?? "", customApiPath: o.customApiPath ?? "",
        customApiLabel: o.customApiLabel ?? "", customApiValue: o.customApiValue ?? "",
      })),
    })),
  };
}
function newOption(n = 0): Option { return { label: "", value: "", description: "", nextStepKey: "", dataSource: "static", sortOrder: n, customApiUrl: "", customApiPath: "", customApiLabel: "", customApiValue: "" }; }
function newStep(n = 0, x = 80, y = 120): Step { return { stepKey: `step_${n + 1}`, message: "", inputType: "button", isEntry: n === 0, isFallback: false, showProductCard: false, handoffToAgent: false, imageUrl: "", sortOrder: n, options: [newOption()], _x: x, _y: y }; }
function newFallbackStep(n = 1): Step { return { stepKey: "fallback", message: "Sorry, I didn't understand that.\n\nHere's what I can help you with:", inputType: "button", isEntry: false, isFallback: true, showProductCard: false, handoffToAgent: false, imageUrl: "", sortOrder: n, options: [{ ...newOption(0), label: "Main Menu", value: "main_menu", nextStepKey: "step_1" }], _x: 80, _y: 340 }; }

type IP = { size?: number; className?: string };
function Svg({ children, s = 16, cls = "" }: { children: React.ReactNode; s?: number; cls?: string }) {
  return <svg viewBox="0 0 24 24" width={s} height={s} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={cls}>{children}</svg>;
}
const IcMsg  = (p: IP) => <Svg s={p.size} cls={p.className}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></Svg>;
const IcBtn  = (p: IP) => <Svg s={p.size} cls={p.className}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></Svg>;
const IcList = (p: IP) => <Svg s={p.size} cls={p.className}><path d="M9 6h11M9 12h11M9 18h11M5 6v.01M5 12v.01M5 18v.01"/></Svg>;
const IcSrch = (p: IP) => <Svg s={p.size} cls={p.className}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></Svg>;
const IcBack = (p: IP) => <Svg s={p.size} cls={p.className}><path d="M19 12H5M12 5l-7 7 7 7"/></Svg>;
const IcDel  = (p: IP) => <Svg s={p.size ?? 13} cls={p.className}><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></Svg>;
const IcPlus = (p: IP) => <Svg s={p.size} cls={p.className}><path d="M12 5v14M5 12h14"/></Svg>;
const IcX    = (p: IP) => <Svg s={p.size ?? 13} cls={p.className}><path d="M18 6L6 18M6 6l12 12"/></Svg>;
const IcSave = (p: IP) => <Svg s={p.size} cls={p.className}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8"/></Svg>;
const IcGear = (p: IP) => <Svg s={p.size} cls={p.className}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></Svg>;
const IcEye  = (p: IP) => <Svg s={p.size} cls={p.className}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></Svg>;
const IcImg    = (p: IP) => <Svg s={p.size} cls={p.className}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></Svg>;
const IcCopy   = (p: IP) => <Svg s={p.size} cls={p.className}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></Svg>;
const IcUndo   = (p: IP) => <Svg s={p.size} cls={p.className}><polyline points="9 14 4 9 9 4"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></Svg>;
const IcRedo   = (p: IP) => <Svg s={p.size} cls={p.className}><polyline points="15 14 20 9 15 4"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/></Svg>;
const IcUnlink = (p: IP) => <Svg s={p.size} cls={p.className}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/><line x1="2" y1="2" x2="22" y2="22"/></Svg>;
const IcBan    = (p: IP) => <Svg s={p.size} cls={p.className}><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></Svg>;
const IcDup    = (p: IP) => <Svg s={p.size} cls={p.className}><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></Svg>;
const IcCheck  = (p: IP) => <Svg s={p.size} cls={p.className}><polyline points="20 6 9 17 4 12"/></Svg>;

type ST = "button" | "list" | "message" | "search";
const CFG: Record<ST, { label: string; color: string; bg: string; ic: (p: IP) => React.ReactElement }> = {
  button:  { label: "Buttons",  color: "#f59e0b", bg: "#fffbeb", ic: IcBtn },
  list:    { label: "List",      color: "#3b82f6", bg: "#eff6ff", ic: IcList },
  message: { label: "Message",   color: "#ef4444", bg: "#fef2f2", ic: IcMsg },
  search:  { label: "Search",    color: "#8b5cf6", bg: "#f5f3ff", ic: IcSrch },
};
const DS = [
  { v: "static",                           l: "Manual options" },
  { v: "woocommerce_categories",           l: "WC Categories" },
  { v: "woocommerce_products",             l: "All Products" },
  { v: "woocommerce_products_by_category", l: "Products by Category" },
  { v: "woocommerce_search",               l: "WC Product Search" },
  { v: "custom_api",                       l: "Custom API" },
  { v: "custom_api_search",                l: "Custom API Search" },
];
const PROD_SRC  = ["woocommerce_products","woocommerce_products_by_category","woocommerce_search"];
const NEEDS_URL = ["custom_api","custom_api_search"];
const INP = "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-100 placeholder:text-gray-300";
const LBL = "block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2";

type LinkLine = { x1: number; y1: number; x2: number; y2: number };

// ── Module picker ─────────────────────────────────────────────────────────────
type ModuleDef = { id: string; label: string; desc: string; inputType: ST; dataSource?: string; stepPatch?: Partial<Step>; icon: React.ReactNode; color: string; bg: string };
type ModuleGroup = { id: string; label: string; icon: React.ReactNode; color: string; modules: ModuleDef[] };

const IcWoo   = <svg viewBox="0 0 24 24" fill="currentColor" width={18} height={18}><path d="M2.2 2h19.6C22.99 2 24 3.01 24 4.2v10.08c0 1.19-1.01 2.2-2.2 2.2H13.5l1.63 3.27-4.36-3.27H2.2C1.01 16.48 0 15.47 0 14.28V4.2C0 3.01 1.01 2 2.2 2z"/></svg>;
const IcMsgMod = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={18} height={18}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>;
const IcHandoff = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={18} height={18}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
const IcApi    = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={18} height={18}><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>;

const MODULE_GROUPS: ModuleGroup[] = [
  {
    id: "messages", label: "Messages", color: "#3b82f6", icon: IcMsgMod,
    modules: [
      { id: "msg_text",    label: "Text Message",   desc: "Send a plain text message, no reply needed", inputType: "message", color: "#3b82f6", bg: "#eff6ff", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> },
      { id: "msg_buttons", label: "Buttons",        desc: "Up to 3 quick-reply buttons", inputType: "button", color: "#f59e0b", bg: "#fffbeb", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><rect x="2" y="7" width="20" height="4" rx="2"/><rect x="2" y="13" width="20" height="4" rx="2"/></svg> },
      { id: "msg_list",    label: "List Menu",      desc: "Scrollable list with up to 10 options", inputType: "list", color: "#10b981", bg: "#ecfdf5", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg> },
    ],
  },
  {
    id: "woocommerce", label: "WooCommerce", color: "#7f54b3", icon: IcWoo,
    modules: [
      { id: "wc_categories",  label: "Categories",          desc: "Show all enabled WooCommerce categories as a list", inputType: "list", dataSource: "woocommerce_categories",           color: "#7f54b3", bg: "#f5f3ff", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z"/></svg> },
      { id: "wc_by_cat",      label: "Products by Category", desc: "Show products filtered by a selected category", inputType: "list", dataSource: "woocommerce_products_by_category", color: "#7f54b3", bg: "#f5f3ff", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg> },
      { id: "wc_all_products", label: "All Products",        desc: "Browse all published products", inputType: "list", dataSource: "woocommerce_products",                color: "#7f54b3", bg: "#f5f3ff", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg> },
      { id: "wc_search",      label: "Product Search",       desc: "Let customer search products by keyword", inputType: "search", dataSource: "woocommerce_search",              color: "#8b5cf6", bg: "#f5f3ff", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> },
      { id: "wc_product_card", label: "Product Detail Card",  desc: "Show full product card — image, price, description & add to cart", inputType: "message", stepPatch: { showProductCard: true }, color: "#059669", bg: "#ecfdf5", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/><circle cx="9" cy="10" r="1.5"/><path d="M13 8h4M13 11h4"/></svg> },
    ],
  },
  {
    id: "handoff", label: "Handoff", color: "#ef4444", icon: IcHandoff,
    modules: [
      { id: "handoff_agent", label: "Hand off to Agent", desc: "Notify Team Inbox — bot keeps running until agent takes over", inputType: "message", stepPatch: { handoffToAgent: true }, color: "#ef4444", bg: "#fef2f2", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
    ],
  },
  {
    id: "custom", label: "Custom API", color: "#64748b", icon: IcApi,
    modules: [
      { id: "custom_api",        label: "Custom API List",   desc: "Fetch options from your own API endpoint", inputType: "list",   dataSource: "custom_api",        color: "#64748b", bg: "#f8fafc", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg> },
      { id: "custom_api_search", label: "Custom API Search", desc: "Search results from your own API endpoint",  inputType: "search", dataSource: "custom_api_search", color: "#64748b", bg: "#f8fafc", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><polyline points="16 18 22 12 16 6"/></svg> },
    ],
  },
];

function ModulePicker({ onSelect, onClose }: { onSelect: (m: ModuleDef) => void; onClose: () => void }) {
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const inpRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inpRef.current?.focus(); }, []);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const q = search.toLowerCase();
  const filtered = q
    ? MODULE_GROUPS.map((g) => ({ ...g, modules: g.modules.filter((m) => m.label.toLowerCase().includes(q) || m.desc.toLowerCase().includes(q)) })).filter((g) => g.modules.length > 0)
    : MODULE_GROUPS;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] max-h-[80vh] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-gray-100">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">Add Module</p>
          <div className="relative">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300 pointer-events-none">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input ref={inpRef} value={search} onChange={(e) => { setSearch(e.target.value); setExpanded(null); }}
              placeholder="Search modules… (e.g. categories, search, buttons)"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm text-gray-700 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-100 focus:border-purple-300" />
          </div>
        </div>

        {/* Module groups */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {filtered.map((group) => {
            const isOpen = q ? true : expanded === group.id;
            return (
              <div key={group.id} className="rounded-xl border border-gray-100 overflow-hidden">
                {/* Group header */}
                {!q && (
                  <button type="button" onClick={() => setExpanded(isOpen ? null : group.id)}
                    className="w-full flex items-center gap-3 px-3.5 py-3 hover:bg-gray-50 transition text-left">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0" style={{ backgroundColor: group.color + "18", color: group.color }}>
                      {group.icon}
                    </span>
                    <span className="flex-1 font-semibold text-sm text-gray-700">{group.label}</span>
                    <span className="text-[11px] text-gray-300 mr-1">{group.modules.length} modules</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={["h-4 w-4 text-gray-300 transition-transform", isOpen ? "rotate-180" : ""].join(" ")}>
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </button>
                )}

                {/* Modules */}
                {isOpen && (
                  <div className={["space-y-0.5", !q ? "border-t border-gray-100 bg-gray-50/50 p-1.5" : ""].join(" ")}>
                    {group.modules.map((mod) => (
                      <button key={mod.id} type="button" onClick={() => { onSelect(mod); onClose(); }}
                        className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-white hover:shadow-sm transition group">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: mod.bg, color: mod.color }}>
                          {mod.icon}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-700 group-hover:text-gray-900">{mod.label}</p>
                          <p className="text-[11px] text-gray-400 leading-snug">{mod.desc}</p>
                        </div>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4 text-gray-200 group-hover:text-gray-400 shrink-0 transition">
                          <path d="M9 18l6-6-6-6"/>
                        </svg>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="px-4 py-2.5 border-t border-gray-100 text-[11px] text-gray-300 text-center">
          Press <kbd className="bg-gray-100 rounded px-1 py-0.5 text-gray-500 font-mono">Esc</kbd> to close
        </div>
      </div>
    </>
  );
}

function Connections({ steps, sel, linkLine, onConnContextMenu, onDisconnect }: {
  steps: Step[]; sel: string | null; linkLine: LinkLine | null;
  onConnContextMenu: (screenX: number, screenY: number, fromKey: string, optIdx: number) => void;
  onDisconnect: (fromKey: string, optIdx: number) => void;
}) {
  const [hov, setHov] = useState<string | null>(null);
  const byKey: Record<string, Step> = {};
  steps.forEach((s) => { if (s.stepKey) byKey[s.stepKey] = s; });
  return <>
    {steps.flatMap((step) => step.options.map((opt, oi) => {
      const tgt = opt.nextStepKey ? byKey[opt.nextStepKey] : null;
      if (!tgt) return null;
      const connId = `${step.stepKey}-${oi}`;
      const x1 = (step._x ?? 0) + CARD_W, y1 = (step._y ?? 0) + outputDotY(step, oi);
      const x2 = (tgt._x ?? 0),           y2 = (tgt._y ?? 0) + inputDotY(tgt);
      const pull = Math.max(60, Math.abs(x2 - x1) * 0.45);
      const active  = sel === step.stepKey || sel === tgt.stepKey;
      const isHov   = hov === connId;
      const color   = isHov ? "#ef4444" : active ? CFG[step.inputType].color : "#94a3b8";
      const d       = `M${x1},${y1} C${x1+pull},${y1} ${x2-pull},${y2} ${x2},${y2}`;
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      return (
        <g key={connId}
          onMouseEnter={() => setHov(connId)} onMouseLeave={() => setHov(null)}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); if (!step.isFallback) onConnContextMenu(e.clientX, e.clientY, step.stepKey, oi); }}>
          {/* Wide invisible stroke for easy hover targeting */}
          <path d={d} fill="none" stroke="transparent" strokeWidth={16} style={{ pointerEvents: "stroke", cursor: "pointer" }} />
          {/* Visible line */}
          <path d={d} fill="none" stroke={color}
            strokeWidth={isHov ? 2.5 : active ? 2.5 : 1.5}
            strokeDasharray={isHov ? "none" : active ? "none" : "7 4"}
            strokeLinecap="round" opacity={isHov ? 1 : active ? 1 : 0.65}
            style={{ pointerEvents: "none" }} />
          {/* Endpoint dot — not for entry or fallback targets */}
          {!tgt.isEntry && !tgt.isFallback && (
            <circle cx={x2} cy={y2} r={isHov ? 5 : 4} fill={isHov ? "#ef4444" : "white"}
              stroke={color} strokeWidth={1.5} style={{ pointerEvents: "none" }} />
          )}
          {/* Hover: clickable ✕ button at midpoint — hidden for fallback card's own connections */}
          {isHov && !step.isFallback && (
            <g onClick={(e) => { e.stopPropagation(); onDisconnect(step.stepKey, oi); setHov(null); }}
              style={{ cursor: "pointer" }}>
              <circle cx={mx} cy={my} r={11} fill="white" stroke="#ef4444" strokeWidth={1.5} />
              <circle cx={mx} cy={my} r={8} fill="#ef4444" />
              <line x1={mx-3.5} y1={my-3.5} x2={mx+3.5} y2={my+3.5} stroke="white" strokeWidth={2} strokeLinecap="round" />
              <line x1={mx+3.5} y1={my-3.5} x2={mx-3.5} y2={my+3.5} stroke="white" strokeWidth={2} strokeLinecap="round" />
            </g>
          )}
        </g>
      );
    }))}
    {/* In-progress drag link line */}
    {linkLine && (() => {
      const { x1, y1, x2, y2 } = linkLine;
      const pull = Math.max(60, Math.abs(x2 - x1) * 0.45);
      return (
        <g style={{ pointerEvents: "none" }}>
          <path d={`M${x1},${y1} C${x1+pull},${y1} ${x2-pull},${y2} ${x2},${y2}`}
            fill="none" stroke="#3b82f6" strokeWidth={2} strokeDasharray="6 3" strokeLinecap="round" opacity={0.8} />
          <circle cx={x2} cy={y2} r={5} fill="#3b82f6" opacity={0.5} />
        </g>
      );
    })()}
  </>;
}

function StepNode({ step, isSelected, isMultiSel, issues, onSelect, onDrag, onDelete, onStartLink, onRightClick, onImgLoad }: {
  step: Step; isSelected: boolean; isMultiSel: boolean; issues: StepIssue[];
  onSelect: (isShift: boolean) => void; onDrag: (dx: number, dy: number) => void;
  onDelete: () => void; onStartLink: (optIdx: number) => void;
  onRightClick: (x: number, y: number) => void; onImgLoad: (h: number) => void;
}) {
  const cfg     = step.showProductCard ? { label: "Product Card", color: "#059669", bg: "#ecfdf5", ic: (p: IP) => <Svg s={p.size} cls={p.className}><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/><circle cx="8" cy="9" r="1.5"/><path d="M13 7h5M13 10h5"/></Svg> } : step.isFallback ? { ...CFG[step.inputType], color: "#64748b" } : CFG[step.inputType];
  const dragged = useRef(false);
  const start   = useRef<{ x: number; y: number } | null>(null);

  function handleDown(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest("[data-nd]")) return;
    e.preventDefault();
    dragged.current = false;
    start.current = { x: e.clientX, y: e.clientY };
    function mm(ev: MouseEvent) {
      const dx = ev.clientX - (start.current?.x ?? ev.clientX);
      const dy = ev.clientY - (start.current?.y ?? ev.clientY);
      if (Math.abs(dx) + Math.abs(dy) > 3) dragged.current = true;
      onDrag(dx, dy);
      start.current = { x: ev.clientX, y: ev.clientY };
    }
    const shiftKey = e.shiftKey;
    function mu() {
      if (!dragged.current) onSelect(shiftKey);
      start.current = null;
      window.removeEventListener("mousemove", mm);
      window.removeEventListener("mouseup", mu);
    }
    window.addEventListener("mousemove", mm);
    window.addEventListener("mouseup", mu);
  }

  // Pre-compute output dot Y positions relative to card top (used for both dots and SVG lines)
  const optDotYs = step.options.map((_, i) => outputDotY(step, i));
  const emptyDotY = CARD_HEADER_H + imgH(step) + CARD_MSG_H + CARD_OPT_H / 2;

  return (
    <div onMouseDown={handleDown} data-node="1"
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onRightClick(e.clientX, e.clientY); }}
      style={{ width: CARD_W, cursor: "grab", userSelect: "none", position: "absolute", opacity: step.disabled ? 0.45 : 1 }}>

      {/* ── Label above card — centered ── */}
      {step.label && (
        <div style={{ position: "absolute", bottom: "100%", left: "50%", transform: "translateX(-50%)", marginBottom: 6, zIndex: 5, whiteSpace: "nowrap" }}>
          <span className="inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-semibold shadow-sm"
            style={{ background: cfg.color, color: "white", opacity: 0.92 }}>
            <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
            {step.label}
          </span>
        </div>
      )}

      {/* ── Input dot — hidden for entry/start step and fallback (nothing connects TO them) ── */}
      {!step.isEntry && !step.isFallback && (
        <div style={{ position: "absolute", left: -8, top: inputDotY(step) - 8, width: 16, height: 16, zIndex: 10 }}>
          <div className="w-3.5 h-3.5 rounded-full bg-white border-2 shadow-sm" style={{ borderColor: cfg.color }} />
        </div>
      )}

      {/* ── Output dots — OUTSIDE overflow:hidden, draggable to connect ── */}
      {step.options.length === 0 ? (
        <div data-nd="1" style={{ position: "absolute", right: -8, top: emptyDotY - 8, width: 16, height: 16, zIndex: 10, cursor: "crosshair" }}
          onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); onStartLink(0); }}>
          <div className="w-3.5 h-3.5 rounded-full bg-white border-2 shadow-sm hover:scale-125 transition-transform" style={{ borderColor: cfg.color }} />
        </div>
      ) : optDotYs.map((dotY, i) => (
        <div key={i} data-nd="1" style={{ position: "absolute", right: -8, top: dotY - 8, width: 16, height: 16, zIndex: 10, cursor: "crosshair" }}
          onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); onStartLink(i); }}>
          <div className="w-3.5 h-3.5 rounded-full bg-white border-2 shadow-sm hover:scale-125 transition-transform" style={{ borderColor: cfg.color }} />
        </div>
      ))}

      {/* ── Card (overflow:hidden for rounded corners) ── */}
      <div className={`rounded-2xl shadow-md border-2 overflow-hidden bg-white transition-all ${isSelected ? "shadow-xl border-blue-500 ring-4 ring-blue-100" : isMultiSel ? "border-blue-400 ring-4 ring-blue-100 shadow-lg" : "border-transparent hover:shadow-xl"}`}>
        {/* Header */}
        <div className="flex items-center justify-between px-3.5 gap-2"
          style={{ backgroundColor: cfg.color, height: CARD_HEADER_H, color: "white" }}>
          <div className="flex items-center gap-2 min-w-0">
            <cfg.ic size={15} className="shrink-0 opacity-90" />
            <span className="text-[13px] font-semibold truncate">{step.stepKey || "Untitled"}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0" data-nd="1">
            {step.isEntry && <span className="text-[9px] font-bold bg-white/25 rounded-full px-1.5 py-0.5 uppercase tracking-wide">Start</span>}
            {step.isFallback && (
              <span className="inline-flex items-center gap-0.5 text-[9px] font-bold bg-black/20 rounded-full px-1.5 py-0.5 uppercase tracking-wide">
                <svg width={7} height={7} viewBox="0 0 24 24" fill="currentColor"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                Fallback
              </span>
            )}
            {issues.length > 0 && (
              <span title={issues.map((i) => i.label).join(" · ")}
                className={`text-[9px] font-bold rounded-full px-1.5 py-0.5 ${issues.some((i) => i.severity === "error") ? "bg-red-500 text-white" : "bg-amber-400 text-white"}`}>
                {issues.length > 1 ? `${issues.length}` : "!"}</span>
            )}
            {step.isFallback
              ? <span className="rounded-md p-1 opacity-50" title="Fallback card cannot be deleted">
                  <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </span>
              : <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(); }}
                  className="rounded-md p-1 hover:bg-white/20 transition"><IcDel /></button>
            }
          </div>
        </div>
        {/* Image */}
        {step.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={step.imageUrl} alt=""
            style={{ width: "100%", maxHeight: 200, objectFit: "cover", objectPosition: "center top", display: "block" }}
            onLoad={(e) => {
              const el = e.currentTarget;
              const h = Math.min(200, Math.max(80, Math.round(CARD_W * el.naturalHeight / el.naturalWidth)));
              onImgLoad(h);
            }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
        )}
        {/* Product card preview or normal message/options */}
        {step.showProductCard ? (
          <div className="mx-3 my-2.5 rounded-xl border border-emerald-200 overflow-hidden shadow-sm">
            {/* Product image placeholder */}
            <div className="bg-emerald-50 h-16 flex flex-col items-center justify-center border-b border-emerald-100 gap-1">
              <svg viewBox="0 0 24 24" fill="none" stroke="#6ee7b7" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              <span className="text-[8px] text-emerald-300 font-medium">Product Image</span>
            </div>
            {/* Fields */}
            <div className="px-2.5 py-2 space-y-1 bg-white">
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] font-bold text-gray-700">Product Name</span>
                <span className="text-[8px] bg-emerald-100 text-emerald-600 rounded px-1">auto</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[9px] text-emerald-600 font-semibold">Price from —</span>
                <span className="text-[8px] text-gray-400 italic">Variations</span>
              </div>
            </div>
            {/* CTA button */}
            <div className="px-2.5 pb-2.5 bg-white">
              <div className="rounded-lg bg-[#25d366] flex items-center justify-center py-1.5 gap-1">
                <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={9} height={9}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                <span className="text-[9px] font-bold text-white tracking-wide">Order Now</span>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="px-3.5 py-2.5" style={{ height: CARD_MSG_H, overflow: "hidden" }}>
              <p className="text-[11px] text-gray-600 line-clamp-3" style={{ whiteSpace: "normal", wordBreak: "break-word" }}>
                {step.message
                  ? step.message.replace(/\n+/g, " ")
                  : step.options.some((o) => o.dataSource !== "static")
                    ? <span className="italic text-blue-300">Optional intro message…</span>
                    : <span className="italic text-gray-300">No message yet…</span>}
              </p>
            </div>
            {step.inputType === "message" ? null : step.options.length === 0 ? (
              <div className="border-t border-gray-100 px-3.5 flex items-center text-gray-300 italic text-[11px]" style={{ height: CARD_OPT_H }}>
                No options
              </div>
            ) : step.options.map((opt, i) => {
              const src = DS.find((s) => s.v === opt.dataSource);
              const dyn = opt.dataSource !== "static";
              return (
                <div key={i} className="flex items-center justify-between border-t border-gray-100 px-3.5 pr-5" style={{ height: CARD_OPT_H }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: cfg.color }} />
                    <span className="text-[11px] font-medium text-gray-700 truncate">
                      {dyn ? <span className="text-gray-400 italic">{src?.l}</span> : (opt.label || <span className="text-gray-300">Option {i+1}</span>)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 text-gray-300">
                    {opt.nextStepKey && <span className="text-[10px] bg-gray-100 text-gray-500 px-1 rounded font-mono">{opt.nextStepKey}</span>}
                    <svg viewBox="0 0 12 12" width={10} height={10} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M2 6h8M7 3l3 3-3 3"/></svg>
                  </div>
                </div>
              );
            })}
          </>
        )}
        {/* Footer */}
        <div className="border-t border-gray-100 bg-gray-50/70 flex items-center justify-between px-3.5" style={{ height: CARD_FOOT_H }}>
          <span className="text-[10px] text-gray-400 font-mono truncate max-w-[120px]">{step.stepKey}</span>
          {issues.length > 0
            ? <span className={`text-[10px] truncate max-w-[110px] ${issues.some((i) => i.severity === "error") ? "text-red-400" : "text-amber-500"}`}>{issues[0].label}</span>
            : <span className="text-[10px] text-gray-400">{step.captureVar ? `saves {${step.captureVar}}` : step.inputType === "search" ? "live search" : step.inputType === "message" ? "auto-advance" : step.showProductCard ? "product card" : `${step.options.length} opt`}</span>
          }
        </div>
      </div>
    </div>
  );
}

function ApiFields({ opt, isSearch, onChange }: { opt: Option; isSearch: boolean; onChange: (o: Option) => void }) {
  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-2">
      <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">API Configuration</p>
      <div>
        <label className="block text-[10px] font-semibold text-gray-400 mb-1">{isSearch ? "Endpoint URL — use {query} for search" : "Endpoint URL"}</label>
        <input value={opt.customApiUrl} onChange={(e) => onChange({ ...opt, customApiUrl: e.target.value })}
          placeholder={isSearch ? "https://yoursite.com/api?q={query}" : "https://yoursite.com/api/items"}
          className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs font-mono text-gray-800 focus:outline-none placeholder:text-gray-300" />
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {[{k:"customApiPath",l:"Items path",p:"data.items"},{k:"customApiLabel",l:"Label field",p:"name"},{k:"customApiValue",l:"Value field",p:"id"}].map((f) => (
          <div key={f.k}>
            <label className="block text-[10px] font-semibold text-gray-400 mb-1">{f.l}</label>
            <input value={(opt as unknown as Record<string,string>)[f.k] || ""}
              onChange={(e) => onChange({ ...opt, [f.k]: e.target.value })}
              placeholder={f.p}
              className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] font-mono text-gray-700 focus:outline-none placeholder:text-gray-300" />
          </div>
        ))}
      </div>
    </div>
  );
}

function OptEditor({ opt, index, stepKeys, onChange, onDelete, isBtn, isFallbackStep }: {
  opt: Option; index: number; stepKeys: string[];
  onChange: (o: Option) => void; onDelete: () => void; isBtn: boolean; isFallbackStep?: boolean;
}) {
  const dyn  = opt.dataSource !== "static";
  const nurl = NEEDS_URL.includes(opt.dataSource);
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className="h-5 w-5 shrink-0 rounded-full bg-white border border-gray-200 text-[10px] font-bold text-gray-400 flex items-center justify-center">{index+1}</span>
        {dyn ? (
          <span className="flex-1 text-sm text-gray-300 italic truncate">Auto-filled from {DS.find((s) => s.v === opt.dataSource)?.l ?? "data source"}</span>
        ) : (
          <input value={opt.label} maxLength={isBtn ? 20 : 24}
            onChange={(e) => onChange({ ...opt, label: e.target.value, value: slugify(e.target.value) })}
            placeholder="Option label..."
            className="flex-1 text-sm text-gray-800 bg-transparent focus:outline-none min-w-0 placeholder:text-gray-300" />
        )}
        {!isFallbackStep && <button type="button" onClick={onDelete} className="text-gray-300 hover:text-red-400 transition"><IcX /></button>}
      </div>
      <div className="px-3 pb-3 border-t border-gray-200 pt-2.5 space-y-2">
        <div className={isFallbackStep ? "w-full" : "grid grid-cols-2 gap-2"}>
          {!isFallbackStep && (
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 mb-1">Data source</label>
              <select value={opt.dataSource} onChange={(e) => onChange({ ...opt, dataSource: e.target.value })}
                className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 focus:outline-none">
                {DS.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-[10px] font-semibold text-gray-400 mb-1">Goes to</label>
            <select value={opt.nextStepKey} onChange={(e) => onChange({ ...opt, nextStepKey: e.target.value })}
              className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 focus:outline-none">
              <option value="">End flow</option>
              {stepKeys.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
        </div>
        {!isBtn && !dyn && (
          <div>
            <label className="block text-[10px] font-semibold text-gray-400 mb-1">Subtitle</label>
            <input value={opt.description} onChange={(e) => onChange({ ...opt, description: e.target.value })}
              placeholder="Short description..."
              className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 focus:outline-none placeholder:text-gray-300" />
          </div>
        )}
        {nurl && <ApiFields opt={opt} isSearch={opt.dataSource === "custom_api_search"} onChange={onChange} />}
      </div>
    </div>
  );
}

function ImageInput({ onUploaded }: { onUploaded: (url: string) => void }) {
  const [tab, setTab]         = useState<"url" | "upload">("upload");
  const [urlDraft, setUrlDraft] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/flows/upload", { method: "POST", body: fd }).then((r) => r.json());
      if (!res.ok) { setError(res.error ?? "Upload failed"); return; }
      onUploaded(res.data.url);
    } catch {
      setError("Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b border-gray-100">
        {(["upload", "url"] as const).map((t) => (
          <button key={t} type="button" onClick={() => { setTab(t); setError(null); }}
            className={`flex-1 py-1.5 text-[11px] font-semibold transition ${tab === t ? "bg-white text-blue-600 border-b-2 border-blue-500" : "text-gray-400 hover:text-gray-600 bg-gray-50"}`}>
            {t === "upload" ? "Upload file" : "Paste URL"}
          </button>
        ))}
      </div>
      {/* Content */}
      <div className="p-2.5">
        {tab === "upload" ? (
          <>
            <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFile} />
            <button type="button" disabled={uploading} onClick={() => inputRef.current?.click()}
              className="flex items-center gap-2 w-full rounded-lg border border-dashed border-gray-200 px-3 py-2.5 text-xs text-gray-400 hover:border-blue-300 hover:text-blue-500 hover:bg-blue-50 transition cursor-pointer disabled:opacity-50">
              <IcImg size={13} className="shrink-0" />
              <span>{uploading ? "Uploading..." : "Click to choose image"}</span>
              <span className="ml-auto text-[10px] text-gray-300">JPG PNG WebP · 5 MB</span>
            </button>
          </>
        ) : (
          <div className="flex gap-2">
            <input value={urlDraft} onChange={(e) => setUrlDraft(e.target.value)}
              placeholder="https://example.com/image.jpg"
              className="flex-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-100 min-w-0" />
            <button type="button" onClick={() => { if (urlDraft.trim()) { onUploaded(urlDraft.trim()); setUrlDraft(""); } }}
              disabled={!urlDraft.trim()}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition disabled:opacity-40">
              Use
            </button>
          </div>
        )}
        {error && <p className="text-[11px] text-red-400 mt-1.5">{error}</p>}
      </div>
    </div>
  );
}


function EditPanel({ step, allSteps, onChange, onClose }: {
  step: Step; allSteps: Step[]; onChange: (s: Step) => void; onClose: () => void;
}) {
  const cfg      = CFG[step.inputType];
  const stepKeys = allSteps.filter((s) => !s.isFallback && s.stepKey !== step.stepKey).map((s) => s.stepKey).filter(Boolean);
  const isMsg    = step.inputType === "message";
  const isSrch   = step.inputType === "search";
  const isInter  = !isMsg && !isSrch;
  const isBtn    = step.inputType === "button";
  const maxOpts  = isBtn ? 3 : 10;
  const hasProd    = isInter && step.options.some((o) => PROD_SRC.includes(o.dataSource));
  const srchOpt    = step.options[0] ?? newOption();
  const otherEntry  = allSteps.some((s) => s.isEntry && s.stepKey !== step.stepKey);
  // Draft key — lives only in this input; committed on blur so the flow never has mid-type duplicate keys
  const [draftKey, setDraftKey] = useState(step.stepKey);
  useEffect(() => { setDraftKey(step.stepKey); setKeyEditing(false); }, [step.stepKey]);
  const taRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = taRef.current; if (!el) return;
    el.style.height = "auto"; el.style.height = el.scrollHeight + "px";
  }, [step.message]);
  const [keyEditing, setKeyEditing] = useState(false);
  const draftDup = keyEditing && draftKey !== step.stepKey && allSteps.some((s) => s.stepKey === draftKey);

  function commitKey() {
    const cleaned = draftKey.trim();
    if (!cleaned || draftDup) { setDraftKey(step.stepKey); return; } // revert on conflict or empty
    if (cleaned !== step.stepKey) onChange({ ...step, stepKey: cleaned });
  }

  function updOpt(i: number, o: Option) { const n = [...step.options]; n[i] = o; onChange({ ...step, options: n }); }
  function addOpt() { if (step.options.length < maxOpts) onChange({ ...step, options: [...step.options, newOption(step.options.length)] }); }
  function delOpt(i: number) { onChange({ ...step, options: step.options.filter((_, j) => j !== i) }); }

  return (
    <div className="flex flex-col border-l border-gray-200 bg-white shrink-0" style={{ width: 340 }}>
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 shrink-0" style={{ borderTopColor: cfg.color, borderTopWidth: 3 }}>
        <cfg.ic size={16} className="text-gray-500 shrink-0" />
        <div className="flex-1 min-w-0">
          {step.isFallback
            ? <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold text-gray-800">{step.stepKey}</span>
                <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth={2} strokeLinecap="round"><title>Locked</title><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </div>
            : <input
                value={draftKey}
                onChange={(e) => setDraftKey(e.target.value.replace(/\s/g, "_").toLowerCase())}
                onFocus={() => setKeyEditing(true)}
                onBlur={() => { setKeyEditing(false); commitKey(); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.currentTarget.blur(); } if (e.key === "Escape") { setDraftKey(step.stepKey); e.currentTarget.blur(); } }}
                className={"w-full text-sm font-bold bg-transparent focus:outline-none " + (draftDup ? "text-red-500" : "text-gray-800")} />
          }
          {!step.isFallback && draftDup
            ? <p className="text-[11px] text-red-400 mt-0.5 font-medium">Name already used — press Esc to cancel</p>
            : <p className="text-[11px] text-gray-400 mt-0.5">{step.isFallback ? "Fallback · locked" : cfg.label}</p>
          }
        </div>
        <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 p-1.5 text-gray-400 hover:bg-gray-50 transition"><IcX /></button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {isSrch ? (
          /* Search mode — dedicated banner */
          <div className="rounded-xl border border-purple-200 bg-purple-50 p-3.5 space-y-2">
            <div className="flex items-center gap-2">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={15} height={15} className="text-purple-600 shrink-0"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <p className="text-[11px] font-bold text-purple-700 uppercase tracking-wider">Customer Search Step</p>
            </div>
            <p className="text-[11px] text-purple-600 leading-relaxed">Bot asks the question below, customer types their reply, then results load automatically.</p>
          </div>
        ) : step.showProductCard ? (
          /* Product card mode — show auto-fields banner instead of step type + image */
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 space-y-2">
            <div className="flex items-center gap-2">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={15} height={15} className="text-emerald-600 shrink-0"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/><circle cx="9" cy="10" r="1.5"/><path d="M13 8h4M13 11h4"/></svg>
              <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Product Detail Card</p>
            </div>
            <p className="text-[11px] text-emerald-600 leading-relaxed">The following fields load automatically from WooCommerce — no setup needed:</p>
            <div className="flex flex-col gap-1.5">
              {["Product image", "Product name", "Price from", "Variations", "Order Now button link"].map((f) => (
                <div key={f} className="flex items-center gap-1.5 text-[11px] text-emerald-700">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={10} height={10}><polyline points="20 6 9 17 4 12"/></svg>
                  {f}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div>
              <label className={LBL}>Step type</label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.entries(CFG) as [ST, typeof CFG[ST]][]).map(([t, c]) => (
                  <button key={t} type="button" onClick={() => {
                    const next: Step = { ...step, inputType: t as ST };
                    if (t === "message") next.options = [];
                    onChange(next);
                  }}
                    className="flex items-center gap-2 rounded-xl border-2 px-3 py-2 text-left transition"
                    style={step.inputType === t ? { borderColor: c.color, backgroundColor: c.bg, color: c.color } : { borderColor: "#e5e7eb", color: "#6b7280" }}>
                    <c.ic size={14} /><span className="text-xs font-semibold">{c.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={LBL}>Image <span className="normal-case font-normal text-gray-300 ml-1">optional</span></label>
              {step.imageUrl ? (
                <div className="flex items-center gap-2">
                  <img src={step.imageUrl} alt="" className="h-14 w-14 rounded-xl object-cover border border-gray-200 shrink-0"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-500 truncate">{step.imageUrl.split("/").pop()?.split("?")[0] ?? "image"}</p>
                    <button type="button" onClick={() => onChange({ ...step, imageUrl: "" })}
                      className="mt-1 text-[11px] text-red-400 hover:text-red-600 transition">Remove</button>
                  </div>
                </div>
              ) : (
                <ImageInput onUploaded={(url) => onChange({ ...step, imageUrl: url })} />
              )}
            </div>
          </>
        )}
        {!step.showProductCard && <div>
          <div className="flex items-end justify-between mb-1">
            <label className={LBL}>{isMsg ? "Message text" : isSrch ? "Search prompt" : "Bot message"}</label>
            {/* Variable hint — shows all captured vars from other steps */}
            {allSteps.some((s) => s.captureVar && s.stepKey !== step.stepKey) && (
              <div className="flex gap-1 flex-wrap justify-end">
                {allSteps.filter((s) => s.captureVar && s.stepKey !== step.stepKey).map((s) => (
                  <button key={s.stepKey} type="button"
                    onClick={() => { const ta = taRef.current; if (!ta) return; const v = `{${s.captureVar}}`; const start = ta.selectionStart ?? ta.value.length; const end = ta.selectionEnd ?? ta.value.length; const next = ta.value.slice(0,start) + v + ta.value.slice(end); onChange({ ...step, message: next }); }}
                    className="text-[9px] bg-purple-100 text-purple-600 rounded px-1 py-0.5 font-mono hover:bg-purple-200 transition">{`{${s.captureVar}}`}</button>
                ))}
              </div>
            )}
          </div>
          <textarea ref={taRef} value={step.message} rows={1} style={{ overflow: "hidden", minHeight: 36 }} onChange={(e) => { onChange({ ...step, message: e.target.value }); const el = e.currentTarget; el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; }}
            placeholder={isMsg ? "Welcome to Matilda Cake!" : isSrch ? "What are you looking for?" : "What would you like to order?"}
            className={INP + " resize-none"} />
        </div>}

        {/* Variable capture — for message steps that wait for a reply */}
        {isMsg && (
          <div className="rounded-xl border border-purple-200 bg-purple-50 p-3 space-y-2">
            <p className="text-[11px] font-bold text-purple-700 uppercase tracking-wider">Capture customer reply</p>
            <p className="text-[11px] text-purple-500">Save what the customer types into a variable you can reuse in later messages.</p>
            <div>
              <label className={LBL}>Variable name</label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-purple-400 font-mono shrink-0">{"{"}</span>
                <input value={step.captureVar ?? ""} onChange={(e) => onChange({ ...step, captureVar: e.target.value.replace(/[^a-z0-9_]/gi, "_").toLowerCase() || undefined })}
                  placeholder="customer_name"
                  className="flex-1 rounded-lg border border-purple-200 bg-white px-2 py-1.5 text-xs font-mono text-purple-700 focus:outline-none placeholder:text-purple-200" />
                <span className="text-sm text-purple-400 font-mono shrink-0">{"}"}</span>
                {step.captureVar && <button type="button" onClick={() => onChange({ ...step, captureVar: undefined })} className="text-purple-400 hover:text-red-400 transition"><IcX size={12} /></button>}
              </div>
              {step.captureVar && <p className="text-[10px] text-purple-500 mt-1">Use <code className="bg-purple-100 rounded px-1">{`{${step.captureVar}}`}</code> in any later message</p>}
            </div>
          </div>
        )}
        {/* Only show entry toggle if this IS the entry step, or no other step is entry yet */}
        {(!otherEntry || step.isEntry) && (
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <button type="button" onClick={() => onChange({ ...step, isEntry: !step.isEntry })}
              className={"relative h-5 w-9 rounded-full transition-colors " + (step.isEntry ? "bg-green-500" : "bg-gray-200")}>
              <span className={"absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform " + (step.isEntry ? "translate-x-4" : "")} />
            </button>
            <span className="text-sm text-gray-700">Entry step <span className="text-xs text-gray-400 font-normal">(where flow starts)</span></span>
          </label>
        )}
        {isSrch && (
          <div className="space-y-4">
            <div>
              <label className={LBL}>Where to search</label>
              <select value={srchOpt.dataSource} onChange={(e) => onChange({ ...step, options: [{ ...srchOpt, dataSource: e.target.value }] })} className={INP}>
                <option value="woocommerce_search">WooCommerce products</option>
                <option value="custom_api_search">Custom API</option>
              </select>
            </div>
            <div>
              <label className={LBL}>After customer taps a result — goes to</label>
              <select value={srchOpt.nextStepKey} onChange={(e) => onChange({ ...step, options: [{ ...srchOpt, nextStepKey: e.target.value }] })} className={INP}>
                <option value="">End flow</option>
                {stepKeys.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
            {srchOpt.dataSource === "custom_api_search" && (
              <ApiFields opt={srchOpt} isSearch={true} onChange={(o) => onChange({ ...step, options: [o] })} />
            )}
          </div>
        )}
        {isMsg && (
          <div>
            <label className={LBL}>Then go to</label>
            <select value={step.options[0]?.nextStepKey ?? ""} onChange={(e) => onChange({ ...step, options: [{ ...newOption(), nextStepKey: e.target.value }] })} className={INP}>
              <option value="">End flow</option>
              {stepKeys.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
        )}
        {step.showProductCard && (
          <div>
            <label className={LBL}>After customer views card — goes to</label>
            <select value={step.options[0]?.nextStepKey ?? ""} onChange={(e) => onChange({ ...step, options: [{ ...newOption(), nextStepKey: e.target.value }] })} className={INP}>
              <option value="">End flow</option>
              {stepKeys.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
        )}
        {/* Hand off to agent toggle — available on any step */}
        {!step.isFallback && (
          <button type="button" onClick={() => onChange({ ...step, handoffToAgent: !step.handoffToAgent })}
            className={"w-full flex items-center gap-3 rounded-xl border-2 px-3.5 py-3 text-left transition " + (step.handoffToAgent ? "border-rose-400 bg-rose-50" : "border-gray-200 hover:border-rose-200")}>
            <div className={"shrink-0 h-5 w-9 rounded-full transition-colors " + (step.handoffToAgent ? "bg-rose-500" : "bg-gray-200")}>
              <span className={"block h-4 w-4 rounded-full bg-white shadow mt-0.5 transition-transform " + (step.handoffToAgent ? "translate-x-[18px]" : "translate-x-0.5")} />
            </div>
            <div>
              <p className={"text-sm font-semibold " + (step.handoffToAgent ? "text-rose-700" : "text-gray-700")}>Hand off to agent</p>
              <p className="text-[11px] text-gray-400">Notifies Team Inbox — bot keeps running until agent takes over</p>
            </div>
          </button>
        )}
        {isInter && !isSrch && !step.showProductCard && (
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                {isBtn ? "Buttons" : "List options"} <span className="font-normal text-gray-300">({step.options.length}/{maxOpts})</span>
              </label>
              {step.options.length < maxOpts && (
                <button type="button" onClick={addOpt} className="flex items-center gap-1 text-xs font-semibold text-blue-500 hover:text-blue-700 transition">
                  <IcPlus size={13} /> Add
                </button>
              )}
            </div>
            <div className="space-y-3">
              {step.options.map((opt, i) => (
                <OptEditor key={i} opt={opt} index={i} stepKeys={stepKeys} isBtn={isBtn}
                  isFallbackStep={step.isFallback}
                  onChange={(o) => updOpt(i, o)} onDelete={() => delOpt(i)} />
              ))}
              {step.options.length === 0 && (
                <button type="button" onClick={addOpt}
                  className="w-full rounded-xl border-2 border-dashed border-gray-200 py-4 text-sm text-gray-400 hover:border-blue-300 hover:text-blue-500 transition">
                  Add first option
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StepBubble({ step, onChoose, vars }: { step: Step; onChoose: (nextKey: string, label: string) => void; vars: Record<string,string> }) {
  function fillVars(msg: string) { return msg.replace(/\{(\w+)\}/g, (_, k) => vars[k] ? `[${vars[k]}]` : `{${k}}`); }
  const isSrch = step.inputType === "search";
  const isMsg  = step.inputType === "message";
  const dynOpt = step.options.find((o) => o.dataSource !== "static");
  const stBtns = step.options.filter((o) => o.dataSource === "static");
  const dBtns  = dynOpt ? [{ l: "Option 1", k: "" }, { l: "Option 2", k: "" }, { l: "Option 3", k: "" }] : stBtns.map((o) => ({ l: o.label || "Option", k: o.nextStepKey }));
  const now    = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  if (step.showProductCard) {
    return (
      <div className="bg-white rounded-2xl rounded-tl-none shadow-md overflow-hidden max-w-[92%] w-full">
        <div className="bg-gray-100 h-28 flex items-center justify-center border-b border-gray-200">
          <svg viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" width={32} height={32}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
        </div>
        <div className="px-3 pt-2.5 pb-1">
          <p className="text-[11px] font-bold text-gray-800 leading-tight">Product Name</p>
          <p className="text-[10px] text-[#25d366] font-semibold mt-0.5">From AED 49.00</p>
          <p className="text-[9px] text-gray-400 mt-0.5">Size: Small · Medium · Large</p>
        </div>
        <div className="px-3 pb-2.5">
          <button type="button" className="w-full mt-1.5 rounded-lg bg-[#25d366] text-white text-[10px] font-bold py-1.5 tracking-wide">
            Order Now
          </button>
        </div>
        <div className="flex justify-end px-2.5 pb-1.5">
          <span className="text-[8px] text-gray-300">{now} ✓✓</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl rounded-tl-none shadow-md overflow-hidden max-w-[92%] w-full">
      {step.imageUrl && <img src={step.imageUrl} alt="" className="w-full max-h-40 object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />}
      <div className="px-3 pt-2.5 pb-1">
        <p className="text-[11px] text-gray-800 leading-relaxed whitespace-pre-wrap">
          {fillVars(step.message) || <span className="italic text-gray-300">Message text…</span>}
        </p>
        {isSrch && (
          <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5">
            <svg viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={10} height={10}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <span className="text-[9px] text-gray-300 italic">Type to search…</span>
          </div>
        )}
      </div>
      <div className="flex justify-end px-2.5 pb-1.5">
        <span className="text-[8px] text-gray-300">{now} ✓✓</span>
      </div>
      {/* Buttons */}
      {step.inputType === "button" && dBtns.length > 0 && (
        <div className="border-t border-gray-100">
          {dBtns.map((b, i) => (
            <button key={i} type="button" onClick={() => !dynOpt && onChoose(b.k, b.l)}
              className={"w-full flex items-center justify-center gap-1.5 text-[10px] font-semibold text-[#0a82ff] py-2 transition " + (i > 0 ? "border-t border-gray-100 " : "") + (dynOpt ? "opacity-40 cursor-default" : "hover:bg-blue-50 active:bg-blue-100")}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={9} height={9}><polyline points="9 18 15 12 9 6"/></svg>
              {b.l}
            </button>
          ))}
          {dynOpt && <p className="text-center text-[9px] text-amber-500 py-1 border-t border-amber-100 bg-amber-50">Dynamic · tap to simulate</p>}
        </div>
      )}
      {/* List */}
      {step.inputType === "list" && dBtns.length > 0 && (
        <div className="border-t border-gray-100 mx-2.5 mb-2.5 mt-1 rounded-xl overflow-hidden border border-gray-100">
          <div className="px-2.5 py-1 bg-gray-50 border-b border-gray-100">
            <p className="text-[8px] font-bold text-gray-400 uppercase tracking-wider">Options</p>
          </div>
          {dBtns.map((b, i) => (
            <button key={i} type="button" onClick={() => !dynOpt && onChoose(b.k, b.l)}
              className={"w-full flex items-center justify-between px-2.5 py-1.5 text-[10px] text-gray-700 transition " + (i > 0 ? "border-t border-gray-100 " : "") + (dynOpt ? "opacity-50 cursor-default" : "hover:bg-gray-50 active:bg-gray-100")}>
              <span>{b.l}</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={9} height={9}><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          ))}
          {dynOpt && <p className="text-center text-[9px] text-amber-500 py-1 border-t border-amber-100 bg-amber-50">Dynamic list</p>}
        </div>
      )}
      {isMsg && !step.showProductCard && <p className="px-3 pb-2 text-[9px] text-gray-300 italic">Continues automatically →</p>}
    </div>
  );
}

function PhonePreview({ step, allSteps, simMode, onToggleSim }: { step: Step | null; allSteps: Step[]; simMode: boolean; onToggleSim: () => void }) {
  const [history, setHistory] = useState<{ step: Step; chosen?: string }[]>([]);
  const [vars, setVars] = useState<Record<string,string>>({});
  const [capturing, setCapturing] = useState<{ stepKey: string; varName: string } | null>(null);
  const [captureInput, setCaptureInput] = useState("");
  const chatRef = useRef<HTMLDivElement>(null);

  const entryStep = allSteps.find((s) => s.isEntry);

  useEffect(() => {
    if (simMode && entryStep) {
      setHistory([{ step: entryStep }]);
      setVars({});
      setCapturing(entryStep.captureVar ? { stepKey: entryStep.stepKey, varName: entryStep.captureVar } : null);
      setCaptureInput("");
    } else if (!simMode) {
      setHistory([]);
    }
  }, [simMode, entryStep?.stepKey]);

  useEffect(() => { chatRef.current?.scrollTo({ top: 9999, behavior: "smooth" }); }, [history]);

  function choose(nextKey: string, label: string) {
    const cur = history[history.length - 1]?.step;
    setHistory((h) => h.map((e, i) => i === h.length - 1 ? { ...e, chosen: label } : e));
    if (!nextKey) return;
    const next = allSteps.find((s) => s.stepKey === nextKey);
    if (!next) return;
    setTimeout(() => {
      setHistory((h) => [...h, { step: next }]);
      if (next.captureVar) setCapturing({ stepKey: next.stepKey, varName: next.captureVar });
    }, 300);
  }

  function submitCapture() {
    if (!captureInput.trim() || !capturing) return;
    setVars((v) => ({ ...v, [capturing.varName]: captureInput.trim() }));
    setHistory((h) => [...h, { step: { ...history[history.length-1].step, message: "" } as Step, chosen: captureInput.trim() }]);
    setCaptureInput("");
    setCapturing(null);
    // auto-advance to next step via message step's first option
    const cur = history[history.length - 1]?.step;
    const nextKey = cur?.options[0]?.nextStepKey;
    if (nextKey) {
      const next = allSteps.find((s) => s.stepKey === nextKey);
      if (next) setTimeout(() => { setHistory((h) => [...h, { step: next }]); if (next.captureVar) setCapturing({ stepKey: next.stepKey, varName: next.captureVar }); }, 300);
    }
  }

  if (!simMode) {
    // Static preview — show selected step
    if (!step) return (
      <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
        <IcEye size={24} className="text-gray-300" />
        <p className="text-xs text-gray-400">Click a step to preview</p>
        {entryStep && <button type="button" onClick={onToggleSim} className="mt-2 text-[11px] text-blue-500 hover:underline">▶ Simulate flow</button>}
      </div>
    );
    return (
      <div className="flex flex-col gap-2 h-full">
        <button type="button" onClick={onToggleSim} className="text-[11px] text-blue-500 hover:underline self-start shrink-0">▶ Simulate flow</button>
        <div className="flex-1 rounded-xl p-3 overflow-y-auto" style={{ background: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23c9c3bb' fill-opacity='0.15'%3E%3Cpath d='M30 30l15-15M30 30L15 15M30 30l15 15M30 30L15 45'/%3E%3C/g%3E%3C/svg%3E\") #e5ddd5" }}>
          <StepBubble step={step} onChoose={() => {}} vars={vars} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-1 pb-2 shrink-0">
        <p className="text-[11px] font-semibold text-purple-600">● Simulating</p>
        <button type="button" onClick={() => { setHistory(entryStep ? [{ step: entryStep }] : []); setVars({}); setCapturing(null); setCaptureInput(""); }}
          className="text-[10px] text-gray-400 hover:text-gray-600">↺ Restart</button>
      </div>
      <div ref={chatRef} className="flex-1 rounded-xl overflow-y-auto min-h-0"
        style={{ background: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23c9c3bb' fill-opacity='0.15'%3E%3Cpath d='M30 30l15-15M30 30L15 15M30 30l15 15M30 30L15 45'/%3E%3C/g%3E%3C/svg%3E\") #e5ddd5", padding: "12px 10px" }}>
        <div className="space-y-3">
        {history.map((h, i) => (
          <div key={i} className="space-y-2">
            <StepBubble step={h.step} onChoose={i === history.length - 1 ? choose : () => {}} vars={vars} />
            {h.chosen && (
              <div className="flex justify-end">
                <div className="bg-[#dcf8c6] rounded-2xl rounded-tr-none shadow-sm px-3 py-1.5 max-w-[75%]">
                  <p className="text-[11px] text-gray-800">{h.chosen}</p>
                  <p className="text-[8px] text-gray-400 text-right mt-0.5">{new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ✓✓</p>
                </div>
              </div>
            )}
          </div>
        ))}
        {history.length === 0 && <p className="text-[10px] text-gray-400 text-center pt-4">No entry step set</p>}
        </div>
      </div>
      {capturing && (
        <div className="mt-2 flex gap-1.5 shrink-0">
          <input value={captureInput} onChange={(e) => setCaptureInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitCapture()}
            placeholder={`Reply as customer…`}
            className="flex-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-100" />
          <button type="button" onClick={submitCapture}
            className="rounded-lg bg-[#075e54] px-2.5 text-white text-xs font-semibold hover:bg-[#064d44] transition">Send</button>
        </div>
      )}
    </div>
  );
}

function CtxMenuItem({ icon, label, onClick, danger, sub }: {
  icon: React.ReactElement; label: string; onClick: () => void; danger?: boolean; sub?: string;
}) {
  return (
    <button type="button" onClick={onClick}
      className={"w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-left transition " +
        (danger ? "text-red-500 hover:bg-red-50" : "text-gray-700 hover:bg-gray-50")}>
      <span className={danger ? "text-red-400" : "text-gray-400"}>{icon}</span>
      <span className="flex-1">{label}</span>
      {sub && <span className="text-[10px] text-gray-300 ml-1">{sub}</span>}
    </button>
  );
}

function CtxMenuDivider() { return <div className="my-1 border-t border-gray-100" />; }

type CtxMenuProps = {
  x: number; y: number; step: Step;
  onClose: () => void;
  onAddConnected: () => void;
  onCopy: () => void; onDelete: () => void; onDuplicate: () => void;
  onDisable: () => void; onEnable: () => void; onUnlink: () => void;
  onLabel: () => void;
};
function CtxMenu({ x, y, step, onClose, onAddConnected, onCopy, onDelete, onDuplicate, onDisable, onEnable, onUnlink, onLabel }: CtxMenuProps) {
  return (
    <>
      <div className="fixed inset-0 z-40" onMouseDown={onClose} />
      <div className="fixed z-50 bg-white rounded-xl shadow-xl border border-gray-200 py-1.5 min-w-[175px]"
        style={{ left: x, top: y }}>
        {step.isFallback ? (
          /* Fallback card — only label allowed */
          <CtxMenuItem icon={<svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>}
            label={step.label ? "Edit label" : "Add label"} onClick={() => { onLabel(); onClose(); }} />
        ) : (
          <>
            {/* Add connected step */}
            <button type="button" onClick={() => onAddConnected()}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-left text-gray-700 hover:bg-gray-50 transition">
              <span className="text-gray-400"><IcPlus size={13} /></span>
              <span className="flex-1">Add connected step…</span>
            </button>
            <CtxMenuDivider />
            <CtxMenuItem icon={<IcCopy size={13} />}   label="Copy"      sub="Ctrl+C" onClick={() => { onCopy(); onClose(); }} />
            <CtxMenuItem icon={<IcDup size={13} />}    label="Duplicate"              onClick={() => { onDuplicate(); onClose(); }} />
            <CtxMenuItem icon={<svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>}
              label={step.label ? "Edit label" : "Add label"} onClick={() => { onLabel(); onClose(); }} />
            <CtxMenuDivider />
            <CtxMenuItem icon={<IcUnlink size={13} />} label="Unlink all connections" onClick={() => { onUnlink(); onClose(); }} />
            {step.disabled
              ? <CtxMenuItem icon={<IcBan size={13} />} label="Enable"  onClick={() => { onEnable(); onClose(); }} />
              : <CtxMenuItem icon={<IcBan size={13} />} label="Disable" onClick={() => { onDisable(); onClose(); }} />
            }
            <CtxMenuDivider />
            <CtxMenuItem icon={<IcDel size={13} />} label="Delete" onClick={() => { onDelete(); onClose(); }} danger />
          </>
        )}
      </div>
    </>
  );
}

// ── AI Instructions types ─────────────────────────────────────────────────

type AiSettings = {
  openai_configured: boolean;
  ai_kb_business_name: string; ai_kb_hours: string; ai_kb_location: string;
  ai_kb_sizes: string; ai_kb_flavours: string; ai_kb_delivery: string;
  ai_kb_custom_orders: string; ai_kb_extra: string;
  ai_intent_catalog: boolean; ai_intent_search: boolean;
  ai_intent_agent: boolean; ai_intent_info: boolean;
  ai_kb_use_prompt: boolean;
  ai_kb_prompt: string;
  ai_max_tokens: number;
  ai_daily_limit: number;
  ai_usage_today: number;
};
const EMPTY_AI: AiSettings = {
  openai_configured: false,
  ai_kb_business_name: "", ai_kb_hours: "", ai_kb_location: "",
  ai_kb_sizes: "", ai_kb_flavours: "", ai_kb_delivery: "",
  ai_kb_custom_orders: "", ai_kb_extra: "",
  ai_intent_catalog: true, ai_intent_search: true,
  ai_intent_agent: true, ai_intent_info: true,
  ai_kb_use_prompt: false,
  ai_kb_prompt: "",
  ai_max_tokens: 150,
  ai_daily_limit: 200,
  ai_usage_today: 0,
};

function buildCompiledPrompt(s: AiSettings): string {
  const lines: string[] = [];
  const name = s.ai_kb_business_name || "your business";
  lines.push(`You are a helpful assistant for ${name}.`);
  lines.push("");
  if (s.ai_kb_hours)         lines.push(`Opening Hours: ${s.ai_kb_hours}`);
  if (s.ai_kb_location)      lines.push(`Location: ${s.ai_kb_location}`);
  if (s.ai_kb_sizes)         lines.push(`Products / Services: ${s.ai_kb_sizes}`);
  if (s.ai_kb_flavours)      lines.push(`Pricing: ${s.ai_kb_flavours}`);
  if (s.ai_kb_delivery)      lines.push(`Delivery / Shipping: ${s.ai_kb_delivery}`);
  if (s.ai_kb_custom_orders) lines.push(`Special Requests: ${s.ai_kb_custom_orders}`);
  if (s.ai_kb_extra) { lines.push(""); lines.push(s.ai_kb_extra); }
  lines.push("");
  lines.push("Answer customer questions helpfully and concisely. Keep replies short and friendly.");
  return lines.join("\n");
}

export default function FlowEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id }  = use(params);
  const router  = useRouter();
  const uidRef    = useRef(0);
  const isPan     = useRef(false);
  const panSt     = useRef({ x:0, y:0, px:0, py:0 });
  const canvasRef = useRef<HTMLDivElement>(null);
  const linkRef   = useRef<{ fromKey: string; optIdx: number; x1: number; y1: number } | null>(null);
  const panRef     = useRef({ x: 40, y: 40 });
  const zoomRef    = useRef(1);
  const flowRef    = useRef<Flow | null>(null);
  const historyRef = useRef<Flow[]>([]);
  const futureRef  = useRef<Flow[]>([]);
  const clipRef    = useRef<Step | null>(null);

  const [flow,        setFlow]        = useState<Flow | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [saved,       setSaved]       = useState(true);
  const [justSaved,   setJustSaved]   = useState(false);
  const [selKeys,     setSelKeys]     = useState<string[]>([]);
  const [linkLine,    setLinkLine]    = useState<LinkLine | null>(null);
  const [selRectDraw, setSelRectDraw] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const selRectRef = useRef<{ sx: number; sy: number } | null>(null); // canvas-space start of drag-select
  const [showPreview, setShowPreview] = useState(false);
  const [simMode,     setSimMode]     = useState(false);
  const [showSet,     setShowSet]     = useState(false);
  const [settingsTab, setSettingsTab] = useState<"flow" | "ai">("flow");
  const [kbTab,       setKbTab]       = useState<"fields" | "prompt">("fields");
  const [aiSettings,  setAiSettings]  = useState<AiSettings>(EMPTY_AI);
  const [aiLoaded,    setAiLoaded]    = useState(false);
  const [aiSaving,    setAiSaving]    = useState(false);
  const [aiSaved,     setAiSaved]     = useState(false);
  const aiSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pan,         setPan]         = useState({ x: 40, y: 40 });
  const [zoom,        setZoom]        = useState(1);
  const [ctxMenu,     setCtxMenu]     = useState<{ x: number; y: number; stepKey: string } | null>(null);
  const [labelEdit,   setLabelEdit]   = useState<{ stepKey: string; value: string } | null>(null);
  const [connCtx,     setConnCtx]     = useState<{ x: number; y: number; fromKey: string; optIdx: number } | null>(null);
  const [canvasCtx,   setCanvasCtx]   = useState<{ screenX: number; screenY: number; canvasX: number; canvasY: number } | null>(null);
  const [pickerCtx,   setPickerCtx]   = useState<{ x?: number; y?: number; fromKey?: string } | null>(null);
  const [canUndo,     setCanUndo]     = useState(false);
  const [canRedo,     setCanRedo]     = useState(false);
  const [autoSavedAt, setAutoSavedAt] = useState<Date | null>(null);
  const draftKey = `flow_draft_${id}`;
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedRef = useRef(true);
  const justSavedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef<() => void>(() => {});

  // Derived single-select key — drives the edit panel
  const selKey  = selKeys.length === 1 ? selKeys[0] : null;
  const setSelKey = (k: string | null) => setSelKeys(k ? [k] : []);

  useEffect(() => {
    fetch("/api/admin/flows/" + id).then((r) => r.json()).then((j) => {
      if (j.ok) {
        let f = normaliseFlow(j.data);
        // Silently restore browser draft if one exists
        try {
          const raw = localStorage.getItem(draftKey);
          if (raw) {
            const draft = JSON.parse(raw) as { flow: Flow };
            if (draft.flow) { f = normaliseFlow(draft.flow); setSaved(false); setAutoSavedAt(new Date()); }
          }
        } catch { /* ignore */ }
        setFlow(f); flowRef.current = f; setSelKeys(f.steps[0]?.stepKey ? [f.steps[0].stepKey] : []);
      }
      setLoading(false);
    });
  }, [id]);

  // Auto-save draft to localStorage on every flow change (debounced 2s)
  useEffect(() => {
    if (!flow || saved) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      if (savedRef.current) return;
      try {
        localStorage.setItem(draftKey, JSON.stringify({ flow, savedAt: Date.now() }));
        setAutoSavedAt(new Date());
      } catch { /* quota exceeded — ignore */ }
    }, 2000);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [flow, saved]);

  // Keep refs in sync so global event handlers never see stale state
  useEffect(() => { panRef.current  = pan;  }, [pan]);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { flowRef.current = flow; }, [flow]);
  useEffect(() => { savedRef.current = saved; }, [saved]);

  useEffect(() => {
    if (!showSet) { setAiLoaded(false); return; }
    fetch("/api/admin/ai-settings")
      .then((r) => r.json())
      .then((j) => { if (j.ok) { setAiSettings(j.data); setKbTab(j.data.ai_kb_use_prompt ? "prompt" : "fields"); } })
      .catch(() => {})
      .finally(() => setAiLoaded(true));
  }, [showSet]);

  useEffect(() => {
    document.body.style.overflow = showSet ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [showSet]);

  function upFlow(patch: Partial<Flow>) {
    setFlow((f) => {
      if (f) {
        historyRef.current = [...historyRef.current.slice(-49), f];
        futureRef.current  = [];
        setCanUndo(true); setCanRedo(false);
      }
      return f ? { ...f, ...patch } : f;
    });
    setSaved(false);
  }

  function undo() {
    const prev = historyRef.current.pop();
    if (!prev) return;
    setFlow((f) => {
      if (f) { futureRef.current = [f, ...futureRef.current.slice(0, 49)]; setCanRedo(true); }
      setCanUndo(historyRef.current.length > 0);
      return prev;
    });
    setSaved(false);
  }

  function redo() {
    const next = futureRef.current.shift();
    if (!next) return;
    setFlow((f) => {
      if (f) { historyRef.current = [...historyRef.current.slice(-49), f]; setCanUndo(true); }
      setCanRedo(futureRef.current.length > 0);
      return next;
    });
    setSaved(false);
  }

  function upStep(key: string, patch: Partial<Step>) {
    if (!flow) return;
    let steps = flow.steps.map((s) => s.stepKey === key ? { ...s, ...patch } : s);
    // Enforce single entry step — clear isEntry from all others if set on this one
    if (patch.isEntry === true) {
      steps = steps.map((s) => s.stepKey !== key ? { ...s, isEntry: false } : s);
    }
    upFlow({ steps });
    if (patch.stepKey && patch.stepKey !== key) setSelKey(patch.stepKey);
  }

  function addStep(type: ST = "button", x?: number, y?: number, fromKey?: string, dataSource?: string, stepPatch?: Partial<Step>) {
    if (!flow) return;
    const n = flow.steps.filter((s) => !s.isFallback).length;
    const s = newStep(n, x ?? (n === 0 ? 80 : 80 + Math.round(Math.random() * 220)), y ?? (n === 0 ? 120 : 100 + Math.round(Math.random() * 280)));
    s._uid = ++uidRef.current;
    s.inputType = type;
    if (dataSource && s.options[0]) s.options[0].dataSource = dataSource;
    if (stepPatch) Object.assign(s, stepPatch);
    // If spawned from a card, auto-link the first unconnected option
    let steps = [...flow.steps, s];
    if (fromKey) {
      const src = steps.find((st) => st.stepKey === fromKey);
      if (src) {
        const firstFree = src.options.findIndex((o) => !o.nextStepKey);
        if (firstFree >= 0) {
          steps = steps.map((st) => st.stepKey === fromKey
            ? { ...st, options: st.options.map((o, i) => i === firstFree ? { ...o, nextStepKey: s.stepKey } : o) }
            : st);
        }
      }
    }
    // Auto-create fallback card when adding the very first step
    if (n === 0) {
      const fb = newFallbackStep(1);
      fb._uid = ++uidRef.current;
      steps = [...steps, fb];
    }
    upFlow({ steps });
    setSelKey(s.stepKey);
  }

  function setStepFallback(key: string) {
    if (!flow) return;
    // Only one step can be fallback — clear all others first
    upFlow({ steps: flow.steps.map((s) => ({ ...s, isFallback: s.stepKey === key ? !s.isFallback : false })) });
  }

  function delStep(key: string) {
    if (!flow) return;
    if (flow.steps.find((s) => s.stepKey === key)?.isFallback) return;
    const deletingEntry = flow.steps.find((s) => s.stepKey === key)?.isEntry;
    const remaining = flow.steps.filter((s) => s.stepKey !== key && !(deletingEntry && s.isFallback));
    // Build rename map for sequential step_N keys
    const renameMap: Record<string, string> = {};
    let counter = 1;
    remaining
      .slice()
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .forEach((s) => {
        if (/^step_\d+$/.test(s.stepKey)) {
          const newKey = `step_${counter}`;
          if (newKey !== s.stepKey) renameMap[s.stepKey] = newKey;
          counter++;
        }
      });
    const renamed = remaining.map((s) => ({
      ...s,
      stepKey: renameMap[s.stepKey] ?? s.stepKey,
      options: s.options.map((o) => ({
        ...o,
        nextStepKey: o.nextStepKey === key ? "" : (renameMap[o.nextStepKey] ?? o.nextStepKey),
      })),
    }));
    upFlow({ steps: renamed });
    const newSelKey = selKey === key ? (renamed[0]?.stepKey ?? null) : (renameMap[selKey ?? ""] ?? selKey);
    setSelKeys(newSelKey ? [newSelKey] : []);
  }

  function copyStep(key: string) {
    const step = flowRef.current?.steps.find((s) => s.stepKey === key);
    if (step) { clipRef.current = step; }
  }

  function pasteStep() {
    const src = clipRef.current;
    if (!src || !flow) return;
    let newKey = src.stepKey + "_copy";
    // avoid key collision
    let n = 1;
    while (flow.steps.some((s) => s.stepKey === newKey)) newKey = src.stepKey + "_copy" + (++n);
    const s: Step = {
      ...src, id: undefined, _uid: ++uidRef.current,
      stepKey: newKey, isEntry: false,
      _x: (src._x ?? 0) + 40, _y: (src._y ?? 0) + 40,
      options: src.options.map((o) => ({ ...o, id: undefined })),
    };
    upFlow({ steps: [...flow.steps, s] });
    setSelKey(newKey);
  }

  function duplicateStep(key: string) {
    const src = flow?.steps.find((s) => s.stepKey === key);
    if (!src || !flow) return;
    let newKey = src.stepKey + "_copy";
    let n = 1;
    while (flow.steps.some((s) => s.stepKey === newKey)) newKey = src.stepKey + "_copy" + (++n);
    const s: Step = {
      ...src, id: undefined, _uid: ++uidRef.current,
      stepKey: newKey, isEntry: false,
      _x: (src._x ?? 0) + 40, _y: (src._y ?? 0) + 40,
      options: src.options.map((o) => ({ ...o, id: undefined })),
    };
    upFlow({ steps: [...flow.steps, s] });
    setSelKey(newKey);
  }

  // Remove all connections to/from a step, optionally mark as disabled
  function unlinkStep(key: string, disable?: boolean) {
    if (!flow) return;
    const steps = flow.steps.map((s) => {
      const cleared = { ...s, options: s.options.map((o) => o.nextStepKey === key ? { ...o, nextStepKey: "" } : o) };
      if (s.stepKey === key) {
        return { ...cleared, disabled: disable ?? cleared.disabled, options: cleared.options.map((o) => ({ ...o, nextStepKey: "" })) };
      }
      return cleared;
    });
    upFlow({ steps });
  }

  function disableStep(key: string) { unlinkStep(key, true); }
  function enableStep(key: string) {
    if (!flow) return;
    upFlow({ steps: flow.steps.map((s) => s.stepKey === key ? { ...s, disabled: false } : s) });
  }

  function disconnectConn(fromKey: string, optIdx: number) {
    if (!flow) return;
    upFlow({
      steps: flow.steps.map((s) =>
        s.stepKey === fromKey
          ? { ...s, options: s.options.map((o, i) => i === optIdx ? { ...o, nextStepKey: "" } : o) }
          : s
      ),
    });
  }

  function moveStep(key: string, dx: number, dy: number) {
    // If the dragged card is part of a multi-selection, move all selected cards together
    setFlow((f) => {
      if (!f) return f;
      const keysToMove = selKeys.includes(key) && selKeys.length > 1 ? new Set(selKeys) : new Set([key]);
      return { ...f, steps: f.steps.map((s) => keysToMove.has(s.stepKey) ? { ...s, _x: (s._x ?? 0) + dx/zoom, _y: (s._y ?? 0) + dy/zoom } : s) };
    });
  }

  function startLink(stepKey: string, optIdx: number) {
    const step = flowRef.current?.steps.find((s) => s.stepKey === stepKey);
    if (!step) return;
    const x1 = (step._x ?? 0) + CARD_W;
    const y1 = (step._y ?? 0) + (step.options.length === 0 ? CARD_HEADER_H + imgH(step) + CARD_MSG_H + CARD_OPT_H / 2 : outputDotY(step, optIdx));
    linkRef.current = { fromKey: stepKey, optIdx, x1, y1 };
    setLinkLine({ x1, y1, x2: x1, y2: y1 });
  }

  function onCanvasDown(e: React.MouseEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("[data-node]") || (e.target as HTMLElement).closest("[data-nd]")) return;
    setCanvasCtx(null); setCtxMenu(null); setConnCtx(null);
    if (e.shiftKey) {
      // Start drag-select rectangle
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const cx = (e.clientX - rect.left - pan.x) / zoom;
      const cy = (e.clientY - rect.top  - pan.y) / zoom;
      selRectRef.current = { sx: cx, sy: cy };
      setSelRectDraw({ x: cx, y: cy, w: 0, h: 0 });
      return;
    }
    isPan.current = true;
    panSt.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
    setSelKeys([]);
  }

  function onCanvasContextMenu(e: React.MouseEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("[data-node]")) return; // let card handle its own right-click
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const canvasX = (e.clientX - rect.left - pan.x) / zoom;
    const canvasY = (e.clientY - rect.top  - pan.y) / zoom;
    setCanvasCtx({ screenX: e.clientX, screenY: e.clientY, canvasX, canvasY });
  }

  function exportFlow() {
    if (!flow) return;
    const data = JSON.stringify(flow, null, 2);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([data], { type: "application/json" }));
    a.download = `flow-${flow.name.replace(/\s+/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function importFlow(file: File) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const raw = JSON.parse(ev.target?.result as string);
        const f = normaliseFlow({ ...raw, id: flow?.id ?? raw.id, name: raw.name ?? flow?.name ?? "Imported flow" });
        // Give all steps fresh _uid so they don't collide
        f.steps = f.steps.map((s) => ({ ...s, id: undefined, _uid: ++uidRef.current, options: s.options.map((o) => ({ ...o, id: undefined })) }));
        upFlow(f);
        setSelKey(f.steps[0]?.stepKey ?? null);
      } catch { alert("Invalid flow file."); }
    };
    reader.readAsText(file);
  }

  useEffect(() => {
    function toCanvas(ex: number, ey: number) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return null;
      const p = panRef.current, z = zoomRef.current;
      return { x: (ex - rect.left - p.x) / z, y: (ey - rect.top - p.y) / z };
    }

    function mm(e: MouseEvent) {
      if (isPan.current) {
        setPan({ x: panSt.current.px + e.clientX - panSt.current.x, y: panSt.current.py + e.clientY - panSt.current.y });
      }
      if (linkRef.current) {
        const c = toCanvas(e.clientX, e.clientY);
        if (c) setLinkLine((ll) => ll ? { ...ll, x2: c.x, y2: c.y } : null);
      }
      if (selRectRef.current) {
        const c = toCanvas(e.clientX, e.clientY);
        if (!c) return;
        const { sx, sy } = selRectRef.current;
        setSelRectDraw({ x: Math.min(c.x, sx), y: Math.min(c.y, sy), w: Math.abs(c.x - sx), h: Math.abs(c.y - sy) });
      }
    }

    function mu(e: MouseEvent) {
      isPan.current = false;
      // Finish drag-select
      if (selRectRef.current) {
        const c = toCanvas(e.clientX, e.clientY);
        const { sx, sy } = selRectRef.current;
        selRectRef.current = null;
        setSelRectDraw(null);
        if (c) {
          const rx = Math.min(c.x, sx), ry = Math.min(c.y, sy), rw = Math.abs(c.x - sx), rh = Math.abs(c.y - sy);
          if (rw > 5 || rh > 5) {
            const f = flowRef.current;
            if (f) {
              const CARD_H_APPROX = CARD_HEADER_H + CARD_MSG_H + CARD_FOOT_H + 3 * CARD_OPT_H;
              const hit = f.steps.filter((s) => {
                const sx2 = s._x ?? 0, sy2 = s._y ?? 0;
                return sx2 < rx + rw && sx2 + CARD_W > rx && sy2 < ry + rh && sy2 + CARD_H_APPROX > ry;
              }).map((s) => s.stepKey);
              setSelKeys((prev) => {
                if (e.shiftKey) return [...new Set([...prev, ...hit])];
                return hit;
              });
            }
          }
        }
        return;
      }
      if (linkRef.current) {
        const lk = linkRef.current;
        linkRef.current = null;
        setLinkLine(null);
        const c = toCanvas(e.clientX, e.clientY);
        if (!c) return;
        const f = flowRef.current;
        if (!f) return;
        // Find the closest input dot within snap distance (30 canvas px)
        let best: Step | null = null;
        let bestDist = 30;
        f.steps.forEach((s) => {
          if (s.stepKey === lk.fromKey) return;
          if (s.isFallback) return; // cannot connect to fallback
          const ix = s._x ?? 0;
          const iy = (s._y ?? 0) + inputDotY(s);
          const d = Math.hypot(c.x - ix, c.y - iy);
          if (d < bestDist) { bestDist = d; best = s; }
        });
        if (best) {
          const src = f.steps.find((s) => s.stepKey === lk.fromKey);
          if (!src) return;
          const newOpts = src.options.map((o, i) =>
            i === lk.optIdx ? { ...o, nextStepKey: (best as Step).stepKey } : o
          );
          setFlow((fl) => fl ? {
            ...fl,
            steps: fl.steps.map((s) => s.stepKey === lk.fromKey ? { ...s, options: newOpts } : s),
          } : fl);
          setSaved(false);
        }
      }
    }

    window.addEventListener("mousemove", mm);
    window.addEventListener("mouseup", mu);
    return () => { window.removeEventListener("mousemove", mm); window.removeEventListener("mouseup", mu); };
  }, []);

  // Keyboard shortcuts — refs let this effect stay stable without stale closures
  const selKeyRef = useRef<string | null>(null);
  useEffect(() => { selKeyRef.current = selKey; }, [selKey]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const inInput = ["INPUT","TEXTAREA","SELECT"].includes((e.target as HTMLElement).tagName);
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.key === "z" && !e.shiftKey && !inInput) { e.preventDefault(); undo(); }
      if ((e.key === "y" || (e.key === "z" && e.shiftKey)) && !inInput) { e.preventDefault(); redo(); }
      if (e.key === "c" && !inInput && selKeyRef.current) { e.preventDefault(); copyStep(selKeyRef.current); }
      if (e.key === "v" && !inInput) { e.preventDefault(); pasteStep(); }
      if (e.key === "s") { e.preventDefault(); saveRef.current(); }
    }
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onWheel(e: React.WheelEvent) { e.preventDefault(); setZoom((z) => Math.max(0.3, Math.min(2, z * (e.deltaY > 0 ? 0.9 : 1.1)))); }

  async function save() {
    if (!flow) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    setSaving(true);
    const res = await fetch("/api/admin/flows/" + flow.id, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: flow.name, description: flow.description,
        triggerKeywords: flow.triggerKeywords, isActive: flow.isActive,
        steps: flow.steps.map((s, si) => ({
          ...s, sortOrder: si, stepKey: s.stepKey || ("step_" + (si+1)), imageUrl: s.imageUrl || null,
          positionX: s._x ?? 80, positionY: s._y ?? 120,
          options: s.options.map((o, oi) => ({
            ...o, sortOrder: oi, value: o.value || slugify(o.label) || ("opt_" + (oi+1)),
            customApiUrl: o.customApiUrl || null, customApiPath: o.customApiPath || null,
            customApiLabel: o.customApiLabel || null, customApiValue: o.customApiValue || null,
          })),
        })),
      }),
    }).then((r) => r.json());
    if (res.ok) {
      // Merge server-assigned IDs back into current flow — preserve canvas positions
      setFlow((cur) => {
        if (!cur) return normaliseFlow(res.data);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const byKey: Record<string, any> = {};
        for (const ss of (res.data.steps ?? [])) byKey[ss.stepKey] = ss;
        return {
          ...cur,
          steps: cur.steps.map((s) => {
            const ss = byKey[s.stepKey];
            if (!ss) return s;
            return { ...s, id: ss.id, options: s.options.map((o, oi) => ({ ...o, id: ss.options?.[oi]?.id ?? o.id })) };
          }),
        };
      });
      setSaved(true);
      if (justSavedTimer.current) clearTimeout(justSavedTimer.current);
      setJustSaved(true);
      justSavedTimer.current = setTimeout(() => setJustSaved(false), 2000);
      setAutoSavedAt(null);
      try { localStorage.removeItem(draftKey); } catch { /**/ }
    }
    setSaving(false);
  }
  saveRef.current = save;

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-full gap-3">
      <svg className="animate-spin text-slate-400" width={32} height={32} viewBox="0 0 24 24" fill="none">
        <circle cx={12} cy={12} r={10} stroke="currentColor" strokeWidth={3} strokeOpacity={0.15}/>
        <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth={3} strokeLinecap="round"/>
      </svg>
      <p className="text-sm text-gray-400">Loading flow...</p>
    </div>
  );
  if (!flow)   return <div className="flex items-center justify-center h-full text-sm text-red-500">Flow not found.</div>;

  const selStep    = flow.steps.find((s) => s.stepKey === selKey) ?? null;
  const entryCount = flow.steps.filter((s) => s.isEntry).length;
  const flowIssues = validateFlow(flow);
  const totalIssues = Array.from(flowIssues.values()).flat().length;

  return (
    <div className="flex flex-col h-full" style={{ background: "#f3f5f7" }}>
      <div className="flex items-center gap-2.5 px-3 py-2.5 shrink-0 z-20" style={{ background: "transparent" }}>
        {/* Back + flow name — white pill */}
        <div className="flex items-center gap-2 bg-white rounded-2xl border border-gray-200 px-2 py-1.5 min-w-0">
          <button type="button" onClick={() => router.push("/wa/flows")}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 transition shrink-0">
            <IcBack />
          </button>
          <input value={flow.name} onChange={(e) => upFlow({ name: e.target.value })}
            className="text-sm font-bold text-gray-800 bg-transparent focus:outline-none min-w-0 max-w-[180px]" />
          {(entryCount === 0 || entryCount > 1) && (
            <span className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2 py-0.5 shrink-0">
              {entryCount === 0 ? "No start step" : "Multiple starts"}
            </span>
          )}
        </div>

        <div className="flex-1" />

        {/* Toolbar buttons — white pill */}
        <div className="flex items-center gap-1.5 bg-white rounded-2xl border border-gray-200 px-2 py-1.5 shrink-0">
          <label className="flex items-center gap-2 cursor-pointer select-none px-1">
            <button type="button" onClick={() => upFlow({ isActive: !flow.isActive })}
              className={"relative h-5 w-9 rounded-full transition-colors " + (flow.isActive ? "bg-green-500" : "bg-gray-300")}>
              <span className={"absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform " + (flow.isActive ? "translate-x-4" : "")} />
            </button>
            <span className="text-sm text-gray-500">{flow.isActive ? "Active" : "Inactive"}</span>
          </label>
          <div className="w-px h-5 bg-gray-200 mx-0.5" />
          <button type="button" onClick={() => setShowSet((v) => !v)}
            className={"relative flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-medium transition " + (showSet ? "border-slate-400 text-slate-700 bg-slate-50" : "border-gray-200 text-gray-600 hover:bg-gray-100")}>
            <IcGear size={15} /> Settings
            {totalIssues > 0 && <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">{totalIssues}</span>}
          </button>
          <button type="button" onClick={() => setShowPreview((v) => !v)}
            className={"flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-medium transition " + (showPreview ? "border-slate-400 text-slate-700 bg-slate-50" : "border-gray-200 text-gray-600 hover:bg-gray-100")}>
            <IcEye size={15} /> Preview
          </button>
          <div className="w-px h-5 bg-gray-200 mx-0.5" />
          <button type="button" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)"
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition">
            <IcUndo size={15} /> Undo
          </button>
          <button type="button" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)"
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition">
            <IcRedo size={15} /> Redo
          </button>
          <div className="w-px h-5 bg-gray-200 mx-0.5" />
          <button type="button" onClick={() => setPickerCtx({})}
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 transition">
            <IcPlus size={15} /> Add step
          </button>
          <button type="button" onClick={exportFlow} title="Export flow as JSON"
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 transition">
            <Svg s={15}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></Svg>
            Export
          </button>
          <label className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 transition cursor-pointer" title="Import flow from JSON">
            <Svg s={15}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></Svg>
            Import
            <input type="file" accept=".json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importFlow(f); e.target.value = ""; }} />
          </label>
          <div className="w-px h-5 bg-gray-200 mx-0.5" />
          <button type="button" onClick={save} disabled={saving}
            title={autoSavedAt && !saved ? `Draft auto-saved at ${autoSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : undefined}
            className={`relative flex items-center gap-1.5 rounded-xl px-4 py-1.5 text-sm font-semibold text-white transition disabled:opacity-60 ${justSaved ? "bg-green-600 hover:bg-green-700" : "bg-blue-600 hover:bg-blue-700"}`}>
            {!saved && !saving && !justSaved && flow.steps.length > 0 && <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-white animate-pulse" />}
            <IcSave size={15} /> {saving ? "Saving..." : justSaved ? "Saved ✓" : "Save"}
          </button>
        </div>
      </div>

      {/* ── Settings modal ── */}
      {showSet && (() => {
        const tags = flow.triggerKeywords ? flow.triggerKeywords.split(",").map((t) => t.trim()).filter(Boolean) : [];
        function addTag(raw: string) {
          const t = raw.trim().toLowerCase();
          if (!t || tags.includes(t)) return;
          upFlow({ triggerKeywords: [...tags, t].join(", ") });
        }
        function addTagsBulk(raw: string) {
          const incoming = raw.split(/[,،\n]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
          const merged = [...tags];
          incoming.forEach((t) => { if (!merged.includes(t)) merged.push(t); });
          upFlow({ triggerKeywords: merged.join(", ") });
        }
        function removeTag(t: string) { upFlow({ triggerKeywords: tags.filter((k) => k !== t).join(", ") }); }

        async function saveAi() {
          setAiSaving(true); setAiSaved(false);
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { openai_configured, ...payload } = {
            ...aiSettings,
            ai_kb_use_prompt: kbTab === "prompt",
          };
          await fetch("/api/admin/ai-settings", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }).catch(() => {});
          setAiSaving(false); setAiSaved(true);
          if (aiSaveTimer.current) clearTimeout(aiSaveTimer.current);
          aiSaveTimer.current = setTimeout(() => setAiSaved(false), 2500);
        }

        const KB_FIELDS: { key: keyof AiSettings; label: string; placeholder: string; multiline?: boolean }[] = [
          { key: "ai_kb_business_name", label: "Business Name",        placeholder: "e.g. Matilda Cake" },
          { key: "ai_kb_hours",         label: "Opening Hours",        placeholder: "e.g. Mon–Sat 9am–9pm, Friday closed" },
          { key: "ai_kb_location",      label: "Location / Address",   placeholder: "e.g. Dubai, UAE" },
          { key: "ai_kb_sizes",         label: "Products / Services",  placeholder: "e.g. Custom cakes, cupcakes, dessert boxes — or list your services" },
          { key: "ai_kb_flavours",      label: "Pricing Info",         placeholder: "e.g. Cakes start from AED 150, cupcakes AED 10 each" },
          { key: "ai_kb_delivery",      label: "Delivery / Shipping",  placeholder: "e.g. Deliver within Dubai, min order AED 100, 2-day notice" },
          { key: "ai_kb_custom_orders", label: "Special Requests",     placeholder: "e.g. Yes, contact us 48 hrs in advance for custom designs" },
          { key: "ai_kb_extra",         label: "Anything Else",        placeholder: "Payment methods, social media, allergies policy, FAQs…", multiline: true },
        ];
        const INTENTS: { key: keyof AiSettings; label: string; desc: string }[] = [
          { key: "ai_intent_catalog", label: "Menu / Catalog",  desc: "Customer asks to see your menu or product list" },
          { key: "ai_intent_search",  label: "Product Search",  desc: "Customer searches for a specific product or cake" },
          { key: "ai_intent_agent",   label: "Agent Handoff",   desc: "Customer wants to talk to a human" },
          { key: "ai_intent_info",    label: "Business Info",   desc: "Customer asks about hours, location, sizes, delivery" },
        ];

        const INP2 = "w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-[15px] text-gray-800 focus:outline-none focus:bg-white focus:border-slate-400 focus:ring-2 focus:ring-slate-100 placeholder:text-gray-300 transition";

        return (
          <>
            {/* Backdrop */}
            <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setShowSet(false)} />

            {/* Right drawer */}
            <div className="fixed inset-y-0 right-0 z-50 flex w-[820px] flex-col bg-white shadow-2xl border-l border-gray-200">

              {/* ── Header ── */}
              <div className="flex items-center justify-between px-8 pt-7 pb-5 border-b border-gray-100 shrink-0">
                <h2 className="text-lg font-semibold text-gray-900">Settings</h2>
                <button type="button" onClick={() => setShowSet(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition">
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>
              </div>

              {/* ── Tab bar ── */}
              <div className="flex border-b border-gray-100 px-8 shrink-0">
                {([
                  { id: "flow", label: "Flow" },
                  { id: "ai",   label: "AI Instructions" },
                ] as const).map((t) => (
                  <button key={t.id} type="button" onClick={() => setSettingsTab(t.id)}
                    className={["py-4 mr-7 text-sm font-medium border-b-2 -mb-px transition-colors",
                      settingsTab === t.id
                        ? "border-slate-700 text-slate-800"
                        : "border-transparent text-gray-400 hover:text-gray-600",
                    ].join(" ")}>
                    {t.label}
                    {t.id === "ai" && aiSettings.openai_configured && (
                      <span className="ml-2 inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400 -translate-y-0.5" />
                    )}
                    {totalIssues > 0 && t.id === "flow" && (
                      <span className="ml-2 inline-flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold">{totalIssues}</span>
                    )}
                  </button>
                ))}
              </div>

              {/* ── Scrollable body ── */}
              <div className="flex-1 overflow-y-auto">

                {/* ── Flow tab ── */}
                {settingsTab === "flow" && (
                  <div className="px-8 py-8 flex flex-col gap-8">

                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-medium text-gray-700">Description</label>
                      <input value={flow.description} onChange={(e) => upFlow({ description: e.target.value })}
                        placeholder="What does this flow do? e.g. Helps customers place cake orders"
                        className={INP2} />
                      <p className="text-xs text-gray-400">Internal note — not shown to customers.</p>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-medium text-gray-700">
                        Trigger Keywords
                        <span className="font-normal text-gray-400 ml-1.5">— any of these start this flow</span>
                      </label>
                      <div className={[
                        "flex flex-wrap gap-2 rounded-xl border bg-gray-50 px-3.5 py-3 min-h-[52px] transition",
                        "focus-within:bg-white focus-within:border-gray-400 focus-within:ring-2 focus-within:ring-gray-100 border-gray-200",
                      ].join(" ")}>
                        {tags.map((t) => (
                          <span key={t} className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-700 border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-medium">
                            {t}
                            <button type="button" onClick={() => removeTag(t)} className="text-slate-400 hover:text-red-400 transition leading-none">×</button>
                          </span>
                        ))}
                        {!flow.isFallback && (
                          <input
                            placeholder={tags.length === 0 ? "Type keyword + Enter  (e.g. order, menu, hi)" : "Add more…"}
                            className="flex-1 min-w-[200px] text-sm bg-transparent focus:outline-none text-gray-700 placeholder:text-gray-300 py-0.5"
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(e.currentTarget.value); e.currentTarget.value = ""; }
                              if (e.key === "Backspace" && !e.currentTarget.value && tags.length) removeTag(tags[tags.length - 1]);
                            }}
                            onPaste={(e) => { e.preventDefault(); addTagsBulk(e.clipboardData.getData("text")); }}
                            onBlur={(e) => { if (e.currentTarget.value) { addTag(e.currentTarget.value); e.currentTarget.value = ""; } }}
                          />
                        )}
                        {flow.isFallback && (
                          <span className="text-sm text-gray-400 italic self-center">Not needed — this is the fallback flow</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400">Paste a comma-separated list to add many at once.</p>
                    </div>

                  </div>
                )}

                {/* ── AI Instructions tab ── */}
                {settingsTab === "ai" && (
                  <div className="px-8 py-8 flex flex-col gap-8">

                    {!aiLoaded ? (
                      <div className="animate-pulse space-y-5">
                        <div className="h-11 rounded-xl bg-gray-100" />
                        <div className="flex gap-2"><div className="h-16 flex-1 rounded-xl bg-gray-100" /><div className="h-16 flex-1 rounded-xl bg-gray-100" /></div>
                        {[...Array(4)].map((_, i) => (
                          <div key={i} className="space-y-2">
                            <div className="h-3 w-28 rounded-md bg-gray-100" />
                            <div className="h-12 rounded-xl bg-gray-100" />
                          </div>
                        ))}
                      </div>

                    ) : !aiSettings.openai_configured ? (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 flex items-start gap-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-amber-600">
                            <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                          </svg>
                        </div>
                        <div>
                          <p className="text-base font-semibold text-amber-900 mb-1">OpenAI not configured</p>
                          <p className="text-sm text-amber-700 leading-relaxed mb-4">Add your OpenAI API key in Integrations to enable AI Instructions.</p>
                          <Link href="/admin/integrations/openai"
                            className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-900 underline underline-offset-2 hover:text-amber-700 transition">
                            Integrations → OpenAI
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                          </Link>
                        </div>
                      </div>

                    ) : (
                      <>
                        {/* ── Usage & Limits ── */}
                        {(() => {
                          const tokenColor = aiSettings.ai_max_tokens <= 100 ? "text-emerald-600" : aiSettings.ai_max_tokens <= 250 ? "text-slate-700" : aiSettings.ai_max_tokens <= 400 ? "text-amber-500" : "text-red-500";
                          const limitColor = aiSettings.ai_daily_limit <= 100 ? "text-amber-500" : aiSettings.ai_daily_limit <= 300 ? "text-slate-700" : "text-emerald-600";
                          return (
                            <div>
                              <p className="text-sm font-semibold text-gray-700 mb-3">Usage &amp; Limits</p>
                              <div className="rounded-xl border border-gray-200 overflow-hidden divide-y divide-gray-100">

                                {/* Max tokens */}
                                <div className="px-5 py-4">
                                  <div className="flex items-center justify-between gap-4 mb-3">
                                    <div>
                                      <p className="text-sm font-semibold text-gray-800">Max tokens per reply</p>
                                      <p className="text-xs text-gray-400 mt-0.5">Shorter = cheaper &amp; faster. Longer = more detail.</p>
                                    </div>
                                    <div className="flex items-baseline gap-1.5 shrink-0">
                                      <span className={["text-2xl font-bold tabular-nums leading-none transition-colors", tokenColor].join(" ")}>{aiSettings.ai_max_tokens}</span>
                                      <span className="text-xs text-gray-400">tokens</span>
                                    </div>
                                  </div>
                                  <input type="range" min={50} max={500} step={10}
                                    value={aiSettings.ai_max_tokens}
                                    onChange={(e) => setAiSettings((s) => ({ ...s, ai_max_tokens: Number(e.target.value) }))}
                                    className="w-full h-1.5 rounded-full cursor-pointer accent-slate-700 transition-all" />
                                  <div className="flex justify-between text-xs mt-2">
                                    <span className="text-emerald-500 font-medium">50 — brief</span>
                                    <span className="text-slate-500 font-semibold">150 recommended</span>
                                    <span className="text-red-400 font-medium">500 — detailed</span>
                                  </div>
                                </div>

                                {/* Daily limit */}
                                <div className="px-5 py-4">
                                  <div className="flex items-center justify-between gap-4 mb-3">
                                    <div>
                                      <p className="text-sm font-semibold text-gray-800">Daily request limit</p>
                                      <p className="text-xs text-gray-400 mt-0.5">AI stops replying after this many calls. Resets at midnight.</p>
                                    </div>
                                    <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 rounded-md px-2 py-0.5 uppercase tracking-wide shrink-0">
                                      200 recommended
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <input type="range" min={50} max={1000} step={50}
                                      value={Math.min(aiSettings.ai_daily_limit, 1000)}
                                      onChange={(e) => setAiSettings((s) => ({ ...s, ai_daily_limit: Number(e.target.value) }))}
                                      className="flex-1 h-1.5 rounded-full cursor-pointer accent-slate-700" />
                                    <div className="flex items-baseline gap-1 shrink-0">
                                      <span className={["text-2xl font-bold tabular-nums leading-none transition-colors", limitColor].join(" ")}>{aiSettings.ai_daily_limit}</span>
                                      <span className="text-xs text-gray-400">/day</span>
                                    </div>
                                  </div>
                                  <div className="flex justify-between text-xs mt-2">
                                    <span className="text-amber-500 font-medium">50 — low</span>
                                    <span className="text-slate-500 font-semibold">200 recommended</span>
                                    <span className="text-emerald-500 font-medium">1000 — high</span>
                                  </div>

                                  {/* Today's usage status */}
                                  {(() => {
                                    const used      = aiSettings.ai_usage_today;
                                    const limit     = aiSettings.ai_daily_limit;
                                    const remaining = Math.max(0, limit - used);
                                    const pct       = Math.min(100, Math.round((used / limit) * 100));
                                    const barColor  = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-400" : "bg-emerald-500";
                                    const textColor = pct >= 90 ? "text-red-600" : pct >= 70 ? "text-amber-600" : "text-emerald-600";
                                    return (
                                      <div className="mt-4 rounded-xl bg-gray-50 border border-gray-200 px-4 py-3">
                                        <div className="flex items-center justify-between mb-2">
                                          <p className="text-xs font-semibold text-gray-600">Today&apos;s Usage</p>
                                          <p className="text-xs text-gray-400">Resets at midnight</p>
                                        </div>
                                        <div className="w-full h-2 rounded-full bg-gray-200 overflow-hidden">
                                          <div className={["h-2 rounded-full transition-all", barColor].join(" ")} style={{ width: `${pct}%` }} />
                                        </div>
                                        <div className="flex items-center justify-between mt-2">
                                          <span className={["text-xs font-bold", textColor].join(" ")}>{used} used</span>
                                          <span className="text-xs text-gray-400">{remaining} remaining of {limit}</span>
                                        </div>
                                      </div>
                                    );
                                  })()}
                                </div>

                              </div>
                            </div>
                          );
                        })()}

                        {/* ── Knowledge sub-tabs ── */}
                        <div>
                          <p className="text-sm font-medium text-gray-700 mb-3">Knowledge &amp; Behaviour</p>
                          <div className="flex gap-1 rounded-xl bg-gray-100 p-1 mb-6">
                            {([
                              { id: "fields", label: "Guided Fields",  desc: "Fill in simple fields" },
                              { id: "prompt", label: "Custom Prompt",  desc: "Write your own prompt" },
                            ] as const).map((t) => (
                              <button key={t.id} type="button" onClick={() => setKbTab(t.id)}
                                className={["flex-1 flex flex-col items-center rounded-lg py-2.5 transition-all",
                                  kbTab === t.id ? "bg-white shadow-sm" : "hover:bg-gray-50",
                                ].join(" ")}>
                                <span className={["text-sm font-medium", kbTab === t.id ? "text-gray-900" : "text-gray-400"].join(" ")}>{t.label}</span>
                                <span className="text-xs text-gray-400 mt-0.5">{t.desc}</span>
                              </button>
                            ))}
                          </div>

                          {/* Guided Fields */}
                          {kbTab === "fields" && (
                            <div className="flex flex-col gap-8">
                              <div className="grid grid-cols-2 gap-x-5 gap-y-5">
                                {KB_FIELDS.map((f) => f.multiline ? (
                                  <div key={f.key} className="col-span-2 flex flex-col gap-1.5">
                                    <label className="text-sm font-medium text-gray-700">{f.label}</label>
                                    <textarea rows={3} value={aiSettings[f.key] as string}
                                      onChange={(e) => setAiSettings((s) => ({ ...s, [f.key]: e.target.value }))}
                                      placeholder={f.placeholder} className={INP2 + " resize-none"} />
                                  </div>
                                ) : (
                                  <div key={f.key} className="flex flex-col gap-1.5">
                                    <label className="text-sm font-medium text-gray-700">{f.label}</label>
                                    <input type="text" value={aiSettings[f.key] as string}
                                      onChange={(e) => setAiSettings((s) => ({ ...s, [f.key]: e.target.value }))}
                                      placeholder={f.placeholder} className={INP2} />
                                  </div>
                                ))}
                              </div>

                            </div>
                          )}

                          {/* Custom Prompt */}
                          {kbTab === "prompt" && (
                            <div className="flex flex-col gap-4">
                              <div className="flex flex-col gap-1.5">
                                <label className="text-sm font-medium text-gray-700">System Prompt</label>
                                <textarea
                                  rows={10}
                                  value={aiSettings.ai_kb_prompt}
                                  onChange={(e) => setAiSettings((s) => ({ ...s, ai_kb_prompt: e.target.value }))}
                                  placeholder={buildCompiledPrompt(aiSettings)}
                                  className={INP2 + " resize-none font-mono text-sm leading-relaxed"}
                                />
                                <p className="text-xs text-gray-400">Leave empty to auto-generate from Guided Fields. A saved prompt always takes priority.</p>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* ── Intent toggles — always visible ── */}
                        <div>
                          <div className="flex items-center justify-between mb-4">
                            <div>
                              <p className="text-sm font-medium text-gray-700">Handle AI Response by Type</p>
                              <p className="text-xs text-gray-400 mt-0.5">AI detects intent and responds with the right type of reply.</p>
                            </div>
                            <button type="button"
                              onClick={() => setAiSettings((s) => ({ ...s, ai_intent_catalog: true, ai_intent_search: true, ai_intent_agent: true, ai_intent_info: true }))}
                              className="shrink-0 ml-4 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg px-3 py-1.5 transition">
                              Enable all
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            {INTENTS.map((intent) => {
                              const on = !!aiSettings[intent.key];
                              return (
                                <button key={intent.key} type="button" role="switch" aria-checked={on}
                                  onClick={() => setAiSettings((s) => ({ ...s, [intent.key]: !s[intent.key] }))}
                                  className={["relative flex items-start gap-3 rounded-xl border p-4 text-left transition-all",
                                    on ? "border-slate-300 bg-slate-50" : "border-gray-200 bg-gray-50 hover:bg-gray-100",
                                  ].join(" ")}>
                                  <span className="absolute top-3 right-3 text-[10px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5 uppercase tracking-wide">
                                    Recommended
                                  </span>
                                  <div className={["mt-0.5 relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors",
                                    on ? "bg-[#34c759]" : "bg-gray-300",
                                  ].join(" ")}>
                                    <span className={["inline-block h-4 w-4 transform rounded-full bg-white transition",
                                      on ? "translate-x-4" : "translate-x-0",
                                    ].join(" ")} />
                                  </div>
                                  <div className="min-w-0 pr-14">
                                    <p className={["text-sm font-semibold leading-tight", on ? "text-slate-800" : "text-gray-700"].join(" ")}>{intent.label}</p>
                                    <p className="text-xs text-gray-400 mt-0.5 leading-snug">{intent.desc}</p>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* ── Footer ── */}
              <div className="shrink-0 border-t border-gray-100 px-8 py-5 flex items-center bg-white">
                <div>
                  {settingsTab === "ai" && aiSettings.openai_configured && (
                    <button type="button" onClick={saveAi} disabled={aiSaving}
                      className="flex items-center gap-2 rounded-xl bg-brand text-white text-sm font-semibold px-5 py-2.5 hover:bg-brand-dark disabled:opacity-40 transition">
                      {aiSaving && (
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25"/>
                          <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                        </svg>
                      )}
                      {aiSaving ? "Saving…" : aiSaved ? "✓ Saved" : "Save AI Instructions"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </>
        );
      })()}

      <div className="flex flex-1 overflow-hidden">
        <div ref={canvasRef} className="flex-1 overflow-hidden relative"
          style={{ backgroundImage: "radial-gradient(circle,#c1c8d0 1px,transparent 1px)", backgroundSize:"28px 28px", backgroundColor:"#f3f5f7", userSelect:"none", WebkitUserSelect:"none" }}
          onMouseDown={onCanvasDown} onWheel={onWheel} onContextMenu={onCanvasContextMenu}>

          <div className="absolute bottom-4 left-4 z-10 flex items-center gap-0.5 bg-white rounded-xl border border-gray-200 shadow-sm p-1">
            <button type="button" onClick={() => setZoom((z) => Math.max(0.3, z - 0.1))}
              className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-600 font-bold text-lg leading-none">-</button>
            <span className="text-xs text-gray-400 min-w-[38px] text-center">{Math.round(zoom*100)}%</span>
            <button type="button" onClick={() => setZoom((z) => Math.min(2, z + 0.1))}
              className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-600 font-bold text-lg leading-none">+</button>
            <button type="button" onClick={() => { setZoom(1); setPan({ x:40, y:40 }); }}
              className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 text-xs" title="Reset">[ ]</button>
          </div>

          {flow.steps.length === 0 && (
            <div data-nd="1" className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 20 }}>
              <div className="bg-white rounded-2xl shadow border border-gray-200 p-8 text-center max-w-xs">
                <IcMsg size={36} className="mx-auto text-gray-300 mb-3" />
                <p className="font-bold text-gray-700 mb-1">No steps yet</p>
                <p className="text-sm text-gray-400 mb-4">Add your first step to start building the flow</p>
                <button type="button" onClick={() => setPickerCtx({})}
                  className="flex items-center gap-2 mx-auto rounded-xl bg-brand px-5 py-2 text-sm font-semibold text-white hover:bg-brand-dark transition cursor-pointer">
                  <IcPlus size={15} /> Add first step
                </button>
              </div>
            </div>
          )}

          <div style={{ transform:"translate("+pan.x+"px,"+pan.y+"px) scale("+zoom+")", transformOrigin:"0 0", width:4000, height:3000, position:"absolute" }}>
            <svg width={4000} height={3000} className="absolute inset-0" style={{ overflow:"visible" }}>
              <Connections steps={flow.steps} sel={selKey} linkLine={linkLine}
                onConnContextMenu={(sx, sy, fk, oi) => setConnCtx({ x: sx, y: sy, fromKey: fk, optIdx: oi })}
                onDisconnect={disconnectConn} />
              {selRectDraw && (
                <rect x={selRectDraw.x} y={selRectDraw.y} width={selRectDraw.w} height={selRectDraw.h}
                  fill="rgba(59,130,246,0.08)" stroke="#3b82f6" strokeWidth={1} strokeDasharray="4 3"
                  style={{ pointerEvents: "none" }} />
              )}
            </svg>
            {(() => {
              const CARD_H_APPROX = CARD_HEADER_H + CARD_MSG_H + CARD_FOOT_H + 3 * CARD_OPT_H;
              const rectHits: Set<string> = selRectDraw
                ? new Set(flow.steps.filter((s) => {
                    const sx = s._x ?? 0, sy = s._y ?? 0;
                    return sx < selRectDraw.x + selRectDraw.w && sx + CARD_W > selRectDraw.x &&
                           sy < selRectDraw.y + selRectDraw.h && sy + CARD_H_APPROX > selRectDraw.y;
                  }).map((s) => s.stepKey))
                : new Set<string>();
              return flow.steps.map((step) => (
              <div key={step.id ?? step._uid ?? step.stepKey}
                style={{ position:"absolute", left: step._x ?? 80, top: step._y ?? 80 }}>
                <StepNode step={step}
                  issues={flowIssues.get(step.stepKey) ?? []}
                  isSelected={selKeys.length <= 1 && !selRectDraw && selKey === step.stepKey}
                  isMultiSel={rectHits.has(step.stepKey) || (selKeys.length > 1 && selKeys.includes(step.stepKey))}
                  onSelect={(isShift) => {
                    if (isShift) {
                      setSelKeys((prev) => prev.includes(step.stepKey) ? prev.filter((k) => k !== step.stepKey) : [...prev, step.stepKey]);
                    } else {
                      setSelKey(step.stepKey);
                    }
                  }}
                  onDrag={(dx,dy) => moveStep(step.stepKey, dx, dy)}
                  onDelete={() => delStep(step.stepKey)}
                  onStartLink={(optIdx) => startLink(step.stepKey, optIdx)}
                  onRightClick={(x,y) => { setSelKey(step.stepKey); setCtxMenu({ x, y, stepKey: step.stepKey }); }}
                  onImgLoad={(h) => setFlow((f) => f ? { ...f, steps: f.steps.map((s) => s.stepKey === step.stepKey ? { ...s, _imgH: h } : s) } : f)} />
              </div>
            ));
            })()}
          </div>
        </div>

        {selKeys.length > 1 && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 rounded-2xl border border-gray-200 bg-white shadow-lg px-3 py-2">
            <span className="text-xs font-semibold text-blue-600 pr-2 border-r border-gray-200 mr-1">{selKeys.length} selected</span>
            <button type="button" title="Delete all" onClick={() => { upFlow({ steps: flow.steps.filter((s) => !selKeys.includes(s.stepKey)) }); setSelKeys([]); }}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-red-500 hover:bg-red-50 transition">
              <IcDel size={13} /> Delete
            </button>
            <button type="button" title="Disable all" onClick={() => { upFlow({ steps: flow.steps.map((s) => selKeys.includes(s.stepKey) ? { ...s, disabled: true } : s) }); }}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition">
              <IcBan size={13} /> Disable
            </button>
            <button type="button" title="Enable all" onClick={() => { upFlow({ steps: flow.steps.map((s) => selKeys.includes(s.stepKey) ? { ...s, disabled: false } : s) }); }}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-green-600 hover:bg-green-50 transition">
              <IcCheck size={13} /> Enable
            </button>
            <button type="button" title="Unlink all" onClick={() => {
              upFlow({ steps: flow.steps.map((s) => selKeys.includes(s.stepKey) ? { ...s, options: s.options.map((o) => ({ ...o, nextStepKey: "" })) } : s) });
            }}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition">
              <IcUnlink size={13} /> Unlink
            </button>
            <button type="button" title="Duplicate all" onClick={() => {
              const newSteps = selKeys.flatMap((key) => {
                const orig = flow.steps.find((s) => s.stepKey === key);
                if (!orig) return [];
                const uid = ++uidRef.current;
                return [{ ...orig, id: undefined, _uid: uid, stepKey: orig.stepKey + "_copy", _x: (orig._x ?? 0) + 40, _y: (orig._y ?? 0) + 40 }];
              });
              upFlow({ steps: [...flow.steps, ...newSteps] });
            }}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition">
              <IcDup size={13} /> Duplicate
            </button>
            <button type="button" onClick={() => setSelKeys([])}
              className="ml-1 rounded-lg border border-gray-200 p-1.5 text-gray-400 hover:bg-gray-50 transition"><IcX size={13} /></button>
          </div>
        )}

        {selStep && (
          <EditPanel step={selStep} allSteps={flow.steps}
            onChange={(s) => upStep(selStep.stepKey, s)}
            onClose={() => setSelKey(null)} />
        )}

        {showPreview && (
          <div className="w-64 border-l border-gray-200 bg-gray-50 flex flex-col shrink-0">
            <div className="px-3 py-2.5 border-b border-gray-200 flex items-center gap-2 shrink-0">
              <IcEye size={14} className="text-gray-400" />
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider flex-1">
                {simMode ? "Simulation" : "Preview"}
              </p>
              <button type="button" onClick={() => { setSimMode((v) => !v); }}
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-lg transition ${simMode ? "bg-purple-100 text-purple-600 hover:bg-purple-200" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
                {simMode ? "● Live" : "▶ Simulate"}
              </button>
            </div>
            <div className="flex-1 overflow-hidden p-3">
              <PhonePreview step={selStep} allSteps={flow.steps} simMode={simMode} onToggleSim={() => setSimMode(true)} />
            </div>
          </div>
        )}
      </div>

      {ctxMenu && (() => {
        const step = flow?.steps.find((s) => s.stepKey === ctxMenu.stepKey);
        if (!step) return null;
        return (
          <CtxMenu x={ctxMenu.x} y={ctxMenu.y} step={step}
            onClose={() => setCtxMenu(null)}
            onAddConnected={() => { setCtxMenu(null); setPickerCtx({ x: (step._x ?? 0) + CARD_W + 80, y: step._y ?? 0, fromKey: ctxMenu.stepKey }); }}
            onCopy={() => copyStep(ctxMenu.stepKey)}
            onDuplicate={() => duplicateStep(ctxMenu.stepKey)}
            onUnlink={() => unlinkStep(ctxMenu.stepKey)}
            onDisable={() => disableStep(ctxMenu.stepKey)}
            onEnable={() => enableStep(ctxMenu.stepKey)}
            onDelete={() => delStep(ctxMenu.stepKey)}
            onLabel={() => { const s = flow?.steps.find((x) => x.stepKey === ctxMenu.stepKey); setLabelEdit({ stepKey: ctxMenu.stepKey, value: s?.label ?? "" }); }} />
        );
      })()}

      {/* Label edit popover */}
      {labelEdit && flow && (() => {
        const s = flow.steps.find((x) => x.stepKey === labelEdit.stepKey);
        if (!s) return null;
        const sx = ((s._x ?? 0) + pan.x) * zoom;
        const sy = ((s._y ?? 0) + pan.y) * zoom - 60;
        return (
          <>
            <div className="fixed inset-0 z-50" onMouseDown={() => setLabelEdit(null)} />
            <div className="fixed z-50 bg-white rounded-xl shadow-xl border border-gray-200 p-3 flex flex-col gap-2"
              style={{ left: sx, top: sy, minWidth: 220 }}>
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Card label</p>
              <input autoFocus type="text" placeholder="Enter label…"
                className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-[#b08d57]/40"
                value={labelEdit.value}
                onChange={(e) => setLabelEdit({ ...labelEdit, value: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    upFlow({ steps: flow.steps.map((x) => x.stepKey === labelEdit.stepKey ? { ...x, label: labelEdit.value.trim() || undefined } : x) });
                    setLabelEdit(null);
                  } else if (e.key === "Escape") {
                    setLabelEdit(null);
                  }
                }} />
              <div className="flex gap-2 justify-end">
                {s.label && (
                  <button type="button" className="text-[12px] text-red-500 hover:text-red-600 px-2 py-1"
                    onClick={() => { upFlow({ steps: flow.steps.map((x) => x.stepKey === labelEdit.stepKey ? { ...x, label: undefined } : x) }); setLabelEdit(null); }}>
                    Remove
                  </button>
                )}
                <button type="button" className="text-[12px] bg-[#b08d57] text-white rounded-lg px-3 py-1 hover:bg-[#96753e]"
                  onClick={() => { upFlow({ steps: flow.steps.map((x) => x.stepKey === labelEdit.stepKey ? { ...x, label: labelEdit.value.trim() || undefined } : x) }); setLabelEdit(null); }}>
                  Save
                </button>
              </div>
            </div>
          </>
        );
      })()}

      {/* Connection right-click context menu */}
      {connCtx && (
        <>
          <div className="fixed inset-0 z-40" onMouseDown={() => setConnCtx(null)} />
          <div className="fixed z-50 bg-white rounded-xl shadow-xl border border-gray-200 py-1.5 min-w-[160px]"
            style={{ left: connCtx.x, top: connCtx.y }}>
            <button type="button"
              onClick={() => { disconnectConn(connCtx.fromKey, connCtx.optIdx); setConnCtx(null); }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-red-500 hover:bg-red-50 transition text-left">
              <IcUnlink size={13} className="text-red-400" /> Disconnect
            </button>
          </div>
        </>
      )}

      {/* Canvas right-click menu */}
      {canvasCtx && (
        <>
          <div className="fixed inset-0 z-40" onMouseDown={() => setCanvasCtx(null)} />
          <div className="fixed z-50 bg-white rounded-xl shadow-xl border border-gray-200 py-1.5 min-w-[185px]"
            style={{ left: canvasCtx.screenX, top: canvasCtx.screenY }}>
            <button type="button"
              onClick={() => { setPickerCtx({ x: canvasCtx.canvasX, y: canvasCtx.canvasY }); setCanvasCtx(null); }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition text-left">
              <IcPlus size={14} className="text-blue-500" /> Add step here…
            </button>
            {clipRef.current && (
              <>
                <div className="my-1 border-t border-gray-100" />
                <button type="button"
                  onClick={() => { pasteStep(); setCanvasCtx(null); }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50 transition text-left">
                  <span className="text-gray-400"><IcCopy size={13} /></span>
                  <span className="flex-1">Paste</span>
                  <span className="text-[10px] text-gray-300">Ctrl+V</span>
                </button>
              </>
            )}
            <div className="my-1 border-t border-gray-100" />
            <button type="button"
              onClick={() => { setZoom(1); setPan({ x: 40, y: 40 }); setCanvasCtx(null); }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50 transition text-left">
              <span className="text-gray-400"><IcBack size={13} /></span> Reset view
            </button>
          </div>
        </>
      )}

      {/* Make.com-style module picker */}
      {pickerCtx !== null && (
        <ModulePicker
          onSelect={(mod) => {
            addStep(mod.inputType, pickerCtx.x, pickerCtx.y, pickerCtx.fromKey, mod.dataSource, mod.stepPatch);
          }}
          onClose={() => setPickerCtx(null)}
        />
      )}
    </div>
  );
}