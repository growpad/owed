import { NextResponse } from "next/server";
import { APP_HOME, createSession, safeEqual, safeNext, SESSION_COOKIE, SESSION_DAYS } from "@/lib/session";
export const dynamic = "force-dynamic";

// A plain form post, so sign-in works before any JavaScript loads.
export async function POST(req: Request) {
  const form = await req.formData();
  const next = safeNext(form.get("next"));
  const password = process.env.APP_PASSWORD;
  const given = String(form.get("password") ?? "");
  if (!password || !safeEqual(given, password)) {
    // ponytail: a fixed delay, not a rate limiter. The password is long and random; add per-IP limits if it ever is not.
    await new Promise((r) => setTimeout(r, 600));
    const back = new URL("/login", req.url);
    back.searchParams.set("error", "1");
    if (next !== APP_HOME) back.searchParams.set("next", next);
    return NextResponse.redirect(back, 303);
  }
  const res = NextResponse.redirect(new URL(next, req.url), 303);
  res.cookies.set(SESSION_COOKIE, await createSession(password), {
    httpOnly: true,
    secure: new URL(req.url).protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
  return res;
}
