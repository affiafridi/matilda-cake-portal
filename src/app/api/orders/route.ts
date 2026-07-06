import type { NextRequest } from "next/server";
import {
  createOrderSchema,
  listOrdersQuerySchema,
} from "@/lib/orders/schema";
import { createOrder, listOrders } from "@/lib/orders/service";
import { handleApiError, jsonError, jsonOk } from "@/lib/api/http";
import { requireRole, requireUser } from "@/lib/auth/server";

export const runtime = "nodejs";

/** POST /api/orders — create a new order. */
export async function POST(req: NextRequest) {
  try {
    const actor = await requireRole([
      "SUPER_ADMIN",
      "ADMIN",
      "AGENT",
    ]);
    const body = await req.json();
    const input = createOrderSchema.parse(body);
    // Always tag the order with the authenticated user. Whatever the client
    // sent for `createdById` is ignored — no spoofing.
    const order = await createOrder({ ...input, createdById: actor.id });
    return jsonOk(order, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

/** GET /api/orders — list orders with optional filtering. */
export async function GET(req: NextRequest) {
  try {
    const actor = await requireUser();
    const params = Object.fromEntries(req.nextUrl.searchParams.entries());
    const filters = listOrdersQuerySchema.parse(params);

    // Agents only see orders they personally created.
    const scopedFilters =
      actor.role === "AGENT"
        ? { ...filters, createdById: actor.id }
        : filters;

    const result = await listOrders(scopedFilters);
    return jsonOk(result);
  } catch (error) {
    return handleApiError(error);
  }
}
