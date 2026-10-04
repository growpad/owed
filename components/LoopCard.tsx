"use client";

import { useEffect, useState } from "react";
import type { BoardRow } from "@/lib/types";
import { api, useBoard } from "./board-context";

export type { Board } from "./board-context";

function ago(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 60) return `${mins} min`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} days`;
}

const STATUS: Record<string, string> = {
  open: "Waiting on them",
  drafted: "Draft ready",
  sent: "Nudge sent",
  replied: "They replied",
};

const EVENT: Record<string, string> = {
  classified: "Spotted the ask",
  flagged: "Went quiet",
  drafted: "Drafted a nudge",
  edited: "You edited the draft",
  sent: "Sent the nudge",
  reply_received: "They replied",
  resolved: "Marked resolved",
  dismissed: "Marked not owed",
};

type Ev = { type: string; payload: Record<string, unknown>; created_at: string };

export function LoopCard({ loop }: { loop: BoardRow }) {
  const { refresh } = useBoard();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [history, setHistory] = useState<Ev[] | null>(null);
  const [text, setText] = useState(loop.follow_up_body ?? "");

  // A new draft (or redraft) replaces whatever is in the editor.
  useEffect(() => setText(loop.follow_up_body ?? ""), [loop.follow_up_id, loop.follow_up_body]);
  const dirty = loop.state === "drafted" && text.trim() !== (loop.follow_up_body ?? "").trim();

  async function act(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setErr(null);
    try {
      await fn();
      await refresh();
      if (history) await loadHistory();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function loadHistory() {
    const r = await api<{ events: Ev[] }>(`/api/events?loopId=${loop.id}`);
    setHistory(r.events);
  }

  // Keep an open history panel live: a poll that flips the state also adds an event.
  const historyOpen = history !== null;
  useEffect(() => {
    if (historyOpen) loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loop.state, historyOpen]);

  const name = loop.counterpart_name ?? loop.counterpart;
  const firstName = name.split(/[\s@]/)[0];
  const amount = loop.stakes_usd != null ? `$${Number(loop.stakes_usd).toLocaleString("en-US")}` : null;
  const tone = loop.state === "replied" ? "settled" : loop.is_stalled ? "overdue" : "pending";
  const save = () => api("/api/edit", { followUpId: loop.follow_up_id, text });
  const setState = (state: "resolved" | "dismissed") => act(state, () => api("/api/state", { loopId: loop.id, state }));

  return (
    <article className={`slip ${tone}`} aria-label={`${name}: ${loop.what_owed ?? loop.subject}`}>
      <div className="figure">
        <span className="amount">{amount ?? "—"}</span>
        <span className="status" role="status">
          {loop.is_stalled ? `Quiet for ${ago(loop.last_msg_at)}` : STATUS[loop.state] ?? loop.state}
        </span>
      </div>

      <div className="detail">
        <h3>{loop.what_owed ?? "Something you asked for"}</h3>
        <p className="who">
          from <strong>{name}</strong> in “{loop.subject}”
        </p>

        {loop.state === "drafted" && loop.follow_up_id && (
          <label className="draft">
            <span>Your nudge to {firstName}. Edit anything; nothing is sent until you click Send.</span>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={Math.min(12, text.split("\n").length + 2)} disabled={!!busy} />
          </label>
        )}

        {loop.state === "sent" && (
          <p className="note">
            Sent in the thread{loop.receipt ? <> (receipt <code>{loop.receipt.replace(/^<|>$/g, "")}</code>)</> : null}. Waiting for {firstName} to answer.
          </p>
        )}

        {loop.state === "replied" && (
          <blockquote className="reply">
            <span>{name} replied</span>
            {loop.last_text}
          </blockquote>
        )}

        <div className="actions">
          {loop.state === "open" && (
            <button className="primary" disabled={!!busy} onClick={() => act("draft", () => api("/api/draft", { loopId: loop.id }))}>
              {busy === "draft" ? "Drafting…" : "Draft follow-up"}
            </button>
          )}
          {loop.state === "drafted" && loop.follow_up_id && (
            <>
              <button
                className="primary"
                disabled={!!busy || !text.trim()}
                onClick={() => act("send", async () => {
                  if (dirty) await save();
                  await api("/api/send", { followUpId: loop.follow_up_id });
                })}
              >
                {busy === "send" ? "Sending…" : "Send"}
              </button>
              {dirty && (
                <button disabled={!!busy || !text.trim()} onClick={() => act("save", save)}>
                  {busy === "save" ? "Saving…" : "Save edit"}
                </button>
              )}
              <button disabled={!!busy} onClick={() => act("draft", () => api("/api/draft", { loopId: loop.id }))}>
                {busy === "draft" ? "Redrafting…" : "Redraft"}
              </button>
            </>
          )}
          {loop.state === "replied" ? (
            <button className="primary" disabled={!!busy} onClick={() => setState("resolved")}>
              Mark resolved
            </button>
          ) : (
            <button className="quiet" disabled={!!busy} onClick={() => setState("resolved")}>
              Mark resolved
            </button>
          )}
          {loop.state === "open" && (
            <button className="quiet" disabled={!!busy} onClick={() => setState("dismissed")}>
              Not owed
            </button>
          )}
          <button className="quiet" aria-expanded={historyOpen} onClick={() => setHistory(history ? null : [])}>
            {history ? "Hide history" : "History"}
          </button>
        </div>

        {err && <p className="error" role="alert">{err}</p>}

        {history && (
          <ol className="history">
            {history.map((e, i) => (
              <li key={i}>
                <span>{EVENT[e.type] ?? e.type}</span>
                <time dateTime={e.created_at}>{new Date(e.created_at).toLocaleString([], { hour: "numeric", minute: "2-digit", month: "short", day: "numeric" })}</time>
              </li>
            ))}
          </ol>
        )}
      </div>

      {tone === "settled" && <span className="stamp" aria-hidden="true">Settled</span>}
    </article>
  );
}
