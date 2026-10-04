// Tiny wrapper so every API route returns JSON errors with the right status.
import { NextResponse } from "next/server";
import { HttpError } from "./owed";

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
