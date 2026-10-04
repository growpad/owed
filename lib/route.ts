// Tiny wrapper so every API route returns JSON errors with the right status.
import { NextResponse } from "next/server";
import { HttpError } from "./owed";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validate an id from the request before it reaches SQL. */
export function uuid(value: unknown, name: string): string {
  if (typeof value !== "string" || !UUID.test(value)) throw new HttpError(400, `${name} must be a UUID`);
  return value;
}

/** Parse a JSON body, answering 400 instead of 500 on garbage. */
export async function body(req: Request): Promise<Record<string, unknown>> {
  const b = await req.json().catch(() => null);
  if (!b || typeof b !== "object") throw new HttpError(400, "expected a JSON object body");
  return b as Record<string, unknown>;
}

export async function handle(fn: () => Promise<unknown>) {
  try {
    return NextResponse.json(await fn());
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    const message = e instanceof Error ? e.message : String(e);
    console.error("[owed]", message);
    return NextResponse.json({ error: message }, { status });
  }
}
