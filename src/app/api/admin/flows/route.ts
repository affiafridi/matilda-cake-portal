import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonOk, jsonError, handleApiError } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user || !["SUPER_ADMIN", "ADMIN"].includes(user.role)) return jsonError("Forbidden", 403);

    const flows = await prisma.botFlow.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: {
        steps: {
          orderBy: { sortOrder: "asc" },
          include: { options: { orderBy: { sortOrder: "asc" } } },
        },
      },
    });

    return jsonOk(flows);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "SUPER_ADMIN") return jsonError("Forbidden", 403);

    const body = await req.json() as { name: string; description?: string; triggerKeywords?: string };
    if (!body.name?.trim()) return jsonError("name required", 400);

    const flow = await prisma.botFlow.create({
      data: {
        name:            body.name.trim(),
        description:     body.description?.trim() ?? null,
        triggerKeywords: body.triggerKeywords?.trim() ?? "",
      },
      include: { steps: { include: { options: true } } },
    });

    return jsonOk(flow);
  } catch (err) {
    return handleApiError(err);
  }
}
