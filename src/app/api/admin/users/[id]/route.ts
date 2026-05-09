import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, ROLE_GROUPS } from "@/lib/auth/server";
import {
  assignableRoles,
  canEditUser,
  canToggleActive,
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

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    phone: z
      .string()
      .trim()
      .max(50)
      .nullish()
      .transform((v) => (v && v.length > 0 ? v : null)),
    role: z
      .enum(["SUPER_ADMIN", "ADMIN", "CHEF", "COORDINATOR"])
      .optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (d) =>
      d.name !== undefined ||
      d.phone !== undefined ||
      d.role !== undefined ||
      d.isActive !== undefined,
    { message: "Nothing to update." },
  );

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireRole(ROLE_GROUPS.ADMINS);
    const { id } = await context.params;

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return jsonError("User not found.", 404);
    if (!canEditUser(actor, target)) {
      return jsonError("You are not allowed to edit this user.", 403);
    }

    const body = await req.json().catch(() => ({}));
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("Invalid request", 400, parsed.error.flatten());
    }
    const input = parsed.data;

    if (input.role !== undefined) {
      if (!assignableRoles(actor).includes(input.role)) {
        return jsonError("You are not allowed to assign that role.", 403);
      }
    }

    if (input.isActive !== undefined && input.isActive === false) {
      if (!canToggleActive(actor, target)) {
        return jsonError(
          "You can't deactivate this user.",
          403,
        );
      }
      // Protect the last SUPER_ADMIN.
      if (target.role === "SUPER_ADMIN") {
        const activeSupers = await prisma.user.count({
          where: { role: "SUPER_ADMIN", isActive: true },
        });
        if (activeSupers <= 1) {
          return jsonError(
            "Cannot deactivate the last active SUPER_ADMIN.",
            400,
          );
        }
      }
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        name: input.name,
        phone: input.phone,
        role: input.role,
        isActive: input.isActive,
      },
      select: userPublicSelect,
    });

    // If a user was deactivated, kill their sessions immediately.
    if (input.isActive === false) {
      await prisma.session.deleteMany({ where: { userId: id } });
    }

    return jsonOk(updated);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/admin/users/[id]
 *
 * Hard-deletes a user. SUPER_ADMIN only. Sessions cascade automatically;
 * Order/OrderStatusHistory FK columns referring to the user are nulled
 * inside a transaction so the snapshot fields (customerName, etc.) and
 * historic rows are preserved.
 */
export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireRole(["SUPER_ADMIN"]);
    const { id } = await context.params;

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return jsonError("User not found.", 404);

    if (target.id === actor.id) {
      return jsonError("You can't delete your own account.", 400);
    }

    if (target.role === "SUPER_ADMIN") {
      const supers = await prisma.user.count({
        where: { role: "SUPER_ADMIN" },
      });
      if (supers <= 1) {
        return jsonError("Cannot delete the last SUPER_ADMIN.", 400);
      }
    }

    await prisma.$transaction([
      prisma.order.updateMany({
        where: { createdById: id },
        data: { createdById: null },
      }),
      prisma.order.updateMany({
        where: { assignedChefId: id },
        data: { assignedChefId: null },
      }),
      prisma.orderStatusHistory.updateMany({
        where: { changedById: id },
        data: { changedById: null },
      }),
      prisma.user.delete({ where: { id } }),
    ]);

    return jsonOk({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
