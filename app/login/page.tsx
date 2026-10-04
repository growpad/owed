import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Mark } from "@/components/Logo";
import { safeNext, SESSION_COOKIE, verifySession } from "@/lib/session";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  // Already signed in: skip the form.
  const password = process.env.APP_PASSWORD;
  if (!password || (await verifySession(password, (await cookies()).get(SESSION_COOKIE)?.value))) redirect(safeNext(next));
  return (
    <main className="login">
      <form className="login-card" method="post" action="/api/login">
        <Link href="/" aria-label="Owed home">
          <Mark size={56} />
        </Link>
        <h1>Owed</h1>
        <p className="tag">Remembers what people owe you, and gets it back.</p>
        <input type="hidden" name="next" value={safeNext(next)} />
        {/* Lets password managers save and fill the sign-in; the app has one user. */}
        <input type="text" name="username" autoComplete="username" defaultValue="owed" hidden readOnly />
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          autoFocus
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "login-error" : undefined}
        />
        {error && (
          <p id="login-error" className="error" role="alert">
            Wrong password. Try again.
          </p>
        )}
        <button type="submit">Sign in</button>
      </form>
    </main>
  );
}
