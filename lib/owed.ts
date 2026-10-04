// Core flow: sync -> board -> draft -> send -> poll. No framework code here,
// so the same functions run in API routes, tests and fake mode.
import { summarizeThread, type ThreadSummary } from "./mail";
import type { BoardRow, Deps } from "./types";

const MAX_THREADS = 20;

async function upsertThread(deps: Deps, s: ThreadSummary) {
  await deps.sql(
    `insert into threads (id, subject, counterpart, counterpart_name, last_msg_id, last_from_me, last_msg_at, last_text, body_tail, synced_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
     on conflict (id) do update set
       subject = excluded.subject, counterpart = excluded.counterpart, counterpart_name = excluded.counterpart_name,
       last_msg_id = excluded.last_msg_id, last_from_me = excluded.last_from_me, last_msg_at = excluded.last_msg_at,
       last_text = excluded.last_text, body_tail = excluded.body_tail, synced_at = now()`,
    [s.id, s.subject, s.counterpart, s.counterpartName, s.lastMsgId, s.lastFromMe, s.lastMsgAt.toISOString(), s.lastText, s.bodyTail],
  );
}

/** F2 + F3: read recent sent threads, store them, classify new ones once. */
export async function sync(deps: Deps) {
  const me = await deps.mail.myAddresses();
  const ids = await deps.mail.listThreadIds(MAX_THREADS);
  let classified = 0;
  let owed = 0;
  await Promise.all(
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
           insert into loops (thread_id, what_owed, open_question, stakes_usd, state)
           values ($1,$2,$3,$4,$5) on conflict (thread_id) do nothing returning id)
         insert into events (loop_id, type, payload) select id, 'classified', $6::jsonb from l`,
        [id, c.what_owed, c.open_question, c.stakes_usd, c.owed ? "open" : "dismissed", JSON.stringify(c)],
      );
    }),
  );
  return { threads: ids.length, classified, owed };
}

/** F4: every card the UI shows, with is_stalled computed from STALL_AFTER. */
export async function board(deps: Deps): Promise<BoardRow[]> {
  return (await deps.sql(
    `select l.id, l.what_owed, l.open_question, l.stakes_usd, l.state,
            t.id as thread_id, t.subject, t.counterpart, t.counterpart_name, t.last_msg_at, t.last_text, t.last_from_me,
            (l.state in ('open','drafted') and t.last_from_me and t.last_msg_at < now() - $1::interval) as is_stalled,
            f.id as follow_up_id, f.body as follow_up_body, f.gmail_message_id as receipt
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
  const rows = await deps.sql(
    `with old as (update follow_ups set status = 'discarded' where loop_id = $1 and status = 'draft'),
          f as (insert into follow_ups (loop_id, body, gmail_draft_id) values ($1,$2,$3) returning id, loop_id),
          l as (update loops set state = 'drafted', updated_at = now() where id = $1)
     insert into events (loop_id, type, payload)
     select loop_id, 'drafted', jsonb_build_object('follow_up_id', id, 'gmail_draft_id', $3::text) from f
     returning payload->>'follow_up_id' as follow_up_id`,
    [loopId, body, draftId],
  );
  // Remove the replaced draft from the mailbox too. Best effort: the DB already marks it discarded.
  for (const s of stale) {
    if (s.gmail_draft_id) await deps.mail.deleteDraft(s.gmail_draft_id).catch((e) => console.warn("[owed] stale draft", e));
  }
  return { followUpId: rows[0].follow_up_id as string, body };
}

/** F7: send only on an explicit call; Gmail deletes the draft and returns a new SENT message id. */
export async function send(deps: Deps, followUpId: string) {
  const budget = Number(process.env.SEND_BUDGET);
  const [{ n }] = await deps.sql(`select count(*)::int as n from follow_ups where status in ('sending','sent')`);
  if (budget > 0 && n >= budget) throw new HttpError(429, `send budget used: ${n}/${budget} (SEND_BUDGET)`);
  // Claim the follow-up atomically, so a double click or a retry cannot send twice.
  const claimed = await deps.sql(
    `update follow_ups set status = 'sending' where id = $1 and status = 'draft' and gmail_draft_id is not null returning *`,
    [followUpId],
  );
  if (claimed.length === 0) {
    const rows = await deps.sql(`select status from follow_ups where id = $1`, [followUpId]);
    if (rows.length === 0) throw new HttpError(404, "follow-up not found");
    throw new HttpError(409, `follow-up is ${rows[0].status}`);
  }
  const f = claimed[0];
  let messageId: string;
  try {
    messageId = await deps.mail.sendDraft(f.gmail_draft_id);
  } catch (e) {
    // Safe to release: both providers delete a draft once it is sent, so a retry of a draft
    // that did go out fails with "not found" instead of sending a second copy.
    await deps.sql(`update follow_ups set status = 'draft' where id = $1 and status = 'sending'`, [followUpId]);
    throw e;
  }
  await deps.sql(
    `with f as (update follow_ups set status = 'sent', sent_at = now(), gmail_message_id = $2 where id = $1 and status = 'sending' returning loop_id),
          l as (update loops set state = 'sent', updated_at = now() where id = (select loop_id from f)),
          t as (update threads set last_from_me = true, last_msg_at = now()
                where id = (select thread_id from loops where id = (select loop_id from f)))
     insert into events (loop_id, type, payload)
     select loop_id, 'sent', jsonb_build_object('follow_up_id', $1::text, 'gmail_message_id', $2::text) from f`,
    [followUpId, messageId],
  );
  return { messageId };
}

/** F8: re-read every thread we are waiting on; if they replied (before or after a nudge), flip the loop. */
export async function poll(deps: Deps) {
  const me = await deps.mail.myAddresses();
  const waiting = await deps.sql(`select thread_id from loops where state in ('open','drafted','sent')`);
  await Promise.all(
    waiting.map(async (w) => {
      const s = summarizeThread(await deps.mail.getThread(w.thread_id), me);
      if (s) await upsertThread(deps, s);
    }),
  );
  const replied = await deps.sql(
    `with r as (
       update loops l set state = 'replied', updated_at = now()
       from threads t
       where t.id = l.thread_id and not t.last_from_me and l.state in ('open','drafted','sent')
       returning l.id, t.last_text)
     insert into events (loop_id, type, payload)
     select id, 'reply_received', jsonb_build_object('text', last_text) from r
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
  return { checked: waiting.length, replied: replied.map((r) => r.loop_id as string) };
}

export async function setState(deps: Deps, loopId: string, state: "resolved" | "dismissed") {
  await deps.sql(
    `with l as (update loops set state = $2, updated_at = now() where id = $1 returning id)
     insert into events (loop_id, type) select id, $2 from l`,
    [loopId, state],
  );
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
