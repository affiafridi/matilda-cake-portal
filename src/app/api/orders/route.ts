import type { NextRequest } from "next/server";
import {
  createOrderSchema,
  listOrdersQuerySchema,
} from "@/lib/orders/schema";
import { createOrder, listOrders } from "@/lib/orders/service";
import { handleApiError, jsonOk } from "@/lib/api/http";

/** POST /api/orders — create a new order. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = createOrderSchema.parse(body);
    const order = await createOrder(input);
    return jsonOk(order, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

/** GET /api/orders — list orders with optional filtering. */
export async function GET(req: NextRequest) {
  try {
    const params = Object.fromEntries(req.nextUrl.searchParams.entries());
    const filters = listOrdersQuerySchema.parse(params);
    const result = await listOrders(filters);
    return jsonOk(result);
  } catch (error) {
    return handleApiError(error);
  }
}
