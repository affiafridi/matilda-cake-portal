import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonOk, jsonError, handleApiError } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

type OptionInput = {
  id?: number; label: string; value: string;
  description?: string; nextStepKey?: string;
  dataSource?: string; sortOrder?: number;
  customApiUrl?: string | null; customApiPath?: string | null;
  customApiLabel?: string | null; customApiValue?: string | null;
};

type StepInput = {
  id?: number; stepKey: string; message: string;
  inputType?: string; isEntry?: boolean; isFallback?: boolean; showProductCard?: boolean;
  imageUrl?: string | null; sortOrder?: number; options?: OptionInput[];
  positionX?: number; positionY?: number;
};

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentUser();
    if (!user || !["SUPER_ADMIN", "ADMIN"].includes(user.role)) return jsonError("Forbidden", 403);

    const { id } = await params;
    const flow = await prisma.botFlow.findUnique({
      where: { id: parseInt(id) },
      include: {
        steps: {
          orderBy: { sortOrder: "asc" },
          include: { options: { orderBy: { sortOrder: "asc" } } },
        },
      },
    });

    if (!flow) return jsonError("Not found", 404);
    return jsonOk(flow);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "SUPER_ADMIN") return jsonError("Forbidden", 403);

    const { id } = await params;
    const flowId = parseInt(id);
    const body = await req.json() as {
      name?: string; description?: string;
      triggerKeywords?: string; isActive?: boolean;
      sortOrder?: number; steps?: StepInput[];
    };

    // Update flow meta
    await prisma.botFlow.update({
      where: { id: flowId },
      data: {
        name:            body.name?.trim(),
        description:     body.description?.trim() ?? null,
        triggerKeywords: body.triggerKeywords?.trim() ?? "",
        isActive:        body.isActive,
        sortOrder:       body.sortOrder,
      },
    });

    // Replace steps if provided
    if (body.steps !== undefined) {
      // Delete removed steps
      const incomingStepIds = (body.steps ?? []).filter((s) => s.id).map((s) => s.id as number);
      await prisma.botFlowStep.deleteMany({
        where: { flowId, id: { notIn: incomingStepIds } },
      });

      for (const [si, step] of (body.steps ?? []).entries()) {
        let dbStep;
        if (step.id) {
          dbStep = await prisma.botFlowStep.update({
            where: { id: step.id },
            data: {
              stepKey:         step.stepKey,
              message:         step.message,
              inputType:       step.inputType ?? "button",
              isEntry:         step.isEntry ?? false,
              isFallback:      step.isFallback ?? false,
              showProductCard: step.showProductCard ?? false,
              imageUrl:        step.imageUrl || null,
              sortOrder:       step.sortOrder ?? si,
              positionX:       step.positionX ?? 80,
              positionY:       step.positionY ?? 120,
            },
          });
        } else {
          dbStep = await prisma.botFlowStep.create({
            data: {
              flowId,
              stepKey:         step.stepKey,
              message:         step.message,
              inputType:       step.inputType ?? "button",
              isEntry:         step.isEntry ?? false,
              isFallback:      step.isFallback ?? false,
              showProductCard: step.showProductCard ?? false,
              imageUrl:        step.imageUrl || null,
              sortOrder:       step.sortOrder ?? si,
              positionX:       step.positionX ?? 80,
              positionY:       step.positionY ?? 120,
            },
          });
        }

        // Replace options for this step
        const incomingOptIds = (step.options ?? []).filter((o) => o.id).map((o) => o.id as number);
        await prisma.botFlowOption.deleteMany({
          where: { stepId: dbStep.id, id: { notIn: incomingOptIds } },
        });

        for (const [oi, opt] of (step.options ?? []).entries()) {
          if (opt.id) {
            await prisma.botFlowOption.update({
              where: { id: opt.id },
              data: {
                label:          opt.label,
                value:          opt.value,
                description:    opt.description ?? null,
                nextStepKey:    opt.nextStepKey ?? null,
                dataSource:     opt.dataSource ?? "static",
                customApiUrl:   opt.customApiUrl ?? null,
                customApiPath:  opt.customApiPath ?? null,
                customApiLabel: opt.customApiLabel ?? null,
                customApiValue: opt.customApiValue ?? null,
                sortOrder:      opt.sortOrder ?? oi,
              },
            });
          } else {
            await prisma.botFlowOption.create({
              data: {
                stepId:         dbStep.id,
                label:          opt.label,
                value:          opt.value,
                description:    opt.description ?? null,
                nextStepKey:    opt.nextStepKey ?? null,
                dataSource:     opt.dataSource ?? "static",
                customApiUrl:   opt.customApiUrl ?? null,
                customApiPath:  opt.customApiPath ?? null,
                customApiLabel: opt.customApiLabel ?? null,
                customApiValue: opt.customApiValue ?? null,
                sortOrder:      opt.sortOrder ?? oi,
              },
            });
          }
        }
      }
    }

    const updated = await prisma.botFlow.findUnique({
      where: { id: flowId },
      include: { steps: { orderBy: { sortOrder: "asc" }, include: { options: { orderBy: { sortOrder: "asc" } } } } },
    });

    return jsonOk(updated);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "SUPER_ADMIN") return jsonError("Forbidden", 403);

    const { id } = await params;
    await prisma.botFlow.delete({ where: { id: parseInt(id) } });
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
