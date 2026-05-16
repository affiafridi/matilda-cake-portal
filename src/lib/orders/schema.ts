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
// Helpers
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

const optionalTrimmedNull = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v && v.length > 0 ? v : null))
    .optional();

// =====================================================
// Order item
// =====================================================

export const orderItemSchema = z
  .object({
    itemName: z.string().trim().min(1, "Item name is required").max(200),
    quantity: z.coerce.number().int().min(1, "Quantity must be at least 1"),
    unitPrice: z.coerce.number().nonnegative(),
    totalPrice: z.coerce.number().nonnegative(),

    sizeLabel: z
      .string()
      .trim()
      .max(50)
      .nullish()
      .transform((v) => (v && v.length > 0 ? v : null)),

    notes: z
      .string()
      .trim()
      .max(500)
      .nullish()
      .transform((v) => (v && v.length > 0 ? v : null)),

    woocommerceProductId: z
      .string()
      .nullish()
      .transform((v) => v ?? null),

    woocommerceVariationId: z
      .string()
      .nullish()
      .transform((v) => v ?? null),

    variationName: z
      .string()
      .nullish()
      .transform((v) => v ?? null),

    isCustom: z.boolean().optional().default(false),

    customSize: z
      .string()
      .trim()
      .max(200)
      .nullish()
      .transform((v) => (v && v.length > 0 ? v : null)),

    referenceImageUrl: z
      .string()
      .max(2000)
      .nullish()
      .transform((v) => v ?? null),

    referenceImageName: z
      .string()
      .max(255)
      .nullish()
      .transform((v) => v ?? null),

    referenceImageType: z
      .string()
      .max(100)
      .nullish()
      .transform((v) => v ?? null),
  })
  .refine(
    (item) =>
      item.sizeLabel !== "Custom" ||
      (typeof item.customSize === "string" && item.customSize.length > 0),
    {
      message: "customSize is required when sizeLabel is Custom",
      path: ["customSize"],
    },
  );

export type OrderItemInput = z.infer<typeof orderItemSchema>;

// =====================================================
// POST /api/orders body
// =====================================================

export const createOrderSchema = z
  .object({
    customerId: z.string().cuid().nullish().transform((v) => v ?? null),

    customerName: z.string().trim().min(1).max(200),
    customerPhone: z.string().trim().min(3).max(50),
    whatsappNumber: optionalString,
    customerEmail: optionalEmail,

    deliveryDate: z.coerce.date(),
    deliveryTime: z.string().trim().min(1),
    deliveryAddress: z.string().trim().min(1),
    deliveryMapLink: optionalUrl,

    orderItems: z.string().trim().min(1),
    cakeFlavor: cakeFlavorSchema,
    cakeMessage: optionalString,
    cakeSponge: optionalString,
    cakeSize: cakeSizeSchema,
    customCakeSize: optionalString,

    paymentMethod: paymentMethodSchema,
    paymentStatus: paymentStatusSchema.optional(),
    totalAmount: optionalDecimal,
    advanceAmount: optionalDecimal,
    balanceAmount: optionalDecimal,

    source: orderSourceSchema,
    notes: optionalString,
    createdById: z.string().cuid().nullish().transform((v) => v ?? null),
    assignedChefId: z.string().cuid().nullish().transform((v) => v ?? null),

    branchId: z.string().min(1, "Branch is required").max(100),

    items: z.array(orderItemSchema).optional().default([]),
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
  createdById: z.string().cuid().optional(),
  take: z.coerce.number().int().min(1).max(100).default(50),
  skip: z.coerce.number().int().min(0).default(0),
});

export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;

// =====================================================
// PATCH /api/orders/[trackingCode] body
// =====================================================

export const updateOrderSchema = z.object({
  customerName: z.string().trim().min(1).max(200).optional(),
  customerPhone: z.string().trim().min(3).max(50).optional(),
  whatsappNumber: optionalTrimmedNull(50),

  customerEmail: z
    .string()
    .trim()
    .email()
    .max(200)
    .nullish()
    .transform((v) => (v && v.length > 0 ? v : null))
    .optional(),

  branchId: z.string().min(1).max(100).optional(),

  deliveryDate: z.coerce.date().optional(),
  deliveryTime: z.string().trim().min(1).optional(),
  deliveryAddress: z.string().trim().min(1).optional(),

  deliveryMapLink: z
    .string()
    .trim()
    .url()
    .nullish()
    .transform((v) => (v && v.length > 0 ? v : null))
    .optional(),

  cakeMessage: optionalTrimmedNull(200),
  notes: optionalTrimmedNull(2000),

  paymentMethod: paymentMethodSchema.optional(),
  totalAmount: z.coerce.number().nonnegative().nullish().optional(),
  advanceAmount: z.coerce.number().nonnegative().nullish().optional(),

  orderStatus: orderStatusSchema.optional(),

  items: z.array(orderItemSchema).optional(),

  reason: z.string().trim().max(500).optional(),
});

export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;