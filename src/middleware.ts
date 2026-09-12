import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { LOGIN_PATH, SESSION_COOKIE, verifySession } from "@/backend/services/auth";

/**
 * Gates the admin console.
 *
 * The check lives in middleware rather than in each page because it has to cover
 * the server actions too - status changes POST back to these same routes, and a
 * page-level check would leave them reachable.
 *
 * Public surfaces (the resident form at / and the confirmation page) are outside
 * the matcher and stay open, which is the point: reporting a hazard must never
 * require an account.
 */
export const config = {
  matcher: ["/admin", "/admin/:path*"],
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === LOGIN_PATH) return NextResponse.next();

  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  if (session) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = LOGIN_PATH;
  url.search = "";
  // Send the operator back to the page they actually asked for.
  if (pathname !== "/admin") url.searchParams.set("next", pathname);

  return NextResponse.redirect(url);
}
