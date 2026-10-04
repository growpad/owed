// Wires the real dependencies: Neon Postgres, AgentMail or Gmail, and the LLM gateway.
import "server-only";
import { neon } from "@neondatabase/serverless";
import type { Deps, Sql } from "./types";
import { realGmail } from "./gmail";
import { realAgentMail } from "./agentmail";
import { realLlm } from "./llm";

export const isAgentMail = () => process.env.MAIL_PROVIDER === "agentmail";
/** The address users CC, when Owed has its own inbox. */
export const ccAddress = () => (isAgentMail() ? process.env.AGENTMAIL_INBOX ?? null : null);

function need(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}. See .env.example`);
  return v;
}

export async function getDeps(): Promise<Deps> {
  const db = neon(need("DATABASE_URL"));
  const sql: Sql = async (text, params) => (await db.query(text, params ?? [])) as Record<string, any>[];
  return {
    sql,
    mail: isAgentMail()
      ? realAgentMail({
          apiKey: need("AGENTMAIL_API_KEY"),
          inbox: need("AGENTMAIL_INBOX"),
          owners: need("OWNER_EMAILS").split(",").map((a) => a.trim()).filter(Boolean),
        })
      : realGmail({
          clientId: need("GOOGLE_CLIENT_ID"),
          clientSecret: need("GOOGLE_CLIENT_SECRET"),
          refreshToken: need("GOOGLE_REFRESH_TOKEN"),
        }),
    llm: realLlm,
    myName: need("MY_NAME"),
    assistant: isAgentMail(),
    stallAfter: process.env.STALL_AFTER ?? "5 days",
  };
}
