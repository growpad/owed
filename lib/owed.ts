// Core flow: sync -> board -> draft -> send -> poll. No framework code here,
// so the same functions run in API routes and tests.
import { sendOutcome, summarizeThread, type ThreadSummary } from "./mail";
import type { BoardRow, Deps } from "./types";

const MAX_THREADS = 20;

async function upsertThread(deps: Deps, s: ThreadSummary) {
  await deps.sql(
    `insert into threads (id, subject, counterpart, counterpart_name, last_msg_id, last_from_me, last_msg_at, last_text,
                          last_their_at, last_their_text, body_tail, synced_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now())
     on conflict (id) do update set
       subject = excluded.subject, counterpart = excluded.counterpart, counterpart_name = excluded.counterpart_name,
       last_msg_id = excluded.last_msg_id, last_from_me = excluded.last_from_me, last_msg_at = excluded.last_msg_at,
       last_text = excluded.last_text, last_their_at = excluded.last_their_at, last_their_text = excluded.last_their_text,
       body_tail = excluded.body_tail, synced_at = now()`,
    [s.id, s.subject, s.counterpart, s.counterpartName, s.lastMsgId, s.lastFromMe, s.lastMsgAt.toISOString(), s.lastText,
     s.lastTheirAt?.toISOString() ?? null, s.lastTheirText, s.bodyTail],
  );
}

/** F2 + F3: read recent sent threads, store them, classify new ones once. */
export async function sync(deps: Deps) {
  const me = await deps.mail.myAddresses();
  const ids = await deps.mail.listThreadIds(MAX_THREADS);
  let classified = 0;
  let owed = 0;
  // One unreadable thread must not stop the others: settle each, count failures.
  const failed = await settleAll(
    ids.map(async (id) => {
      const s = summarizeThread(await deps.mail.getThread(id), me);
      if (!s) return;
      await upsertThread(deps, s);
      if (!s.lastFromMe) return; // they spoke last: nothing owed (yet); a later sync picks it up
      const existing = await deps.sql(`select id from loops where thread_id = $1`, [id]);
      if (existing.length > 0) return;
      const c = await deps.llm.classify(`Subject: ${s.subject}\n\n${s.bodyTail}`);
      classified++;
      if (c.owed) owed++;
      await deps.sql(
        `with l as (
           insert into loops (thread_id, what_owed, open_question, stakes_usd, state, waiting_since)
           values ($1,$2,$3,$4,$5,$7) on conflict (thread_id) do nothing returning id)
         insert into events (loop_id, type, payload) select id, 'classified', $6::jsonb from l`,
        [id, c.what_owed, c.open_question, c.stakes_usd, c.owed ? "open" : "dismissed", JSON.stringify(c), s.lastMsgAt.toISOString()],
      );
    }),
    "sync",
  );
  return { threads: ids.length, classified, owed, failed };
}

/** F4: every card the UI shows, with is_stalled computed from STALL_AFTER. */
export async function board(deps: Deps): Promise<BoardRow[]> {
  return (await deps.sql(
    `select l.id, l.what_owed, l.open_question, l.stakes_usd, l.state,
            t.id as thread_id, t.subject, t.counterpart, t.counterpart_name, t.last_msg_at, t.last_text, t.last_their_text, t.last_from_me,
            (l.state in ('open','drafted') and t.last_from_me and t.last_msg_at < now() - $1::interval) as is_stalled,
            f.id as follow_up_id, f.body as follow_up_body, f.status as follow_up_status, f.gmail_message_id as receipt
     from loops l
     join threads t on t.id = l.thread_id
     left join lateral (
       select * from follow_ups f where f.loop_id = l.id and f.status in ('draft','sending','sent')
       order by f.created_at desc limit 1) f on true
     where l.state not in ('dismissed','resolved')
     order by l.stakes_usd desc nulls last, t.last_msg_at asc
     limit 10`,
    [deps.stallAfter],
  )) as BoardRow[];
}

async function loadLoop(deps: Deps, loopId: string) {
  const rows = await deps.sql(
    `select l.*, t.subject, t.counterpart, t.counterpart_name, t.last_msg_id, t.body_tail
     from loops l join threads t on t.id = l.thread_id where l.id = $1`,
    [loopId],
  );
  if (rows.length === 0) throw new HttpError(404, "loop not found");
  return rows[0];
}

export async function events(deps: Deps, loopId: string) {
  return deps.sql(`select type, payload, created_at from events where loop_id = $1 order by created_at desc, id desc limit 20`, [loopId]);
}

/** F6: draft the nudge with the LLM and place it inside the original Gmail thread. */
export async function draft(deps: Deps, loopId: string) {
  const loop = await loadLoop(deps, loopId);
  if (!["open", "drafted"].includes(loop.state)) throw new HttpError(409, `cannot draft in state ${loop.state}`);
  const busy = await deps.sql(`select 1 from follow_ups where loop_id = $1 and status = 'sending'`, [loopId]);
  if (busy.length) throw new HttpError(409, "a send is in progress for this card; click Send to finish it");
  const allow = (process.env.SEND_ALLOWLIST ?? "").split(",").map((a) => a.trim().toLowerCase()).filter(Boolean);
  if (allow.length && !allow.includes(loop.counterpart)) throw new HttpError(403, `${loop.counterpart} is not in SEND_ALLOWLIST`);
  const prior = (await deps.sql(
    `select type, payload, created_at from events where loop_id = $1 order by created_at desc, id desc limit 10`,
    [loopId],
  )) as { type: string; payload: unknown; created_at: string }[];
  const body = await deps.llm.draft({
    myName: deps.myName,
    assistant: deps.assistant,
    subject: loop.subject,
    counterpartName: loop.counterpart_name ?? loop.counterpart,
    bodyTail: loop.body_tail ?? "",
    whatOwed: loop.what_owed,
    openQuestion: loop.open_question,
    priorEvents: prior,
  });
  const stale = await deps.sql(`select gmail_draft_id from follow_ups where loop_id = $1 and status = 'draft'`, [loopId]);
  const draftId = await deps.mail.createDraft({
    threadId: loop.thread_id, to: loop.counterpart, subject: loop.subject, inReplyTo: loop.last_msg_id, body,
  });
  // The model call takes seconds; if they replied (or the card was closed) meanwhile, keep that state.
  const rows = await deps.sql(
    `with l as (update loops set state = 'drafted', updated_at = now() where id = $1 and state in ('open','drafted') returning id),
          old as (update follow_ups set status = 'discarded' where loop_id = $1 and status = 'draft' and exists (select 1 from l)),
          f as (insert into follow_ups (loop_id, body, gmail_draft_id) select $1, $2, $3 from l returning id, loop_id)
     insert into events (loop_id, type, payload)
     select loop_id, 'drafted', jsonb_build_object('follow_up_id', id, 'gmail_draft_id', $3::text) from f
     returning payload->>'follow_up_id' as follow_up_id`,
    [loopId, body, draftId],
  );
  if (rows.length === 0) {
    await deps.mail.deleteDraft(draftId).catch((e) => console.warn("[owed] orphan draft", e));
    throw new HttpError(409, "this card changed while drafting (they may have replied); nothing was saved");
  }
  // Remove the replaced draft from the mailbox too. Best effort: the DB already marks it discarded.
  for (const s of stale) {
    if (s.gmail_draft_id) await deps.mail.deleteDraft(s.gmail_draft_id).catch((e) => console.warn("[owed] stale draft", e));
  }
  return { followUpId: rows[0].follow_up_id as string, body };
}

export const MAX_BODY = 5000;

/** User story 3: edit the draft before sending. The mailbox draft is updated too, so Send sends exactly this. */
export async function editDraft(deps: Deps, followUpId: string, body: string) {
  const text = body.trim();
  if (!text) throw new HttpError(400, "the draft cannot be empty");
  if (text.length > MAX_BODY) throw new HttpError(400, `the draft is over ${MAX_BODY} characters`);
  const rows = await deps.sql(
    `select f.status, f.gmail_draft_id, f.loop_id, l.state, t.id as thread_id, t.counterpart, t.subject, t.last_msg_id
     from follow_ups f join loops l on l.id = f.loop_id join threads t on t.id = l.thread_id where f.id = $1`,
    [followUpId],
  );
  if (rows.length === 0) throw new HttpError(404, "follow-up not found");
  const f = rows[0];
  if (f.status !== "draft" || f.state !== "drafted") throw new HttpError(409, `follow-up is ${f.status}, card is ${f.state}`);
  await deps.mail.updateDraft(f.gmail_draft_id, {
    threadId: f.thread_id, to: f.counterpart, subject: f.subject, inReplyTo: f.last_msg_id, body: text,
  });
  const saved = await deps.sql(
    `with u as (update follow_ups set body = $2 where id = $1 and status = 'draft' returning loop_id)
     insert into events (loop_id, type, payload) select loop_id, 'edited', jsonb_build_object('follow_up_id', $1::text) from u
     returning loop_id`,
    [followUpId, text],
  );
  if (saved.length === 0) throw new HttpError(409, "the draft changed while saving (it may have been sent); reload the card");
  return { body: text };
}

function sendBudget(): number | null {
  const raw = process.env.SEND_BUDGET?.trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(500, `SEND_BUDGET must be a positive whole number, got "${raw}"`);
  return n;
}

/**
 * F7: send only on an explicit call. Providers delete a draft once it is sent, which makes a send
 * safe to retry: a second attempt either sends (the first never went out) or finds the draft gone.
 */
export async function send(deps: Deps, followUpId: string) {
  const budget = sendBudget();
  if (budget !== null) {
    const [{ n }] = await deps.sql(`select count(*)::int as n from follow_ups where status in ('sending','sent')`);
    if (n >= budget) throw new HttpError(429, `send budget used: ${n}/${budget} (SEND_BUDGET)`);
  }
  // Re-read the thread first: the board can be 10 s stale, and a reply that just landed must stop the send.
  const [target] = await deps.sql(
    `select l.thread_id from follow_ups f join loops l on l.id = f.loop_id where f.id = $1`,
    [followUpId],
  );
  if (target) {
    try {
      const s = summarizeThread(await deps.mail.getThread(target.thread_id), await deps.mail.myAddresses());
      if (s) await upsertThread(deps, s);
    } catch (e) {
      console.warn("[owed] pre-send refresh failed; using stored thread", e instanceof Error ? e.message : e);
    }
  }
  // Claim atomically: a double click cannot send twice, and nothing goes out once they replied.
  // A send stuck in 'sending' (timeout, crash) can be claimed again after 30 s.
  const claimed = await deps.sql(
    `update follow_ups f set status = 'sending', claimed_at = now()
     from follow_ups prev, loops l, threads t
     where f.id = $1 and prev.id = f.id and l.id = f.loop_id and t.id = l.thread_id
       and f.gmail_draft_id is not null and l.state = 'drafted'
       and not coalesce(t.last_their_at > l.waiting_since, false)
       and (f.status = 'draft' or (f.status = 'sending' and f.claimed_at < now() - interval '30 seconds'))
     returning f.gmail_draft_id, prev.status as prev_status`,
    [followUpId],
  );
  if (claimed.length === 0) {
    const rows = await deps.sql(
      `select f.status, l.state, coalesce(t.last_their_at > l.waiting_since, false) as replied
       from follow_ups f join loops l on l.id = f.loop_id join threads t on t.id = l.thread_id where f.id = $1`,
      [followUpId],
    );
    if (rows.length === 0) throw new HttpError(404, "follow-up not found");
    const r = rows[0];
    if (r.replied || r.state === "replied") throw new HttpError(409, "they already replied, so nothing was sent");
    if (r.status === "sending") throw new HttpError(409, "this send is still in progress; try again in 30 seconds");
    throw new HttpError(409, `follow-up is ${r.status}, card is ${r.state}`);
  }
  const { gmail_draft_id: draftId, prev_status: prev } = claimed[0];
  let messageId: string | null;
  try {
    messageId = await deps.mail.sendDraft(draftId);
  } catch (e) {
    const outcome = sendOutcome(e);
    console.error("[owed] send failed", { followUpId, outcome, error: e instanceof Error ? e.message : e });
    if (outcome === "gone" && prev === "sending") {
      messageId = null; // an earlier attempt did send it: the provider deleted the draft. Record it below.
    } else if (outcome === "gone") {
      await deps.sql(`update follow_ups set status = 'discarded' where id = $1 and status = 'sending'`, [followUpId]);
      throw new HttpError(409, "this draft no longer exists in the mailbox; click Redraft");
    } else if (outcome === "rejected") {
      await deps.sql(`update follow_ups set status = 'draft' where id = $1 and status = 'sending'`, [followUpId]);
      throw e;
    } else {
      throw new HttpError(502, "couldn't confirm the send; wait 30 seconds and click Send again (it will not send twice)");
    }
  }
  const record = () =>
    deps.sql(
      `with f as (update follow_ups set status = 'sent', sent_at = now(), gmail_message_id = $2 where id = $1 and status = 'sending' returning loop_id),
            l as (update loops set state = 'sent', waiting_since = now(), updated_at = now()
                  where id = (select loop_id from f) and state = 'drafted' returning thread_id),
            t as (update threads set last_from_me = true, last_msg_at = now() where id = (select thread_id from l))
       insert into events (loop_id, type, payload)
       select loop_id, 'sent', jsonb_build_object('follow_up_id', $1::text, 'gmail_message_id', $2::text) from f`,
      [followUpId, messageId],
    );
  try {
    await record();
  } catch {
    try {
      await record();
    } catch (e) {
      // The email went out. The row stays 'sending'; clicking Send after 30 s finds the draft gone and records it.
      console.error("[owed] SENT BUT NOT RECORDED", { followUpId, messageId, error: e instanceof Error ? e.message : e });
      throw new HttpError(500, "the email was sent but could not be recorded; click Send again in 30 seconds to record it");
    }
  }
  return { messageId };
}

/** F8: re-read every thread we are waiting on; if they replied (before or after a nudge), flip the loop. */
export async function poll(deps: Deps) {
  const me = await deps.mail.myAddresses();
  const waiting = await deps.sql(`select thread_id from loops where state in ('open','drafted','sent')`);
  const failed = await settleAll(
    waiting.map(async (w) => {
      const s = summarizeThread(await deps.mail.getThread(w.thread_id), me);
      if (s) await upsertThread(deps, s);
    }),
    "poll",
  );
  // Replied = any real message from them after our ask or last nudge, even if we spoke again since.
  const replied = await deps.sql(
    `with r as (
       update loops l set state = 'replied', updated_at = now()
       from threads t
       where t.id = l.thread_id and l.state in ('open','drafted','sent') and t.last_their_at > l.waiting_since
       returning l.id, t.last_their_text)
     insert into events (loop_id, type, payload)
     select id, 'reply_received', jsonb_build_object('text', last_their_text) from r
     returning loop_id`,
  );
  // F9: log the moment a loop goes quiet, once per silence (a new message from us starts a new one).
  await deps.sql(
    `insert into events (loop_id, type, payload)
     select l.id, 'flagged', jsonb_build_object('silent_since', t.last_msg_at)
     from loops l join threads t on t.id = l.thread_id
     where l.state in ('open','drafted','sent') and t.last_from_me and t.last_msg_at < now() - $1::interval
       and not exists (select 1 from events e where e.loop_id = l.id and e.type = 'flagged'
                       and (e.payload->>'silent_since')::timestamptz = t.last_msg_at)`,
    [deps.stallAfter],
  );
  return { checked: waiting.length, replied: replied.map((r) => r.loop_id as string), failed };
}

/** Resolved: you got what you were owed. Dismissed: the classifier was wrong, nothing was owed. */
export async function setState(deps: Deps, loopId: string, state: "resolved" | "dismissed") {
  await deps.sql(
    `with l as (update loops set state = $2, updated_at = now() where id = $1 returning id)
     insert into events (loop_id, type) select id, $2 from l`,
    [loopId, state],
  );
}

/** Run all, log each failure, return how many failed. Everything failing means something global (auth, network): throw. */
async function settleAll(work: Promise<unknown>[], label: string): Promise<number> {
  const failed = (await Promise.allSettled(work)).filter((r): r is PromiseRejectedResult => r.status === "rejected");
  for (const f of failed) console.error(`[owed] ${label}:`, f.reason instanceof Error ? f.reason.message : f.reason);
  if (failed.length > 0 && failed.length === work.length) throw failed[0].reason;
  return failed.length;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
