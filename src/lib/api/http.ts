import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";

/** Successful response envelope. */
export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, data }, { status });
}

/** Error response envelope. */
export function jsonError(
  error: string,
  status = 400,
  details?: unknown,
) {
  return NextResponse.json({ ok: false, error, details }, { status });
}

/**
 * Centralised error mapper for route handlers. Maps known error types
 * (Zod validation, Prisma known errors) to appropriate HTTP responses.
 * Everything else is logged server-side and returned as a generic 500
 * so we never leak internal detail to clients.
 */
export function handleApiError(error: unknown) {
  if (error instanceof ZodError) {
    return jsonError("Invalid request", 400, error.flatten());
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case "P2002":
        return jsonError("Duplicate value", 409, { target: error.meta?.target });
      case "P2003":
        return jsonError("Related record not found", 400, { meta: error.meta });
      case "P2025":
        return jsonError("Not found", 404);
    }
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return jsonError("Invalid database payload", 400);
  }

  console.error("[api] unhandled error:", error);
  return jsonError("Internal server error", 500);
}
