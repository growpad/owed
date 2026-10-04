// Default deny: every route needs a session once APP_PASSWORD is set (unset: open, for local dev),
// except the public landing page, sign-in, and the assets listed in the matcher below.
// The API can send email from Owed's inbox, so a public deploy must never be open.
import { NextResponse, type NextRequest } from "next/server";
import { APP_HOME, SESSION_COOKIE, verifySession } from "@/lib/session";

export async function middleware(req: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password || req.nextUrl.pathname === "/") return NextResponse.next(); // "/" is the public landing page
  if (await verifySession(password, req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();

  const { pathname, search } = req.nextUrl;
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "sign in first" }, { status: 401 });
  const login = new URL("/login", req.url);
  if (pathname !== APP_HOME) login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

// Public: the sign-in page and its endpoint, build assets, and the icons and preview image that
// browsers and link unfurlers fetch without cookies.
export const config = {
  matcher: [
    "/((?!login|api/login|_next/static|_next/image|icon.svg|apple-icon|opengraph-image|manifest.webmanifest|robots.txt).*)",
  ],
};
