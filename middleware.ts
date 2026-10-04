// HTTP Basic Auth for the whole app when APP_PASSWORD is set (any username).
// The API can send email from Owed's inbox, so a public deploy must not be open.
// Unset locally: no prompt.
import { NextResponse, type NextRequest } from "next/server";

function safeEqual(a: string, b: string) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export function middleware(req: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();
  const [scheme, encoded] = (req.headers.get("authorization") ?? "").split(" ");
  if (scheme === "Basic" && encoded) {
    let decoded = "";
    try {
      decoded = atob(encoded);
    } catch {
      // malformed credentials: fall through to 401
    }
    if (decoded && safeEqual(decoded.slice(decoded.indexOf(":") + 1), password)) return NextResponse.next();
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Owed", charset="UTF-8"' },
  });
}

export const config = { matcher: ["/((?!_next/static|_next/image|icon.svg).*)"] };
