import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError, jsonOk } from "@/lib/api/http";

/**
 * GET /api/branches
 *
 * Returns active parent branches with their active children, both sorted
 * by `sortOrder`. Parents with no active children are filtered out so the
 * UI never shows an empty optgroup.
 *
 * Shape:
 *   [{ id, name, children: [{ id, name }] }]
 */
export async function GET(_req: NextRequest) {
  try {
    const parents = await prisma.branch.findMany({
      where: { parentId: null, isActive: true },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        children: {
          where: { isActive: true },
          orderBy: { sortOrder: "asc" },
          select: { id: true, name: true },
        },
      },
    });

    const visible = parents.filter((p) => p.children.length > 0);
    return jsonOk(visible);
  } catch (error) {
    return handleApiError(error);
  }
}
