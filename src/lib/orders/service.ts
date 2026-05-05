import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildOrderNumber, buildTrackingCode } from "./codes";
import type { CreateOrderInput, ListOrdersQuery } from "./schema";

const MAX_CODE_RETRIES = 5;

/**
 * Persist a new order. `orderNumber` and `trackingCode` are generated
 * server-side; on the rare chance of a unique-constraint collision we
 * retry up to MAX_CODE_RETRIES times with fresh codes.
 *
 * `orderStatus` and `paymentStatus` fall back to Prisma defaults
 * (RECEIVED / UNPAID) unless explicitly provided.
 */
export async function createOrder(input: CreateOrderInput) {
  for (let attempt = 0; attempt < MAX_CODE_RETRIES; attempt++) {
    const orderNumber = buildOrderNumber();
    const trackingCode = buildTrackingCode();

    try {
      return await prisma.order.create({
        data: {
          orderNumber,
          trackingCode,

          customerId: input.customerId,
          customerName: input.customerName,
          customerPhone: input.customerPhone,
          whatsappNumber: input.whatsappNumber,
          customerEmail: input.customerEmail,

          deliveryDate: input.deliveryDate,
          deliveryTime: input.deliveryTime,
          deliveryAddress: input.deliveryAddress,
          deliveryMapLink: input.deliveryMapLink,

          orderItems: input.orderItems,
          cakeFlavor: input.cakeFlavor,
          cakeMessage: input.cakeMessage,
          cakeSponge: input.cakeSponge,
          cakeSize: input.cakeSize,
          customCakeSize: input.customCakeSize,

          paymentMethod: input.paymentMethod,
          ...(input.paymentStatus ? { paymentStatus: input.paymentStatus } : {}),
          totalAmount: input.totalAmount,
          advanceAmount: input.advanceAmount,
          balanceAmount: input.balanceAmount,

          source: input.source,
          notes: input.notes,
          createdById: input.createdById,
          assignedChefId: input.assignedChefId,
          // orderStatus omitted → Prisma default RECEIVED

          // Structured line items — created atomically via nested write.
          // Empty array stays an empty array (no items relation written).
          ...(input.items && input.items.length > 0
            ? {
                items: {
                  create: input.items.map((it) => ({
                    itemName: it.itemName,
                    quantity: it.quantity,
                    unitPrice: it.unitPrice,
                    totalPrice: it.totalPrice,
                    sizeLabel: it.sizeLabel,
                    notes: it.notes,
                    woocommerceProductId: it.woocommerceProductId,
                    woocommerceVariationId: it.woocommerceVariationId,
                    variationName: it.variationName,
                  })),
                },
              }
            : {}),
        },
        include: {
          items: { orderBy: { createdAt: "asc" } },
        },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002" &&
        Array.isArray(e.meta?.target) &&
        (e.meta.target as string[]).some(
          (t) => t === "orderNumber" || t === "trackingCode",
        )
      ) {
        // Code collision — try again with fresh codes.
        continue;
      }
      throw e;
    }
  }

  throw new Error(
    "Failed to allocate a unique order code after multiple attempts",
  );
}

/** Fetch an order by its public tracking code, with related entities. */
export function getOrderByTrackingCode(trackingCode: string) {
  return prisma.order.findUnique({
    where: { trackingCode },
    include: {
      customer: true,
      createdBy: {
        select: { id: true, name: true, email: true, role: true },
      },
      assignedChef: {
        select: { id: true, name: true, email: true, role: true },
      },
      items: { orderBy: { createdAt: "asc" } },
      statusHistory: {
        orderBy: { createdAt: "desc" },
        include: {
          changedBy: { select: { id: true, name: true } },
        },
      },
    },
  });
}

/**
 * List orders with optional filters. `deliveryDate` filters the entire
 * UTC day. Pagination defaults to 50 newest orders.
 */
export async function listOrders(filters: ListOrdersQuery) {
  const where: Prisma.OrderWhereInput = {};

  if (filters.orderStatus) {
    where.orderStatus = filters.orderStatus;
  }

  if (filters.deliveryDate) {
    const start = new Date(filters.deliveryDate);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    where.deliveryDate = { gte: start, lt: end };
  }

  const [items, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: filters.take,
      skip: filters.skip,
      include: {
        items: { orderBy: { createdAt: "asc" } },
      },
    }),
    prisma.order.count({ where }),
  ]);

  return {
    items,
    total,
    take: filters.take,
    skip: filters.skip,
  };
}
