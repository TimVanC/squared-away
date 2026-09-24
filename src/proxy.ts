import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth-edge";

// Optimistic auth check: redirects logged-out visitors to /login and logged-in
// visitors away from /login. Real authorization happens in every route via requireUserId.
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const uid = token ? await verifySessionToken(token) : null;

  if (pathname.startsWith("/login")) {
    if (uid) return NextResponse.redirect(new URL("/", req.url));
    return NextResponse.next();
  }
  if (!uid) {
    const url = new URL("/login", req.url);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Everything except API routes, Next internals, and static assets.
  matcher: ["/((?!api|_next|sw\\.js|manifest\\.webmanifest|icons|favicon\\.ico|.*\\.(?:svg|png|ico|txt)).*)"],
};
