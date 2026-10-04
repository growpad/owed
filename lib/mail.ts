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
  lastTheirAt: Date | null; // their latest real message: not ours, not a draft, not automated
  lastTheirText: string | null;
  bodyTail: string;
};

/** A mail provider error with its HTTP status (null: timeout or network, outcome unknown). */
export class MailError extends Error {
  constructor(public status: number | null, message: string) {
    super(message);
  }
}

/**
 * What a failed send means. "gone": the draft no longer exists (a provider deletes a draft once
 * it is sent). "rejected": the provider refused it, nothing was sent. "unknown": it may have gone out.
 */
export function sendOutcome(e: unknown): "gone" | "rejected" | "unknown" {
  const any = e as { status?: unknown; code?: unknown };
  const status = e instanceof MailError ? e.status : typeof any?.status === "number" ? any.status : typeof any?.code === "number" ? any.code : null;
  if (status === 404) return "gone";
  if (status !== null && status >= 400 && status < 500 && status !== 408 && status !== 429) return "rejected";
  return "unknown";
}

/** "Sam Lee <sam@x.com>" -> { name: "Sam Lee", email: "sam@x.com" } */
export function parseAddress(value: string | undefined): { name: string | null; email: string } {
  return parseAddresses(value)[0] ?? { name: null, email: "" };
}

// ponytail: splits on commas, so a quoted display name containing a comma breaks; fine for demo mail.
export function parseAddresses(value: string | undefined) {
  return (value ?? "").split(",").map((v) => v.trim()).filter(Boolean).map(parseOne);
}

function parseOne(v: string): { name: string | null; email: string } {
  const m = v.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim() || null, email: m[2].trim().toLowerCase() };
  return { name: null, email: v.toLowerCase() };
}

const isDraft = (m: RawMessage) => m.labelIds.includes("DRAFT");

/** Bounces, out-of-office and other machine mail are not a human answer (RFC 3834 Auto-Submitted). */
export function isAutomated(m: RawMessage): boolean {
  const auto = (m.headers["auto-submitted"] ?? "no").toLowerCase();
  const from = (m.headers["from"] ?? "").toLowerCase();
  return (
    auto !== "no" ||
    "x-autoreply" in m.headers ||
    "x-autorespond" in m.headers ||
    /^(auto_reply|bulk|junk)$/.test((m.headers["precedence"] ?? "").toLowerCase()) ||
    /mailer-daemon|postmaster@/.test(from)
  );
}

/**
 * Gmail keeps drafts inside the thread with the DRAFT label. They must not
 * count as "the last message", or creating a draft would reset the silence clock.
 */
export function summarizeThread(thread: RawThread, mine: string[]): ThreadSummary | null {
  const ours = new Set(mine.map((a) => a.toLowerCase()));
  const msgs = thread.messages.filter((m) => !isDraft(m) && !isAutomated(m)).sort((a, b) => a.internalDate - b.internalDate);
  if (msgs.length === 0) return null;
  const last = msgs[msgs.length - 1];
  const from = parseAddress(last.headers["from"]);
  const lastFromMe = ours.has(from.email);
  // The counterpart is whoever is on the other side of the last message.
  const other = lastFromMe
    ? parseAddresses(`${last.headers["to"] ?? ""},${last.headers["cc"] ?? ""}`).find((a) => !ours.has(a.email)) ?? parseAddress(last.headers["to"])
    : from;
  const theirs = msgs.filter((m) => !ours.has(parseAddress(m.headers["from"]).email)).at(-1);
  const tail = msgs
    .slice(-3)
    .map((m) => `From: ${m.headers["from"] ?? "?"}\nDate: ${humanDate(m.internalDate)}\n${m.text.trim()}`)
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
    lastTheirAt: theirs ? new Date(theirs.internalDate) : null,
    lastTheirText: theirs ? theirs.text.trim().slice(0, 400) : null,
    bodyTail: tail.slice(-4000),
  };
}

/** "Oct 4, 2026", the way a mail client shows it, so the model quotes dates naturally. */
function humanDate(ms: number) {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
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
