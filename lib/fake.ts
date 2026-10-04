// In-memory Gmail, LLM and Postgres (PGlite) for tests and OWED_FAKE=1 UI work.
// Fake mode is for building the UI while Google OAuth is being set up.
// Never record the submission video in fake mode: the UI shows a FAKE MODE banner.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { Classification, DraftInput, DraftReply, MailPort, LlmPort, RawMessage, RawThread, Sql } from "./types";

export const ME = "owed.demo@gmail.com";

export async function makePgliteSql(): Promise<Sql> {
  const db = new PGlite();
  await db.exec(readFileSync(join(process.cwd(), "schema.sql"), "utf8"));
  return async (text, params) => (await db.query(text, params as any[])).rows as Record<string, any>[];
}

let counter = 0;
const nextId = (p: string) => `${p}${++counter}`;

export class FakeGmail implements MailPort {
  threads = new Map<string, RawMessage[]>();
  drafts = new Map<string, { threadId: string; messageId: string }>();

  constructor(seed = true) {
    if (seed) this.seed();
  }

  /** Three things the user is owed, plus one thread that asks for nothing. */
  seed(minutesAgo = 180) {
    const t = Date.now() - minutesAgo * 60_000;
    this.addOutgoing("t-deposit", "Sam Patel <sam.landlord@example.com>", "Deposit for 14 Elm St",
      "Hi Sam, I moved out on Sep 28 and returned both keys. When can I expect the $1,800 deposit back?", t);
    this.addOutgoing("t-refund", "Northwind Support <support@northwind.example>", "Return for order 4471",
      "Hi, I returned the jacket on Sep 20 (order 4471, tracking 1Z999). Could you confirm the $240 refund?", t - 60_000);
    this.addOutgoing("t-pilot", "Dana Kim <dana@acme.example>", "Pilot proposal: support agent",
      "Hi Dana, attached is the pilot proposal for $12,000 over 6 weeks. Any questions before Friday?", t - 120_000);
    this.addOutgoing("t-thanks", "Priya Rao <priya@lumen.example>", "Thanks for lunch",
      "Thanks for lunch yesterday, Priya. Great to catch up.", t - 180_000);
  }

  addOutgoing(threadId: string, to: string, subject: string, text: string, at: number) {
    const list = this.threads.get(threadId) ?? [];
    list.push(this.msg(["SENT"], { from: `Owed Demo <${ME}>`, to, subject }, text, at));
    this.threads.set(threadId, list);
  }

  /** Simulate the other person replying (tests and fake-mode demo button). */
  reply(threadId: string, text: string) {
    const list = this.threads.get(threadId);
    if (!list) throw new Error("no thread");
    const first = list[0];
    list.push(this.msg(["INBOX"], { from: first.headers["to"], to: ME, subject: `Re: ${first.headers["subject"]}` }, text, Date.now()));
  }

  private msg(labelIds: string[], h: { from: string; to: string; subject: string }, text: string, at: number): RawMessage {
    const id = nextId("m");
    return { id, labelIds, internalDate: at, headers: { ...h, "message-id": `<${id}@fake.mail>` }, text };
  }

  async myAddresses() { return [ME]; }
  async listThreadIds(max: number) { return [...this.threads.keys()].slice(0, max); }
  async getThread(id: string): Promise<RawThread> {
    return { id, messages: structuredClone(this.threads.get(id) ?? []) };
  }
  async createDraft({ threadId, to, subject, inReplyTo, body }: DraftReply) {
    const m = this.msg(["DRAFT"], { from: ME, to, subject: /^re:/i.test(subject) ? subject : `Re: ${subject}` }, body, Date.now());
    m.headers["in-reply-to"] = inReplyTo;
    this.threads.get(threadId)!.push(m);
    const draftId = nextId("d");
    this.drafts.set(draftId, { threadId, messageId: m.id });
    return draftId;
  }
  async sendDraft(draftId: string) {
    const d = this.drafts.get(draftId);
    if (!d) throw new Error("draft not found");
    const list = this.threads.get(d.threadId)!;
    const i = list.findIndex((m) => m.id === d.messageId);
    // Gmail deletes the draft and creates a new SENT message with a new id.
    const sent = { ...list[i], id: nextId("m"), labelIds: ["SENT"], internalDate: Date.now() };
    list.splice(i, 1, sent);
    this.drafts.delete(draftId);
    return sent.id;
  }
}

export const fakeLlm: LlmPort = {
  async classify(text): Promise<Classification> {
    const amount = text.match(/\$([\d,]+)/);
    const owed = /\?/.test(text) && !/thanks for lunch/i.test(text);
    return {
      owed,
      what_owed: owed ? (/deposit/i.test(text) ? "Deposit refund" : /refund/i.test(text) ? "Return refund" : "Answer on proposal") : null,
      open_question: owed ? "When will they act on it?" : null,
      stakes_usd: amount ? Number(amount[1].replace(/,/g, "")) : null,
    };
  },
  async draft(input: DraftInput) {
    const firstName = input.counterpartName.split(/[\s<@]/)[0] || "there";
    return `Hi ${firstName}, following up on "${input.subject}". [fake LLM draft: ${input.whatOwed ?? "item"}] Could you confirm by Friday?`;
  },
};
