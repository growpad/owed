// Real Gmail adapter. One demo account: the refresh token comes from env
// (get it once with `npm run token`). Scopes: gmail.readonly + gmail.compose.
import { gmail as gmailApi, auth as gauth } from "@googleapis/gmail";
import type { GmailPort, RawMessage, RawThread } from "./types";

type Part = { mimeType?: string | null; body?: { data?: string | null } | null; parts?: Part[] | null };

function textOf(part: Part | undefined | null): string {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) {
    return Buffer.from(part.body.data, "base64url").toString("utf8");
  }
  for (const p of part.parts ?? []) {
    const t = textOf(p);
    if (t) return t;
  }
  return "";
}

/** Drop quoted history ("On ... wrote:" and "> " lines) so the LLM sees only the new text. */
export function stripQuoted(text: string): string {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    if (/^On .+wrote:\s*$/.test(line.trim())) break;
    if (line.startsWith(">")) continue;
    out.push(line);
  }
  return out.join("\n").trim();
}

export function realGmail(env: { clientId: string; clientSecret: string; refreshToken: string }): GmailPort {
  const oauth = new gauth.OAuth2(env.clientId, env.clientSecret);
  oauth.setCredentials({ refresh_token: env.refreshToken });
  const api = gmailApi({ version: "v1", auth: oauth });
  let me: string | null = null;

  return {
    async myAddress() {
      if (!me) me = (await api.users.getProfile({ userId: "me" })).data.emailAddress!.toLowerCase();
      return me;
    },
    async listSentThreadIds(max) {
      const res = await api.users.threads.list({ userId: "me", q: "in:sent newer_than:30d", maxResults: max });
      return (res.data.threads ?? []).map((t) => t.id!).filter(Boolean);
    },
    async getThread(id): Promise<RawThread> {
      const res = await api.users.threads.get({ userId: "me", id, format: "full" });
      const messages: RawMessage[] = (res.data.messages ?? []).map((m) => {
        const headers: Record<string, string> = {};
        for (const h of m.payload?.headers ?? []) if (h.name) headers[h.name.toLowerCase()] = h.value ?? "";
        return {
          id: m.id!,
          labelIds: m.labelIds ?? [],
          internalDate: Number(m.internalDate ?? 0),
          headers,
          text: stripQuoted(textOf(m.payload as Part) || m.snippet || ""),
        };
      });
      return { id, messages };
    },
    async createDraft(threadId, raw) {
      const res = await api.users.drafts.create({ userId: "me", requestBody: { message: { raw, threadId } } });
      return res.data.id!;
    },
    async sendDraft(draftId) {
      const res = await api.users.drafts.send({ userId: "me", requestBody: { id: draftId } });
      return res.data.id!;
    },
  };
}
