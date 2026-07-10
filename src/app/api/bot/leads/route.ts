import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getIntegrations } from "@/lib/integrations";
import { jsonOk, jsonError, handleApiError } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { inbox_webhook_secret } = await getIntegrations();
    const secret = req.headers.get("x-inbox-secret");
    if (!secret || secret !== inbox_webhook_secret) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { waId, customerName, phone, orderDetails, source } = body as {
      waId?:         string;
      customerName?: string;
      phone?:        string;
      orderDetails?: string;
      source?:       string;
    };

    if (!waId || !orderDetails) {
      return jsonError("waId and orderDetails are required", 400);
    }

    const lead = await prisma.whatsappLead.create({
      data: {
        id:           crypto.randomUUID(),
        waId:         waId.replace(/^\+/, ""),
        customerName: customerName || waId,
        phone:        (phone || waId).replace(/^\+/, ""),
        orderDetails,
        source:       source || "whatsapp",
        status:       "NEW",
      },
    });

    return jsonOk({ id: lead.id });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const page   = Math.max(1, Number(searchParams.get("page")  ?? 1));
    const limit  = Math.min(50, Number(searchParams.get("limit") ?? 20));
    const status = searchParams.get("status") ?? undefined;

    const where = status ? { status } : {};

    const [leads, total] = await Promise.all([
      prisma.whatsappLead.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip:    (page - 1) * limit,
        take:    limit,
      }),
      prisma.whatsappLead.count({ where }),
    ]);

    return jsonOk({ leads, total, page, limit });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, status } = await req.json() as { id: string; status: string };
    const VALID = ["NEW", "CONTACTED", "CONVERTED", "LOST"];
    if (!id || !VALID.includes(status)) return jsonError("Invalid request", 400);

    await prisma.whatsappLead.update({ where: { id }, data: { status, updatedAt: new Date() } });
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
