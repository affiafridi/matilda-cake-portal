import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, validatePasswordStrength } from "@/lib/auth/passwords";
import { jsonOk, jsonError, handleApiError } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/setup — check if setup is needed
export async function GET() {
  try {
    const count = await prisma.user.count();
    return jsonOk({ needed: count === 0 });
  } catch {
    return jsonOk({ needed: true });
  }
}

// POST /api/setup — complete first-run setup
export async function POST(req: NextRequest) {
  try {
    // Block if users already exist
    const count = await prisma.user.count();
    if (count > 0) return jsonError("Setup already completed", 403);

    const body = await req.json() as {
      name: string;
      email: string;
      password: string;
      app_name?: string;
      primary_color?: string;
    };

    if (!body.name?.trim())  return jsonError("Name is required", 400);
    if (!body.email?.trim()) return jsonError("Email is required", 400);

    const strength = validatePasswordStrength(body.password ?? "");
    if (!strength.ok) return jsonError(strength.reason, 400);

    const passwordHash = await hashPassword(body.password);

    // Create super admin
    await prisma.user.create({
      data: {
        name:         body.name.trim(),
        email:        body.email.trim().toLowerCase(),
        role:         "SUPER_ADMIN",
        passwordHash,
        isActive:     true,
      },
    });

    // Save brand settings
    const settings = [
      ["app_name",      body.app_name?.trim()     || body.name.trim() + " Portal"],
      ["primary_color", body.primary_color?.trim() || "#2563eb"],
      ["sidebar_color", "#ffffff"],
      ["logo_url",      "/uploads/logo.png"],
      ["woo_visible_to_admin", "false"],
      ["ai_visible_to_admin",  "false"],
    ];

    for (const [key, value] of settings) {
      await prisma.$executeRaw`
        INSERT INTO portal_settings (key, value) VALUES (${key}, ${value})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
      `;
    }

    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
