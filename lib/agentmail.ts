// AgentMail adapter: Owed has its own inbox. You CC it on any ask; it never reads
// your mailbox. It chases from its own address with you in CC, so the other
// person's reply-all lands back in Owed's inbox and flips the card.
// CC, not BCC: a BCC'd address is dropped from replies, so Owed would never see them.
import type { MailPort, RawThread } from "./types";

const BASE = "https://api.agentmail.to/v0";

type AmMessage = {
  message_id: string;
  from: string;
  to?: string[];
  cc?: string[];
  subject?: string;
  text?: string;
  extracted_text?: string; // body without quoted history
  labels: string[];
  timestamp: string;
  headers?: Record<string, string>;
};

// Only the headers Owed reads: isAutomated() in lib/mail.ts uses them to skip bounces and auto-replies.
const KEEP = ["auto-submitted", "x-autoreply", "x-autorespond", "precedence"];

export function realAgentMail(env: { apiKey: string; inbox: string; owners: string[] }): MailPort {
  const inbox = encodeURIComponent(env.inbox);

  async function call<T>(path: string, init?: RequestInit, attempt = 0): Promise<T> {
    const res = await fetch(`${BASE}/inboxes/${inbox}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${env.apiKey}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    // AgentMail rate limits answer 429 + Retry-After (usually 1 s); retry twice, backing off.
    if (res.status === 429 && attempt < 2) {
      const wait = Number(res.headers.get("retry-after")) || 1;
      await new Promise((r) => setTimeout(r, wait * 1000 * 2 ** attempt));
      return call<T>(path, init, attempt + 1);
    }
    if (!res.ok) throw new Error(`AgentMail ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return res.status === 204 ? (undefined as T) : (res.json() as Promise<T>);
  }

  return {
    async myAddresses() {
      return [env.inbox, ...env.owners].map((a) => a.toLowerCase());
    },
    async listThreadIds(max) {
      const after = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const r = await call<{ threads: { thread_id: string }[] }>(`/threads?limit=${max}&after=${encodeURIComponent(after)}`);
      return r.threads.map((t) => t.thread_id);
    },
    async getThread(id): Promise<RawThread> {
      const t = await call<{ messages: AmMessage[] }>(`/threads/${encodeURIComponent(id)}`);
      return {
        id,
        messages: t.messages.map((m) => ({
          id: m.message_id,
          labelIds: m.labels.map((l) => l.toUpperCase()),
          internalDate: Date.parse(m.timestamp),
          headers: {
            ...Object.fromEntries(
              Object.entries(m.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]).filter(([k]) => KEEP.includes(k)),
            ),
            from: m.from,
            to: (m.to ?? []).join(", "),
            cc: (m.cc ?? []).join(", "),
            subject: m.subject ?? "",
            "message-id": m.message_id,
          },
          text: (m.extracted_text ?? m.text ?? "").trim(),
        })),
      };
    },
    async createDraft({ to, subject, inReplyTo, body }) {
      const r = await call<{ draft_id: string }>(`/drafts`, {
        method: "POST",
        body: JSON.stringify({
          to: [to],
          cc: env.owners, // you always see what Owed sends on your behalf
          subject: /^re:/i.test(subject) ? subject : `Re: ${subject}`,
          text: body,
          in_reply_to: inReplyTo || undefined,
        }),
      });
      return r.draft_id;
    },
    async updateDraft(draftId, { body }) {
      await call(`/drafts/${encodeURIComponent(draftId)}`, { method: "PATCH", body: JSON.stringify({ text: body }) });
    },
    async deleteDraft(draftId) {
      await call(`/drafts/${encodeURIComponent(draftId)}`, { method: "DELETE" });
    },
    async sendDraft(draftId) {
      const r = await call<{ message_id: string }>(`/drafts/${encodeURIComponent(draftId)}/send`, { method: "POST", body: "{}" });
      return r.message_id;
    },
  };
}
