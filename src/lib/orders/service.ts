import { Prisma, type User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AuthError } from "@/lib/auth/errors";
import { buildOrderNumber, buildTrackingCode } from "./codes";
import type {
  CreateOrderInput,
  ListOrdersQuery,
  UpdateOrderInput,
} from "./schema";

const MAX_CODE_RETRIES = 5;

/**
 * Thrown when business rules reject an otherwise well-formed request.
 * The HTTP layer maps this to a 400 response.
 */
export class OrderValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderValidationError";
  }
}

/**
 * Persist a new order. `orderNumber` and `trackingCode` are generated
 * server-side; on the rare chance of a unique-constraint collision we
 * retry up to MAX_CODE_RETRIES times with fresh codes.
 *
 * `orderStatus` and `paymentStatus` fall back to Prisma defaults
 * (RECEIVED / UNPAID) unless explicitly provided.
 */
export async function createOrder(input: CreateOrderInput) {
  // Resolve and validate the branch. Compose the snapshot label
  // server-side so the client can't supply a fake "Parent - Child" string.
  const branch = await prisma.branch.findUnique({
    where: { id: input.branchId },
    select: {
      id: true,
      name: true,
      isActive: true,
      parent: { select: { name: true } },
    },
  });
  if (!branch || !branch.isActive) {
    throw new OrderValidationError("Selected branch is not available.");
  }
  const branchName = branch.parent
    ? `${branch.parent.name} - ${branch.name}`
    : branch.name;

  // Server-side derivation of balance + payment status from total/advance.
  // Never trust the client for derived money values.
  const totalNum =
    input.totalAmount !== null && input.totalAmount !== undefined
      ? Number(input.totalAmount)
      : null;
  const advanceNum =
    input.advanceAmount !== null && input.advanceAmount !== undefined
      ? Number(input.advanceAmount)
      : 0;
  let derivedBalance = input.balanceAmount;
  let derivedPaymentStatus = input.paymentStatus;
  if (totalNum !== null) {
    derivedBalance = Math.max(0, Number((totalNum - advanceNum).toFixed(2)));
    derivedPaymentStatus =
      advanceNum >= totalNum
        ? "PAID"
        : advanceNum > 0
          ? "PARTIAL"
          : "UNPAID";
  }

  for (let attempt = 0; attempt < MAX_CODE_RETRIES; attempt++) {
    const orderNumber = buildOrderNumber();
    const trackingCode = buildTrackingCode();

    try {
      return await prisma.order.create({
        data: {
          orderNumber,
          trackingCode,

          branchId: branch.id,
          branchName,

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
          ...(derivedPaymentStatus
            ? { paymentStatus: derivedPaymentStatus }
            : {}),
          totalAmount: input.totalAmount,
          advanceAmount: input.advanceAmount,
          balanceAmount: derivedBalance,

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
                    isCustom: it.isCustom,
                    customSize: it.customSize,
                    referenceImageUrl: it.referenceImageUrl,
                    referenceImageName: it.referenceImageName,
                    referenceImageType: it.referenceImageType,
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

  if (filters.createdById) {
    where.createdById = filters.createdById;
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

// =====================================================
// updateOrder
// =====================================================

/**
 * Edit an existing order. Re-derives balance + paymentStatus from total
 * and advance, writes an OrderAmountChange row whenever money moves, and
 * enforces status / role locking inside a single transaction.
 */
export async function updateOrder(args: {
  trackingCode: string;
  actor: User;
  input: UpdateOrderInput;
}) {
  const { trackingCode, actor, input } = args;

  return await prisma.$transaction(async (tx) => {
    const existing = await tx.order.findUnique({
      where: { trackingCode },
      include: { items: true },
    });
    if (!existing) throw new OrderValidationError("Order not found.");

    // Coordinators can only edit orders they created.
    if (
      actor.role === "COORDINATOR" &&
      existing.createdById !== actor.id
    ) {
      throw new AuthError(403, "You can only edit your own orders.");
    }

    // Status-based lock: DELIVERED / CANCELLED orders are read-only for
    // everyone except SUPER_ADMIN.
    if (
      (existing.orderStatus === "DELIVERED" ||
        existing.orderStatus === "CANCELLED") &&
      actor.role !== "SUPER_ADMIN"
    ) {
      throw new OrderValidationError(
        "This order is locked. A Super Admin must edit it.",
      );
    }

    // orderStatus is admin-only.
    if (
      input.orderStatus &&
      actor.role !== "SUPER_ADMIN" &&
      actor.role !== "ADMIN"
    ) {
      throw new AuthError(403, "Only admins can change order status.");
    }

    // Resolve branch + branchName snapshot if branch is changing.
    let branchUpdate:
      | { branchId: string; branchName: string }
      | undefined;
    if (input.branchId && input.branchId !== existing.branchId) {
      const branch = await tx.branch.findUnique({
        where: { id: input.branchId },
        select: {
          id: true,
          name: true,
          isActive: true,
          parent: { select: { name: true } },
        },
      });
      if (!branch || !branch.isActive) {
        throw new OrderValidationError("Selected branch is not available.");
      }
      branchUpdate = {
        branchId: branch.id,
        branchName: branch.parent
          ? `${branch.parent.name} - ${branch.name}`
          : branch.name,
      };
    }

    // ----- Money: re-derive balance + status from total + advance -----
    const prevTotal = Number(existing.totalAmount ?? 0);
    const prevAdvance = Number(existing.advanceAmount ?? 0);
    const prevBalance = Number(existing.balanceAmount ?? 0);

    const newTotalRaw =
      input.totalAmount !== undefined
        ? input.totalAmount
        : existing.totalAmount === null
          ? null
          : Number(existing.totalAmount);
    const newAdvanceRaw =
      input.advanceAmount !== undefined
        ? input.advanceAmount
        : existing.advanceAmount === null
          ? null
          : Number(existing.advanceAmount);

    const newTotal = newTotalRaw === null ? null : Number(newTotalRaw);
    const newAdvance = newAdvanceRaw === null ? 0 : Number(newAdvanceRaw);

    let derivedBalance: number | null =
      existing.balanceAmount === null
        ? null
        : Number(existing.balanceAmount);
    let derivedPaymentStatus = existing.paymentStatus;
    if (newTotal !== null) {
      derivedBalance = Math.max(
        0,
        Number((newTotal - newAdvance).toFixed(2)),
      );
      derivedPaymentStatus =
        newAdvance >= newTotal
          ? "PAID"
          : newAdvance > 0
            ? "PARTIAL"
            : "UNPAID";
    }

    const moneyChanged =
      (newTotal ?? prevTotal) !== prevTotal ||
      (newAdvance ?? 0) !== prevAdvance;

    // ----- Update the Order row -----
    await tx.order.update({
      where: { id: existing.id },
      data: {
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        whatsappNumber: input.whatsappNumber,
        customerEmail: input.customerEmail,

        ...(branchUpdate ?? {}),

        deliveryDate: input.deliveryDate,
        deliveryTime: input.deliveryTime,
        deliveryAddress: input.deliveryAddress,
        deliveryMapLink: input.deliveryMapLink,

        cakeMessage: input.cakeMessage,
        notes: input.notes,

        paymentMethod: input.paymentMethod,
        ...(input.totalAmount !== undefined
          ? { totalAmount: input.totalAmount }
          : {}),
        ...(input.advanceAmount !== undefined
          ? { advanceAmount: input.advanceAmount }
          : {}),
        balanceAmount: derivedBalance,
        paymentStatus: derivedPaymentStatus,

        ...(input.orderStatus ? { orderStatus: input.orderStatus } : {}),
      },
    });

    // ----- Items: replace wholesale when supplied -----
    if (input.items !== undefined) {
      await tx.orderItem.deleteMany({ where: { orderId: existing.id } });
      if (input.items.length > 0) {
        await tx.orderItem.createMany({
          data: input.items.map((it) => {
            const totalPrice = Number(
              (it.quantity * it.unitPrice).toFixed(2),
            );
            return {
              orderId: existing.id,
              itemName: it.itemName,
              quantity: it.quantity,
              unitPrice: it.unitPrice,
              totalPrice,
              sizeLabel: it.sizeLabel,
              customSize: it.customSize,
              notes: it.notes,
              isCustom: true,
            };
          }),
        });
      }
    }

    // ----- Audit log row when money changed -----
    if (moneyChanged) {
      await tx.orderAmountChange.create({
        data: {
          orderId: existing.id,
          changedById: actor.id,
          prevTotal,
          prevAdvance,
          prevBalance,
          newTotal,
          newAdvance,
          newBalance: derivedBalance,
          delta: Number(((newTotal ?? 0) - prevTotal).toFixed(2)),
          reason: input.reason ?? null,
        },
      });
    }

    // ----- Status history row when status changed -----
    if (input.orderStatus && input.orderStatus !== existing.orderStatus) {
      await tx.orderStatusHistory.create({
        data: {
          orderId: existing.id,
          oldStatus: existing.orderStatus,
          newStatus: input.orderStatus,
          changedById: actor.id,
          note: input.reason ?? null,
        },
      });
    }

    return tx.order.findUnique({
      where: { id: existing.id },
      include: {
        customer: true,
        branch: { include: { parent: true } },
        createdBy: { select: { id: true, name: true, role: true } },
        assignedChef: { select: { id: true, name: true, role: true } },
        items: { orderBy: { createdAt: "asc" } },
        statusHistory: {
          orderBy: { createdAt: "desc" },
          include: { changedBy: { select: { name: true } } },
        },
        amountChanges: {
          orderBy: { createdAt: "desc" },
          include: { changedBy: { select: { name: true } } },
        },
      },
    });
  });
}
