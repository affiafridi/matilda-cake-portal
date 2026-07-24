import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getIntegrations } from "@/lib/integrations";
import { requireRole } from "@/lib/auth/server";
import { jsonOk, jsonError, handleApiError } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_STAGES  = ["CLICKED", "FLOW_STARTED", "ORDER_CREATED", "PAID", "ABANDONED"];
const VALID_STATUSES = ["NEW", "CONTACTED", "CONVERTED", "LOST"];

export async function POST(req: NextRequest) {
  try {
    const { inbox_webhook_secret } = await getIntegrations();
    const secret = req.headers.get("x-inbox-secret");
    if (!secret || secret !== inbox_webhook_secret) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { waId, customerName, phone, orderDetails, source, stage, productName, productPrice } = body as {
      waId?:         string;
      customerName?: string;
      phone?:        string;
      orderDetails?: string;
      source?:       string;
      stage?:        string;
      productName?:  string;
      productPrice?: string;
    };

    if (!waId) return jsonError("waId is required", 400);

    const cleanWaId  = waId.replace(/^\+/, "");
    const leadStage  = (stage && VALID_STAGES.includes(stage)) ? stage : "CLICKED";

    // Upsert: find the most recent in-progress lead for this waId and update it,
    // or create a new one. Exclude PAID/ABANDONED so returning customers get a fresh lead.
    const existing = await prisma.whatsappLead.findFirst({
      where: { waId: cleanWaId, stage: { notIn: ["PAID", "ABANDONED"] } },
      orderBy: { createdAt: "desc" },
    });

    let lead;
    if (existing) {
      lead = await prisma.whatsappLead.update({
        where: { id: existing.id },
        data: {
          stage:        leadStage,
          ...(customerName !== undefined && { customerName }),
          ...(phone          && { phone: phone.replace(/^\+/, "") }),
          ...(orderDetails   && { orderDetails }),
          // Always overwrite product fields so a new click with a different product replaces the old one
          productName:  productName ?? existing.productName,
          productPrice: productPrice ?? existing.productPrice,
          updatedAt:    new Date(),
        },
      });
    } else {
      lead = await prisma.whatsappLead.create({
        data: {
          id:           crypto.randomUUID(),
          waId:         cleanWaId,
          customerName: customerName || cleanWaId,
          phone:        (phone || cleanWaId).replace(/^\+/, ""),
          orderDetails: orderDetails || "",
          source:       source || "whatsapp",
          stage:        leadStage,
          status:       "NEW",
          productName:  productName || null,
          productPrice: productPrice || null,
        },
      });
    }

    return jsonOk({ id: lead.id });
  } catch (err) {
    return handleApiError(err);
  }
}

const ALLOWED_ROLES = ["SUPER_ADMIN", "ADMIN", "AGENT"] as const;

export async function GET(req: NextRequest) {
  try {
    await requireRole(ALLOWED_ROLES);
    const { searchParams } = req.nextUrl;
    const page   = Math.max(1, Number(searchParams.get("page")  ?? 1));
    const limit  = Math.min(50, Number(searchParams.get("limit") ?? 20));
    const status = searchParams.get("status") ?? undefined;
    const stage  = searchParams.get("stage")  ?? undefined;

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (stage)  where.stage  = stage;

    const [leads, total, funnelRaw, paidByCustomer] = await Promise.all([
      prisma.whatsappLead.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip:    (page - 1) * limit,
        take:    limit,
      }),
      prisma.whatsappLead.count({ where }),
      // Always count all stages regardless of active filter
      prisma.whatsappLead.groupBy({ by: ["stage"], _count: { id: true } }),
      // Count PAID leads per customer (= orders placed)
      prisma.whatsappLead.groupBy({ by: ["waId"], where: { stage: "PAID" }, _count: { id: true } }),
    ]);

    const funnelCounts = Object.fromEntries(
      VALID_STAGES.map((s) => [s, funnelRaw.find((r) => r.stage === s)?._count.id ?? 0])
    );

    const orderCounts = Object.fromEntries(
      paidByCustomer.map((r) => [r.waId, r._count.id])
    );

    return jsonOk({ leads, total, page, limit, funnelCounts, orderCounts });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireRole(ALLOWED_ROLES);
    const body = await req.json() as { id: string; status?: string; stage?: string };
    const { id, status, stage } = body;

    if (!id) return jsonError("id is required", 400);
    if (status && !VALID_STATUSES.includes(status)) return jsonError("Invalid status", 400);
    if (stage  && !VALID_STAGES.includes(stage))    return jsonError("Invalid stage",  400);
    if (!status && !stage) return jsonError("status or stage is required", 400);

    await prisma.whatsappLead.update({
      where: { id },
      data: {
        ...(status && { status }),
        ...(stage  && { stage }),
        updatedAt: new Date(),
      },
    });
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
