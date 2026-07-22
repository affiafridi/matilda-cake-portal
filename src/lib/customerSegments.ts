export type SegmentKey = "vip" | "high_purchase" | "repeat" | "new_customer" | "at_risk";

export const SEGMENT_META: Record<SegmentKey, {
  label:       string;
  description: string;
  badge:       string; // tailwind classes
}> = {
  vip:           { label: "VIP",           description: "3+ orders & AED 500+ spend",  badge: "bg-amber-50 text-amber-700 border-amber-200" },
  high_purchase: { label: "High Purchase", description: "Total spend ≥ AED 500",        badge: "bg-purple-50 text-purple-700 border-purple-200" },
  repeat:        { label: "Repeat",        description: "2 or more orders",             badge: "bg-blue-50 text-blue-700 border-blue-200" },
  new_customer:  { label: "New",           description: "First-time buyer",             badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  at_risk:       { label: "At Risk",       description: "No order in 60+ days",         badge: "bg-red-50 text-red-600 border-red-200" },
};

export const SEGMENT_ORDER: SegmentKey[] = [
  "vip", "high_purchase", "repeat", "new_customer", "at_risk",
];

const HIGH_SPEND_AED = 500;
const REPEAT_MIN     = 2;
const VIP_MIN_ORDERS = 3;
const AT_RISK_DAYS   = 60;

export type OrderStat = {
  orderCount:         number;
  totalSpend:         number;
  daysSinceLastOrder: number | null;
};

export function calcSegments(stat: OrderStat): SegmentKey[] {
  if (stat.orderCount === 0) return [];

  const segs: SegmentKey[] = [];
  const isHigh   = stat.totalSpend  >= HIGH_SPEND_AED;
  const isRepeat = stat.orderCount  >= REPEAT_MIN;
  const isVip    = isRepeat && isHigh && stat.orderCount >= VIP_MIN_ORDERS;

  if (isVip)          segs.push("vip");
  else if (isHigh)    segs.push("high_purchase");
  else if (isRepeat)  segs.push("repeat");
  else                segs.push("new_customer");

  if (stat.daysSinceLastOrder !== null && stat.daysSinceLastOrder >= AT_RISK_DAYS)
    segs.push("at_risk");

  return segs;
}
