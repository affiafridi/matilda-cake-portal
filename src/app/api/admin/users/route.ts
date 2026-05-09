import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, ROLE_GROUPS } from "@/lib/auth/server";
import {
  hashPassword,
  validatePasswordStrength,
} from "@/lib/auth/passwords";
import {
  assignableRoles,
  listFilterRoles,
} from "@/lib/auth/role-policy";
import { handleApiError, jsonError, jsonOk } from "@/lib/api/http";

export const runtime = "nodejs";

const userPublicSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** GET /api/admin/users — list users visible to the actor. */
export async function GET() {
  try {
    const actor = await requireRole(ROLE_GROUPS.ADMINS);
    const filterRoles = listFilterRoles(actor);
    const users = await prisma.user.findMany({
      where: filterRoles ? { role: { in: filterRoles } } : undefined,
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
      select: userPublicSelect,
    });
    return jsonOk(users);
  } catch (error) {
    return handleApiError(error);
  }
}

const createUserSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().toLowerCase().email().max(200),
  phone: z
    .string()
    .trim()
    .max(50)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  role: z.enum(["SUPER_ADMIN", "ADMIN", "CHEF", "COORDINATOR"]),
  password: z.string().min(1),
  isActive: z.boolean().optional().default(true),
});

/** POST /api/admin/users — create a new user. */
export async function POST(req: NextRequest) {
  try {
    const actor = await requireRole(ROLE_GROUPS.ADMINS);
    const body = await req.json().catch(() => ({}));
    const parsed = createUserSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("Invalid request", 400, parsed.error.flatten());
    }
    const input = parsed.data;

    if (!assignableRoles(actor).includes(input.role)) {
      return jsonError("You are not allowed to assign that role.", 403);
    }

    const pwd = validatePasswordStrength(input.password);
    if (!pwd.ok) return jsonError(pwd.reason, 400);

    const existing = await prisma.user.findUnique({
      where: { email: input.email },
    });
    if (existing) {
      return jsonError("A user with that email already exists.", 409);
    }

    const created = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        phone: input.phone,
        role: input.role,
        isActive: input.isActive ?? true,
        passwordHash: await hashPassword(input.password),
      },
      select: userPublicSelect,
    });

    return jsonOk(created, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
