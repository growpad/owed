import { beforeEach, describe, expect, it } from "vitest";
import { board, draft, events, poll, send, setState, sync } from "@/lib/owed";
import { buildReply, isAutomated, parseAddress, summarizeThread } from "@/lib/mail";
import { uuid } from "@/lib/route";
import { parseClassification } from "@/lib/llm";
import { stripQuoted } from "@/lib/gmail";
import { FakeGmail, fakeLlm, makePgliteSql, ME } from "@/lib/fake";
import type { Deps } from "@/lib/types";

let deps: Deps;
let gmail: FakeGmail;

beforeEach(async () => {
  gmail = new FakeGmail(); // seeds sent 3 hours ago
  deps = { sql: await makePgliteSql(), mail: gmail, llm: fakeLlm, myName: "Owed Demo", assistant: false, stallAfter: "20 minutes" };
});

const byThread = async (id: string) => (await board(deps)).find((l) => l.thread_id === id)!;

describe("Owed end-to-end", () => {
  it("sync classifies 3 owed threads and ignores the thank-you note", async () => {
    const r = await sync(deps);
    expect(r).toEqual({ threads: 4, classified: 4, owed: 3 });
    const loops = await board(deps);
    expect(loops.map((l) => l.thread_id).sort()).toEqual(["t-deposit", "t-pilot", "t-refund"]);
    expect(loops.every((l) => l.is_stalled && l.last_from_me)).toBe(true);
    // ranked by stakes: $12,000 pilot first
    expect(loops[0].thread_id).toBe("t-pilot");
    // second sync does not re-classify
    expect((await sync(deps)).classified).toBe(0);
  });

  it("nothing is stalled before the threshold", async () => {
    await sync(deps);
    const strict = { ...deps, stallAfter: "5 days" };
    expect((await board(strict)).some((l) => l.is_stalled)).toBe(false);
  });

  it("full loop: draft in thread, draft does not reset clock, send on click, reply flips the card", async () => {
    await sync(deps);
    const deposit = await byThread("t-deposit");
    const before = new Date(deposit.last_msg_at).getTime();

    // Draft
    const d = await draft(deps, deposit.id);
    expect(d.body).toContain("Deposit for 14 Elm St");
    const thread = gmail.threads.get("t-deposit")!;
    const draftMsg = thread.find((m) => m.labelIds.includes("DRAFT"))!;
    expect(draftMsg.headers["in-reply-to"]).toBe(thread[0].headers["message-id"]);
    expect(draftMsg.headers["subject"]).toBe("Re: Deposit for 14 Elm St");

    // Re-sync and poll must NOT count the draft as the last message
    await sync(deps);
    await poll(deps);
    const afterDraft = await byThread("t-deposit");
    expect(afterDraft.state).toBe("drafted");
    expect(afterDraft.is_stalled).toBe(true);
    expect(new Date(afterDraft.last_msg_at).getTime()).toBe(before);
    expect(afterDraft.follow_up_body).toBe(d.body);

    // Send: receipt is the NEW message id; draft is gone
    const { messageId } = await send(deps, d.followUpId);
    expect(gmail.drafts.size).toBe(0);
    const sentMsg = gmail.threads.get("t-deposit")!.at(-1)!;
    expect(sentMsg.id).toBe(messageId);
    expect(sentMsg.labelIds).toEqual(["SENT"]);
    const afterSend = await byThread("t-deposit");
    expect(afterSend.state).toBe("sent");
    expect(afterSend.receipt).toBe(messageId);
    expect(afterSend.is_stalled).toBe(false);

    // Sending twice is refused
    await expect(send(deps, d.followUpId)).rejects.toThrow(/sent/);

    // Poll before reply: no flip
    expect((await poll(deps)).replied).toEqual([]);

    // They reply -> next poll flips it
    gmail.reply("t-deposit", "Sorry! Sending the deposit Monday.");
    const p = await poll(deps);
    expect(p.replied).toEqual([deposit.id]);
    const afterReply = await byThread("t-deposit");
    expect(afterReply.state).toBe("replied");
    expect(afterReply.last_text).toContain("Monday");

    // Memory: every step is an event, newest first
    const ev = (await events(deps, deposit.id)).map((e) => e.type);
    expect(ev).toEqual(["reply_received", "sent", "flagged", "drafted", "classified"]);

    // Resolve removes it from the board
    await setState(deps, deposit.id, "resolved");
    expect((await board(deps)).find((l) => l.thread_id === "t-deposit")).toBeUndefined();
  });

  it("redraft discards the old draft and keeps one pending follow-up", async () => {
    await sync(deps);
    const loop = await byThread("t-refund");
    const first = await draft(deps, loop.id);
    const second = await draft(deps, loop.id);
    const rows = await deps.sql(`select id, status from follow_ups where loop_id = $1 order by created_at`, [loop.id]);
    expect(rows.map((r) => r.status)).toEqual(["discarded", "draft"]);
    expect(rows[1].id).toBe(second.followUpId);
    await expect(send(deps, first.followUpId)).rejects.toThrow(/discarded/);
  });

  it("threads where they already replied are not classified", async () => {
    gmail.reply("t-thanks", "Anytime!");
    const r = await sync(deps);
    expect(r).toEqual({ threads: 4, classified: 3, owed: 3 });
  });

  it("a reply before any nudge still flips the card", async () => {
    await sync(deps);
    gmail.reply("t-refund", "Refund issued this morning.");
    const p = await poll(deps);
    expect(p.replied).toEqual([(await byThread("t-refund")).id]);
    expect((await byThread("t-refund")).state).toBe("replied");
  });

  it("flagged is logged once per silence", async () => {
    await sync(deps);
    await poll(deps);
    await poll(deps);
    const rows = await deps.sql(`select count(*)::int as n from events where type = 'flagged'`);
    expect(rows[0].n).toBe(3);
  });

  it("SEND_BUDGET stops sends once used", async () => {
    await sync(deps);
    process.env.SEND_BUDGET = "1";
    try {
      const a = await draft(deps, (await byThread("t-pilot")).id);
      await send(deps, a.followUpId);
      const b = await draft(deps, (await byThread("t-refund")).id);
      await expect(send(deps, b.followUpId)).rejects.toThrow(/budget/);
    } finally {
      delete process.env.SEND_BUDGET;
    }
  });

  it("a bounce or out-of-office does not count as their reply", async () => {
    await sync(deps);
    const loop = await byThread("t-deposit");
    await send(deps, (await draft(deps, loop.id)).followUpId);
    const t = gmail.threads.get("t-deposit")!;
    const msg = (id: string, headers: Record<string, string>) =>
      ({ id, labelIds: ["INBOX"], internalDate: Date.now(), headers: { to: ME, subject: "x", "message-id": `<${id}>`, ...headers }, text: "auto" });
    t.push(msg("b1", { from: "Mail Delivery Subsystem <mailer-daemon@googlemail.com>" }));
    t.push(msg("b2", { from: "Sam <sam.landlord@example.com>", "auto-submitted": "auto-replied" }));
    expect((await poll(deps)).replied).toEqual([]);
    expect((await byThread("t-deposit")).state).toBe("sent");
  });

  it("a double click sends once", async () => {
    await sync(deps);
    const d = await draft(deps, (await byThread("t-pilot")).id);
    const results = await Promise.allSettled([send(deps, d.followUpId), send(deps, d.followUpId)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const sent = gmail.threads.get("t-pilot")!.filter((m) => m.labelIds.includes("SENT"));
    expect(sent).toHaveLength(2); // the original ask + exactly one nudge
  });

  it("a failed send releases the claim so the user can retry", async () => {
    await sync(deps);
    const d = await draft(deps, (await byThread("t-refund")).id);
    const real = gmail.sendDraft.bind(gmail);
    gmail.sendDraft = async () => { throw new Error("network down"); };
    await expect(send(deps, d.followUpId)).rejects.toThrow(/network/);
    expect((await deps.sql(`select status from follow_ups where id = $1`, [d.followUpId]))[0].status).toBe("draft");
    gmail.sendDraft = real;
    await expect(send(deps, d.followUpId)).resolves.toHaveProperty("messageId");
  });

  it("redraft removes the replaced draft from the mailbox", async () => {
    await sync(deps);
    const loop = await byThread("t-deposit");
    await draft(deps, loop.id);
    await draft(deps, loop.id);
    expect(gmail.drafts.size).toBe(1);
    expect(gmail.threads.get("t-deposit")!.filter((m) => m.labelIds.includes("DRAFT"))).toHaveLength(1);
  });

  it("drafting a replied loop is refused", async () => {
    await sync(deps);
    const loop = await byThread("t-pilot");
    const d = await draft(deps, loop.id);
    await send(deps, d.followUpId);
    gmail.reply("t-pilot", "Looks good");
    await poll(deps);
    await expect(draft(deps, loop.id)).rejects.toThrow(/replied/);
  });
});

describe("helpers", () => {
  it("parses addresses", () => {
    expect(parseAddress('"Sam Patel" <Sam@X.com>')).toEqual({ name: "Sam Patel", email: "sam@x.com" });
    expect(parseAddress("plain@x.com")).toEqual({ name: null, email: "plain@x.com" });
  });

  it("buildReply makes a threadable RFC 822 message", () => {
    const raw = buildReply({ from: ME, to: "sam@x.com", subject: "Deposit", inReplyTo: "<a@b>", body: "Hi Sam" });
    const text = Buffer.from(raw, "base64url").toString("utf8");
    expect(text).toContain("Subject: Re: Deposit");
    expect(text).toContain("In-Reply-To: <a@b>");
    expect(text).toContain("References: <a@b>");
    expect(text.endsWith("Hi Sam\r\n")).toBe(true);
    expect(Buffer.from(buildReply({ from: ME, to: "x", subject: "Re: X", inReplyTo: "", body: "" }), "base64url").toString()).toContain("Subject: Re: X\r\n");
  });

  it("summarizeThread skips drafts and finds the counterpart", () => {
    const s = summarizeThread(
      {
        id: "t",
        messages: [
          { id: "1", labelIds: ["SENT"], internalDate: 1000, headers: { from: ME, to: "Sam <sam@x.com>", subject: "Hi", "message-id": "<1>" }, text: "q?" },
          { id: "2", labelIds: ["DRAFT"], internalDate: 2000, headers: { from: ME, to: "sam@x.com", subject: "Re: Hi" }, text: "draft" },
        ],
      },
      [ME],
    )!;
    expect(s.lastMsgId).toBe("<1>");
    expect(s.lastFromMe).toBe(true);
    expect(s.counterpart).toBe("sam@x.com");
    expect(s.counterpartName).toBe("Sam");
  });

  it("CC model: Owed's inbox and the owner are both our side", () => {
    const OWED = "owed@agentmail.to", JD = "jd@x.com";
    const m = (id: string, at: number, from: string, to: string, cc = "") =>
      ({ id, labelIds: [], internalDate: at, headers: { from, to, cc, subject: "Deposit", "message-id": id }, text: id });
    const ask = m("ask", 1, `JD <${JD}>`, "Sam <sam@x.com>", OWED);
    const nudge = m("nudge", 2, OWED, "sam@x.com", JD);
    const reply = m("reply", 3, "Sam <sam@x.com>", OWED, JD);
    const s1 = summarizeThread({ id: "t", messages: [ask] }, [OWED, JD])!;
    expect([s1.lastFromMe, s1.counterpart, s1.counterpartName]).toEqual([true, "sam@x.com", "Sam"]);
    const s2 = summarizeThread({ id: "t", messages: [ask, nudge] }, [OWED, JD])!;
    expect([s2.lastFromMe, s2.counterpart]).toEqual([true, "sam@x.com"]);
    const s3 = summarizeThread({ id: "t", messages: [ask, nudge, reply] }, [OWED, JD])!;
    expect([s3.lastFromMe, s3.counterpart]).toEqual([false, "sam@x.com"]);
  });

  it("flags machine mail", () => {
    const m = (h: Record<string, string>) => ({ id: "1", labelIds: [], internalDate: 0, headers: { from: "a@b.com", ...h }, text: "" });
    expect(isAutomated(m({}))).toBe(false);
    expect(isAutomated(m({ "auto-submitted": "no" }))).toBe(false);
    expect(isAutomated(m({ "auto-submitted": "auto-replied" }))).toBe(true);
    expect(isAutomated(m({ precedence: "bulk" }))).toBe(true);
    expect(isAutomated(m({ from: "MAILER-DAEMON@x.com" }))).toBe(true);
  });

  it("validates ids at the API boundary", () => {
    expect(uuid("3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e", "id")).toBe("3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e");
    expect(() => uuid("1; drop table loops", "id")).toThrow(/UUID/);
    expect(() => uuid(undefined, "id")).toThrow(/UUID/);
  });

  it("parses classifier JSON wrapped in prose or fences", () => {
    expect(parseClassification('```json\n{"owed": true, "what_owed": "Deposit", "open_question": null, "stakes_usd": "1800"}\n```')).toEqual({
      owed: true, what_owed: "Deposit", open_question: null, stakes_usd: 1800,
    });
    expect(parseClassification('{"owed": false}').owed).toBe(false);
  });

  it("strips quoted history from replies", () => {
    expect(stripQuoted("Sending Monday.\n\nOn Sat, Oct 4, 2026 Sam wrote:\n> old text")).toBe("Sending Monday.");
  });
});
