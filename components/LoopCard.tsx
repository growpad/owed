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

const LABEL: Record<string, string> = {
  open: "Waiting on them",
  drafted: "Draft ready",
  sent: "Sent · waiting for reply",
  replied: "They replied",
};

type Ev = { type: string; payload: Record<string, unknown>; created_at: string };

export function LoopCard({ loop, fake }: { loop: BoardRow; fake: boolean }) {
  const { refresh } = useBoard();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [history, setHistory] = useState<Ev[] | null>(null);

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
  const stakes = loop.stakes_usd != null ? `$${Number(loop.stakes_usd).toLocaleString("en-US")}` : null;
  const state = loop.is_stalled ? "quiet" : loop.state;

  return (
    <article className={`card state-${state}`}>
      <div className="card-head">
        <div>
          <h3>{name}</h3>
          <p className="subject">{loop.subject}</p>
        </div>
        <span className="pill">{loop.is_stalled ? `Quiet for ${ago(loop.last_msg_at)}` : LABEL[loop.state] ?? loop.state}</span>
      </div>

      <p className="owed">
        <strong>{loop.what_owed ?? "Something you asked for"}</strong>
        {stakes && <span className="stakes">{stakes}</span>}
      </p>

      {loop.state === "drafted" && loop.follow_up_body && (
        <blockquote className="draft">
          <span className="label">Draft ready in the thread · nothing leaves until you click Send</span>
          {loop.follow_up_body}
        </blockquote>
      )}

      {loop.state === "sent" && loop.receipt && (
        <p className="receipt">Sent in the thread · receipt <code>{loop.receipt}</code></p>
      )}

      {loop.state === "replied" && (
        <blockquote className="reply">
          <span className="label">{name} replied</span>
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
            <button className="primary" disabled={!!busy} onClick={() => act("send", () => api("/api/send", { followUpId: loop.follow_up_id }))}>
              {busy === "send" ? "Sending…" : "Send"}
            </button>
            <button disabled={!!busy} onClick={() => act("draft", () => api("/api/draft", { loopId: loop.id }))}>
              {busy === "draft" ? "Redrafting…" : "Redraft"}
            </button>
          </>
        )}
        {loop.state === "replied" && (
          <button className="primary" disabled={!!busy} onClick={() => act("resolve", () => api("/api/state", { loopId: loop.id, state: "resolved" }))}>
            Mark resolved
          </button>
        )}
        {loop.state === "sent" && fake && (
          <button disabled={!!busy} onClick={() => act("reply", () => api("/api/fake-reply", { threadId: loop.thread_id }))}>
            Simulate their reply (fake mode)
          </button>
        )}
        <button className="ghost" onClick={() => setHistory(history ? null : [])}>
          {history ? "Hide history" : "History"}
        </button>
      </div>

      {err && <p className="error">{err}</p>}

      {history && (
        <ol className="history">
          {history.map((e, i) => (
            <li key={i}>
              <span className="ev">{e.type.replaceAll("_", " ")}</span>
              <time>{new Date(e.created_at).toLocaleTimeString()}</time>
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}
