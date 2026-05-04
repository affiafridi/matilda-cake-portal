import { z } from "zod";

// =====================================================
// Enum mirrors — kept in sync with prisma/schema.prisma
// =====================================================

export const cakeFlavorSchema = z.enum(["VANILLA", "CHOCOLATE", "RED_VELVET"]);
export const cakeSizeSchema = z.enum(["SIZE_750G", "SIZE_1_2KG", "CUSTOM"]);
export const paymentMethodSchema = z.enum(["CASH", "ONLINE"]);
export const paymentStatusSchema = z.enum([
  "UNPAID",
  "PARTIAL",
  "PAID",
  "REFUNDED",
]);
export const orderStatusSchema = z.enum([
  "RECEIVED",
  "CONFIRMED",
  "PREPARING",
  "READY",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
]);
export const orderSourceSchema = z.enum([
  "WHATSAPP",
  "WEBSITE",
  "WALK_IN",
  "PHONE",
]);

// =====================================================
// POST /api/orders body
// =====================================================

const optionalString = z
  .string()
  .trim()
  .min(1)
  .nullish()
  .transform((v) => v ?? null);

const optionalEmail = z
  .string()
  .trim()
  .email()
  .nullish()
  .transform((v) => v ?? null);

const optionalUrl = z
  .string()
  .trim()
  .url()
  .nullish()
  .transform((v) => v ?? null);

const optionalDecimal = z.coerce
  .number()
  .nonnegative()
  .nullish()
  .transform((v) => (v === undefined ? null : v));

export const createOrderSchema = z
  .object({
    // Optional Customer linkage
    customerId: z.string().cuid().nullish().transform((v) => v ?? null),

    // Snapshot fields (always required, even when customerId is present)
    customerName: z.string().trim().min(1).max(200),
    customerPhone: z.string().trim().min(3).max(50),
    whatsappNumber: optionalString,
    customerEmail: optionalEmail,

    // Delivery
    deliveryDate: z.coerce.date(),
    deliveryTime: z.string().trim().min(1),
    deliveryAddress: z.string().trim().min(1),
    deliveryMapLink: optionalUrl,

    // Items & cake spec
    orderItems: z.string().trim().min(1),
    cakeFlavor: cakeFlavorSchema,
    cakeMessage: optionalString,
    cakeSponge: optionalString,
    cakeSize: cakeSizeSchema,
    customCakeSize: optionalString,

    // Payment
    paymentMethod: paymentMethodSchema,
    paymentStatus: paymentStatusSchema.optional(), // Prisma default: UNPAID
    totalAmount: optionalDecimal,
    advanceAmount: optionalDecimal,
    balanceAmount: optionalDecimal,

    // Workflow
    source: orderSourceSchema,
    notes: optionalString,
    createdById: z.string().cuid().nullish().transform((v) => v ?? null),
    assignedChefId: z.string().cuid().nullish().transform((v) => v ?? null),
  })
  .refine(
    (d) =>
      d.cakeSize !== "CUSTOM" ||
      (typeof d.customCakeSize === "string" && d.customCakeSize.length > 0),
    {
      message: "customCakeSize is required when cakeSize is CUSTOM",
      path: ["customCakeSize"],
    },
  );

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

// =====================================================
// GET /api/orders query
// =====================================================

export const listOrdersQuerySchema = z.object({
  orderStatus: orderStatusSchema.optional(),
  deliveryDate: z.coerce.date().optional(),
  take: z.coerce.number().int().min(1).max(100).default(50),
  skip: z.coerce.number().int().min(0).default(0),
});

export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;
