import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonOk, jsonError, handleApiError } from "@/lib/api/http";
import { getIntegrations } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/bot/context
 * Bot calls this after processing each step to update the conversation's bot context.
 * Authenticated with x-inbox-secret header.
 *
 * Body: {
 *   waId: string,
 *   flowId?: number,
 *   flowName?: string,
 *   stepKey?: string,
 *   variables?: Record<string, string>,  // captured vars so far
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const { inbox_webhook_secret } = await getIntegrations();
    const secret = req.headers.get("x-inbox-secret");
    if (!secret || secret !== inbox_webhook_secret) return jsonError("Unauthorized", 401);

    const body = await req.json() as {
      waId: string;
      flowId?: number;
      flowName?: string;
      stepKey?: string;
      variables?: Record<string, unknown>;
    };

    const { waId, flowId, flowName, stepKey, variables } = body;
    if (!waId) return jsonError("waId is required", 400);

    await prisma.conversation.updateMany({
      where: { waId },
      data: {
        ...(flowId    !== undefined && { currentBotFlowId:   flowId }),
        ...(flowName  !== undefined && { currentBotFlowName: flowName }),
        ...(stepKey   !== undefined && { currentBotStepKey:  stepKey }),
        ...(variables !== undefined && { botContextVariables: JSON.stringify(variables) }),
        lastBotActivityAt: new Date(),
      },
    });

    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
