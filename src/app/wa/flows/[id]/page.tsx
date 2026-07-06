"use client";

import { useState, useEffect, use, useRef } from "react";
import { useRouter } from "next/navigation";

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
  isEntry: boolean; showProductCard: boolean;
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
    if (!s.message.trim()) add(s.stepKey, { severity: "warn", label: "No message" });
    if ((s.inputType === "button" || s.inputType === "list") && s.options.length === 0) add(s.stepKey, { severity: "error", label: "No options" });
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
      ...s, showProductCard: s.showProductCard ?? false, imageUrl: s.imageUrl ?? "", isFallback: s.isFallback ?? false,
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
function newStep(n = 0, x = 80, y = 120): Step { return { stepKey: `step_${n + 1}`, message: "", inputType: "button", isEntry: n === 0, isFallback: false, showProductCard: false, imageUrl: "", sortOrder: n, options: [newOption()], _x: x, _y: y }; }
function newFallbackStep(n = 1): Step { return { stepKey: "fallback", message: "Sorry, I didn't understand that.\n\nHere's what I can help you with:", inputType: "button", isEntry: false, isFallback: true, showProductCard: false, imageUrl: "", sortOrder: n, options: [{ ...newOption(0), label: "Main Menu", value: "main_menu", nextStepKey: "step_1" }], _x: 80, _y: 340 }; }

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
const LBL = "block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5";

type LinkLine = { x1: number; y1: number; x2: number; y2: number };

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
  const cfg     = step.isFallback ? { ...CFG[step.inputType], color: "#64748b" } : CFG[step.inputType];
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
        {/* Message preview */}
        <div className="px-3.5 py-2.5" style={{ height: CARD_MSG_H, overflow: "hidden" }}>
          <p className="text-[11px] text-gray-600 line-clamp-3" style={{ whiteSpace: "normal", wordBreak: "break-word" }}>
            {step.message
              ? step.message.replace(/\n+/g, " ")
              : <span className="italic text-gray-300">No message yet…</span>}
          </p>
        </div>
        {/* Options — no dots here, they're rendered outside */}
        {step.options.length === 0 ? (
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
        <input value={opt.label} maxLength={isBtn ? 20 : 24}
          onChange={(e) => onChange({ ...opt, label: e.target.value, value: opt.value || slugify(e.target.value) })}
          placeholder={dyn ? "Fallback label..." : "Option label..."}
          className="flex-1 text-sm text-gray-800 bg-transparent focus:outline-none min-w-0 placeholder:text-gray-300" />
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
  useEffect(() => { setDraftKey(step.stepKey); }, [step.stepKey]);
  const taRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = taRef.current; if (!el) return;
    el.style.height = "auto"; el.style.height = el.scrollHeight + "px";
  }, [step.message]);
  const draftDup = draftKey !== step.stepKey && allSteps.some((s) => s.stepKey === draftKey);

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
                onBlur={commitKey}
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
        <div>
          <label className={LBL}>Step type</label>
          <div className="grid grid-cols-2 gap-2">
            {(Object.entries(CFG) as [ST, typeof CFG[ST]][]).map(([t, c]) => (
              <button key={t} type="button" onClick={() => onChange({ ...step, inputType: t as ST })}
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
        <div>
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
        </div>
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
          <div className="rounded-xl border border-purple-200 bg-purple-50 p-4 space-y-3">
            <p className="text-[11px] font-bold text-purple-700 uppercase tracking-wider">Search configuration</p>
            <div>
              <label className={LBL}>Where to search</label>
              <select value={srchOpt.dataSource} onChange={(e) => onChange({ ...step, options: [{ ...srchOpt, dataSource: e.target.value }] })} className={INP}>
                <option value="woocommerce_search">WooCommerce products</option>
                <option value="custom_api_search">Custom API</option>
              </select>
            </div>
            <div>
              <label className={LBL}>After customer taps a result</label>
              <select value={srchOpt.nextStepKey} onChange={(e) => onChange({ ...step, options: [{ ...srchOpt, nextStepKey: e.target.value }] })} className={INP}>
                <option value="">End flow</option>
                {stepKeys.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
            {srchOpt.dataSource === "custom_api_search" && (
              <ApiFields opt={srchOpt} isSearch={true} onChange={(o) => onChange({ ...step, options: [o] })} />
            )}
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={step.showProductCard}
                onChange={(e) => onChange({ ...step, showProductCard: e.target.checked })} className="rounded accent-purple-600" />
              <span className="text-sm text-gray-700">Show product card after selection</span>
            </label>
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
        {isInter && hasProd && (
          <button type="button" onClick={() => onChange({ ...step, showProductCard: !step.showProductCard })}
            className={"w-full flex items-center gap-3 rounded-xl border-2 px-3.5 py-3 text-left transition " + (step.showProductCard ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:border-blue-200")}>
            <div className={"shrink-0 h-5 w-9 rounded-full transition-colors " + (step.showProductCard ? "bg-blue-500" : "bg-gray-200")}>
              <span className={"block h-4 w-4 rounded-full bg-white shadow mt-0.5 transition-transform " + (step.showProductCard ? "translate-x-[18px]" : "translate-x-0.5")} />
            </div>
            <div>
              <p className={"text-sm font-semibold " + (step.showProductCard ? "text-blue-700" : "text-gray-700")}>Show product card</p>
              <p className="text-[11px] text-gray-400">Image + price + link after product selection</p>
            </div>
          </button>
        )}
        {isInter && (
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
  const isAnn  = step.inputType === "message";
  const dynOpt = step.options.find((o) => o.dataSource !== "static");
  const stBtns = step.options.filter((o) => o.dataSource === "static");
  const dBtns  = dynOpt ? [{l:"Option 1",k:""},{l:"Option 2",k:""},{l:"Option 3",k:""}] : stBtns.map((o) => ({l:o.label||"Option",k:o.nextStepKey}));
  return (
    <div className="bg-white rounded-xl rounded-tl-none shadow-sm overflow-hidden max-w-[90%]">
      {step.imageUrl && <img src={step.imageUrl} alt="" className="w-full" onError={(e) => { (e.target as HTMLImageElement).style.display="none"; }} />}
      <p className="px-2.5 py-2 text-[10px] text-gray-800 leading-relaxed whitespace-pre-wrap">
        {fillVars(step.message) || <span className="italic text-gray-400">Message text...</span>}
      </p>
      {step.inputType === "button" && (
        <div className="border-t border-gray-100">
          {dBtns.map((b, i) => (
            <button key={i} type="button" onClick={() => !dynOpt && onChoose(b.k, b.l)}
              className={"w-full text-center text-[10px] font-medium text-[#0a82ff] py-1.5 transition " + (i>0?"border-t border-gray-100 ":"") + (dynOpt?"opacity-40 cursor-default":"hover:bg-blue-50")}>
              {b.l}
            </button>
          ))}
          {dynOpt && <div className="py-1 text-center text-[9px] text-amber-500 bg-amber-50 border-t border-amber-100">Live from API · tap to simulate</div>}
        </div>
      )}
      {step.inputType === "list" && (
        <div className="border-t border-gray-100">
          {dBtns.map((b,i) => (
            <button key={i} type="button" onClick={() => !dynOpt && onChoose(b.k, b.l)}
              className={"w-full text-left px-2.5 py-1.5 text-[10px] text-[#0a82ff] transition " + (i>0?"border-t border-gray-100 ":"") + (dynOpt?"opacity-40":"hover:bg-blue-50")}>
              {b.l}
            </button>
          ))}
          {dynOpt && <div className="py-1 text-center text-[9px] text-amber-500 bg-amber-50 border-t border-amber-100">Dynamic list</div>}
        </div>
      )}
      {isAnn && <p className="px-2.5 pb-1.5 text-[9px] text-gray-400 italic">Continues automatically →</p>}
      {isSrch && <p className="px-2.5 pb-1.5 text-[9px] text-purple-500 italic">Waiting for customer to search…</p>}
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
      <div className="flex flex-col items-center gap-3">
        <button type="button" onClick={onToggleSim} className="text-[11px] text-blue-500 hover:underline self-start">▶ Simulate flow</button>
        <StepBubble step={step} onChoose={() => {}} vars={vars} />
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
      <div ref={chatRef} className="flex-1 bg-[#e5ddd5] rounded-xl p-2.5 overflow-y-auto space-y-2 min-h-0">
        {history.map((h, i) => (
          <div key={i} className="space-y-1.5">
            {h.step.message && <StepBubble step={h.step} onChoose={i === history.length - 1 ? choose : () => {}} vars={vars} />}
            {h.chosen && (
              <div className="flex justify-end">
                <div className="bg-[#dcf8c6] rounded-xl rounded-tr-none px-2 py-1.5 text-[10px] text-gray-700">{h.chosen}</div>
              </div>
            )}
          </div>
        ))}
        {history.length === 0 && <p className="text-[10px] text-gray-400 text-center pt-4">No entry step set</p>}
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
  onAddConnected: (type: ST) => void;
  onCopy: () => void; onDelete: () => void; onDuplicate: () => void;
  onDisable: () => void; onEnable: () => void; onUnlink: () => void;
  onLabel: () => void;
};
function CtxMenu({ x, y, step, onClose, onAddConnected, onCopy, onDelete, onDuplicate, onDisable, onEnable, onUnlink, onLabel }: CtxMenuProps) {
  const [showAdd, setShowAdd] = useState(false);
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
            <button type="button" onClick={() => setShowAdd((v) => !v)}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-left text-gray-700 hover:bg-gray-50 transition">
              <span className="text-gray-400"><IcPlus size={13} /></span>
              <span className="flex-1">Add connected step</span>
              <span className="text-gray-300 text-xs">{showAdd ? "▲" : "▼"}</span>
            </button>
            {showAdd && (
              <div className="mx-2 mb-1 bg-gray-50 rounded-lg overflow-hidden border border-gray-100">
                {(Object.entries(CFG) as [ST, typeof CFG[ST]][]).map(([t, c]) => (
                  <button key={t} type="button" onClick={() => { onAddConnected(t); onClose(); }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-white transition text-left">
                    <span style={{ color: c.color }}><c.ic size={12} /></span> {c.label}
                  </button>
                ))}
              </div>
            )}
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
  const [pan,         setPan]         = useState({ x: 40, y: 40 });
  const [zoom,        setZoom]        = useState(1);
  const [ctxMenu,     setCtxMenu]     = useState<{ x: number; y: number; stepKey: string } | null>(null);
  const [labelEdit,   setLabelEdit]   = useState<{ stepKey: string; value: string } | null>(null);
  const [connCtx,     setConnCtx]     = useState<{ x: number; y: number; fromKey: string; optIdx: number } | null>(null);
  const [canvasCtx,   setCanvasCtx]   = useState<{ screenX: number; screenY: number; canvasX: number; canvasY: number } | null>(null);
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

  function addStep(type: ST = "button", x?: number, y?: number, fromKey?: string) {
    if (!flow) return;
    const n = flow.steps.filter((s) => !s.isFallback).length;
    const s = newStep(n, x ?? (n === 0 ? 80 : 80 + Math.round(Math.random() * 220)), y ?? (n === 0 ? 120 : 100 + Math.round(Math.random() * 280)));
    s._uid = ++uidRef.current;
    s.inputType = type;
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
        triggerKeywords: flow.triggerKeywords, isActive: flow.isActive, isFallback: flow.isFallback,
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
      <svg className="animate-spin text-blue-500" width={32} height={32} viewBox="0 0 24 24" fill="none">
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
            className={"relative flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-medium transition " + (showSet ? "border-blue-400 text-blue-600 bg-blue-50" : "border-gray-200 text-gray-600 hover:bg-gray-100")}>
            <IcGear size={15} /> Settings
            {totalIssues > 0 && <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">{totalIssues}</span>}
          </button>
          <button type="button" onClick={() => setShowPreview((v) => !v)}
            className={"flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-medium transition " + (showPreview ? "border-blue-400 text-blue-600 bg-blue-50" : "border-gray-200 text-gray-600 hover:bg-gray-100")}>
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
          <button type="button" onClick={() => addStep()}
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
          const t = raw.trim().toLowerCase().replace(/[^a-z0-9_\- ]/g, "");
          if (!t || tags.includes(t)) return;
          upFlow({ triggerKeywords: [...tags, t].join(", ") });
        }
        function removeTag(t: string) { upFlow({ triggerKeywords: tags.filter((k) => k !== t).join(", ") }); }
        return (
          <>
            {/* Backdrop */}
            <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" onClick={() => setShowSet(false)} />
            {/* Modal */}
            <div className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <IcGear size={16} className="text-gray-500" />
                  <h2 className="text-sm font-bold text-gray-800">Flow settings</h2>
                  {totalIssues > 0 && <span className="h-5 min-w-[20px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1">{totalIssues}</span>}
                </div>
                <button type="button" onClick={() => setShowSet(false)}
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition">
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>
              </div>
              {/* Body */}
              <div className="px-5 py-5 flex flex-col gap-5">
                {/* Description */}
                <div>
                  <label className={LBL}>Description</label>
                  <input value={flow.description} onChange={(e) => upFlow({ description: e.target.value })}
                    placeholder="What does this flow do?" className={INP} />
                </div>
                {/* Keywords */}
                <div>
                  <label className={LBL}>Trigger keywords <span className="normal-case font-normal text-gray-300 ml-1">— customer types any of these to start this flow</span></label>
                  <div className="flex flex-wrap gap-1.5 rounded-xl border border-gray-200 bg-white px-2.5 py-2 min-h-[44px] focus-within:ring-2 focus-within:ring-blue-100">
                    {tags.map((t) => (
                      <span key={t} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg px-2 py-0.5 text-xs font-medium">
                        {t}
                        <button type="button" onClick={() => removeTag(t)} className="text-blue-400 hover:text-red-400 transition leading-none">×</button>
                      </span>
                    ))}
                    {!flow.isFallback && (
                      <input
                        placeholder={tags.length === 0 ? "Type keyword + Enter  (e.g. order, menu, hi)" : "Add more…"}
                        className="flex-1 min-w-[120px] text-sm bg-transparent focus:outline-none text-gray-700 placeholder:text-gray-300"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(e.currentTarget.value); e.currentTarget.value = ""; }
                          if (e.key === "Backspace" && !e.currentTarget.value && tags.length) removeTag(tags[tags.length - 1]);
                        }}
                        onBlur={(e) => { if (e.currentTarget.value) { addTag(e.currentTarget.value); e.currentTarget.value = ""; } }}
                      />
                    )}
                    {flow.isFallback && <span className="text-xs text-gray-400 italic self-center">Not needed — this is the fallback flow</span>}
                  </div>
                </div>
              </div>
              {/* Footer */}
              <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
                <button type="button" onClick={() => setShowSet(false)}
                  className="rounded-xl bg-gray-800 text-white text-sm font-semibold px-5 py-2 hover:bg-gray-700 transition">
                  Done
                </button>
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
                <button type="button" onClick={() => addStep()}
                  className="flex items-center gap-2 mx-auto rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition cursor-pointer">
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
            onAddConnected={(t) => addStep(t, (step._x ?? 0) + CARD_W + 80, step._y ?? 0, ctxMenu.stepKey)}
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
            <p className="px-3.5 pt-1 pb-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Add step here</p>
            {(Object.entries(CFG) as [ST, typeof CFG[ST]][]).map(([t, c]) => (
              <button key={t} type="button"
                onClick={() => { addStep(t, canvasCtx.canvasX, canvasCtx.canvasY); setCanvasCtx(null); }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50 transition text-left">
                <span style={{ color: c.color }}><c.ic size={14} /></span> {c.label} step
              </button>
            ))}
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
    </div>
  );
}