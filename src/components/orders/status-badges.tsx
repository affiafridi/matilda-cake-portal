import type { OrderStatus, PaymentStatus } from "@prisma/client";

const ORDER_STATUS_STYLE: Record<
  OrderStatus,
  { label: string; cls: string }
> = {
  RECEIVED: {
    label: "Pending",
    cls: "bg-cream text-ink",
  },
  CONFIRMED: {
    label: "Confirmed",
    cls: "bg-brand/10 text-brand",
  },
  PREPARING: {
    label: "In progress",
    cls: "bg-caramel/15 text-caramel",
  },
  READY: {
    label: "Ready",
    cls: "bg-success/15 text-success",
  },
  OUT_FOR_DELIVERY: {
    label: "Out for delivery",
    cls: "bg-caramel/20 text-caramel",
  },
  DELIVERED: {
    label: "Delivered",
    cls: "bg-success/15 text-success",
  },
  CANCELLED: {
    label: "Cancelled",
    cls: "bg-ink-muted/15 text-ink-muted",
  },
};

const PAYMENT_STATUS_STYLE: Record<
  PaymentStatus,
  { label: string; cls: string }
> = {
  UNPAID: { label: "Unpaid", cls: "bg-danger/10 text-danger" },
  PARTIAL: { label: "Partial", cls: "bg-caramel/15 text-caramel" },
  PAID: { label: "Paid", cls: "bg-success/15 text-success" },
  REFUNDED: { label: "Refunded", cls: "bg-ink-muted/15 text-ink-muted" },
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const s = ORDER_STATUS_STYLE[status];
  return (
    <span
      className={[
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
        s.cls,
      ].join(" ")}
    >
      {s.label}
    </span>
  );
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const s = PAYMENT_STATUS_STYLE[status];
  return (
    <span
      className={[
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
        s.cls,
      ].join(" ")}
    >
      {s.label}
    </span>
  );
}
