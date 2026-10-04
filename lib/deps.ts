// Picks real or fake dependencies. Real: Neon + Gmail + LLM gateway. Fake: OWED_FAKE=1.
import "server-only";
import { neon } from "@neondatabase/serverless";
import type { Deps, Sql } from "./types";
import { realGmail } from "./gmail";
import { realLlm } from "./llm";

const g = globalThis as unknown as { __owedFake?: Promise<Deps & { fakeGmail: import("./fake").FakeGmail }> };

export const isFake = () => process.env.OWED_FAKE === "1";

function need(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}. See .env.example`);
  return v;
}

export async function getDeps(): Promise<Deps> {
  const stallAfter = process.env.STALL_AFTER ?? "5 days";
  const myName = process.env.MY_NAME ?? "Owed Demo";
  if (isFake()) return getFakeDeps();
  const db = neon(need("DATABASE_URL"));
  const sql: Sql = async (text, params) => (await db.query(text, params ?? [])) as Record<string, any>[];
  return {
    sql,
    gmail: realGmail({
      clientId: need("GOOGLE_CLIENT_ID"),
      clientSecret: need("GOOGLE_CLIENT_SECRET"),
      refreshToken: need("GOOGLE_REFRESH_TOKEN"),
    }),
    llm: realLlm,
    myName,
    stallAfter,
  };
}

export async function getFakeDeps() {
  if (!g.__owedFake) {
    g.__owedFake = (async () => {
      const { FakeGmail, fakeLlm, makePgliteSql } = await import("./fake");
      const fakeGmail = new FakeGmail();
      return {
        sql: await makePgliteSql(),
        gmail: fakeGmail,
        fakeGmail,
        llm: fakeLlm,
        myName: process.env.MY_NAME ?? "Owed Demo",
        stallAfter: process.env.STALL_AFTER ?? "20 minutes",
      };
    })();
  }
  return g.__owedFake;
}
