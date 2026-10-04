// Pure email helpers: summarise a Gmail thread and build an in-thread reply.
import type { RawMessage, RawThread } from "./types";

export type ThreadSummary = {
  id: string;
  subject: string;
  counterpart: string;
  counterpartName: string | null;
  lastMsgId: string;
  lastFromMe: boolean;
  lastMsgAt: Date;
  lastText: string;
  bodyTail: string;
};

/** "Sam Lee <sam@x.com>" -> { name: "Sam Lee", email: "sam@x.com" } */
export function parseAddress(value: string | undefined): { name: string | null; email: string } {
  const v = (value ?? "").split(",")[0].trim();
  const m = v.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim() || null, email: m[2].trim().toLowerCase() };
  return { name: null, email: v.toLowerCase() };
}

const isDraft = (m: RawMessage) => m.labelIds.includes("DRAFT");

/**
 * Gmail keeps drafts inside the thread with the DRAFT label. They must not
 * count as "the last message", or creating a draft would reset the silence clock.
 */
export function summarizeThread(thread: RawThread, myAddress: string): ThreadSummary | null {
  const me = myAddress.toLowerCase();
  const msgs = thread.messages.filter((m) => !isDraft(m)).sort((a, b) => a.internalDate - b.internalDate);
  if (msgs.length === 0) return null;
  const last = msgs[msgs.length - 1];
  const from = parseAddress(last.headers["from"]);
  const lastFromMe = from.email === me;
  // The counterpart is whoever is on the other side of the last message.
  const other = lastFromMe ? parseAddress(last.headers["to"]) : from;
  const tail = msgs
    .slice(-3)
    .map((m) => `From: ${m.headers["from"] ?? "?"}\nDate: ${new Date(m.internalDate).toISOString()}\n${m.text.trim()}`)
    .join("\n\n---\n\n");
  return {
    id: thread.id,
    subject: (msgs[0].headers["subject"] ?? "(no subject)").trim(),
    counterpart: other.email,
    counterpartName: other.name,
    lastMsgId: last.headers["message-id"] ?? "",
    lastFromMe,
    lastMsgAt: new Date(last.internalDate),
    lastText: last.text.trim().slice(0, 400),
    bodyTail: tail.slice(-4000),
  };
}

/** RFC 822 reply that Gmail threads with the original: In-Reply-To, References, matching Re: subject. */
export function buildReply(opts: { from: string; to: string; subject: string; inReplyTo: string; body: string }): string {
  const subject = /^re:/i.test(opts.subject) ? opts.subject : `Re: ${opts.subject}`;
  const headers = [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    `Subject: ${encodeHeader(subject)}`,
    opts.inReplyTo ? `In-Reply-To: ${opts.inReplyTo}` : null,
    opts.inReplyTo ? `References: ${opts.inReplyTo}` : null,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
  ].filter(Boolean);
  const message = `${headers.join("\r\n")}\r\n\r\n${opts.body}\r\n`;
  return Buffer.from(message, "utf8").toString("base64url");
}

function encodeHeader(s: string) {
  // RFC 2047 only when needed, so plain ASCII subjects stay readable.
  return /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`;
}
