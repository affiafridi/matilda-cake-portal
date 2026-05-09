import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, ROLE_GROUPS } from "@/lib/auth/server";
import { canEditUser } from "@/lib/auth/role-policy";
import {
  hashPassword,
  validatePasswordStrength,
} from "@/lib/auth/passwords";
import { handleApiError, jsonError, jsonOk } from "@/lib/api/http";

export const runtime = "nodejs";

const schema = z.object({
  password: z.string().min(1),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireRole(ROLE_GROUPS.ADMINS);
    const { id } = await context.params;

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return jsonError("User not found.", 404);
    if (!canEditUser(actor, target)) {
      return jsonError(
        "You are not allowed to reset this user's password.",
        403,
      );
    }

    const body = await req.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) return jsonError("Invalid request", 400);

    const pwd = validatePasswordStrength(parsed.data.password);
    if (!pwd.ok) return jsonError(pwd.reason, 400);

    await prisma.user.update({
      where: { id },
      data: { passwordHash: await hashPassword(parsed.data.password) },
    });

    // Force re-login on the next request — kill all sessions for the user.
    await prisma.session.deleteMany({ where: { userId: id } });

    return jsonOk({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
