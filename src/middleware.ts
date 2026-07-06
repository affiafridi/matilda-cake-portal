import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "mc_session";

/**
 * Edge-runtime gate: redirects unauthenticated requests away from
 * protected pages. Doesn't validate the session token (no Prisma at the
 * edge) — just checks cookie presence as a fast-fail. Per-route layouts
 * do the real role check using Prisma in Node runtime.
 *
 * APIs are NOT routed through here — they call requireRole() themselves.
 */
export function middleware(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/new-order/:path*",
    "/operator/:path*",
    "/dashboard/:path*",
    "/orders/:path*",
  ],
};
