"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useLocalRuntime,
  type ChatModelAdapter,
} from "@assistant-ui/react";
import { LoopCard } from "@/components/LoopCard";
import { api, BoardContext, useBoard, type Board } from "@/components/board-context";

const POLL_MS = 10_000;

/** Deterministic router: no LLM tool-calling needed for the chat itself. */
const makeAdapter = (refresh: () => Promise<void>): ChatModelAdapter => ({
  async run({ messages }) {
    const last = messages[messages.length - 1];
    const text = last.content.map((p) => (p.type === "text" ? p.text : "")).join(" ");
    if (/sync|scan|refresh|check (my )?mail/i.test(text)) {
      const r = await api<{ threads: number; classified: number; owed: number }>("/api/sync", {});
      await refresh();
      return { content: [{ type: "text", text: `Scanned ${r.threads} threads. ${r.owed} new things you're owed. Ask "What am I owed?" to see them.` }] };
    }
    if (/ow(e|ed|ing)|waiting|open loops|what.*due/i.test(text)) {
      const b = await api<Board>("/api/board");
      await refresh(); // the cards render from the shared board, not from `b`
      const quiet = b.loops.filter((l) => l.is_stalled).length;
      return {
        content: [
          { type: "text", text: `You're owed ${b.loops.length} thing${b.loops.length === 1 ? "" : "s"}. ${quiet} ${quiet === 1 ? "has" : "have"} gone quiet.` },
          { type: "tool-call", toolCallId: `board-${Date.now()}`, toolName: "list_open_loops", args: {}, argsText: "{}", result: { count: b.loops.length } },
        ],
      };
    }
    return { content: [{ type: "text", text: 'Try "What am I owed?" or "Sync my inbox".' }] };
  },
});

function BoardToolUI() {
  const { board } = useBoard();
  if (!board) return <p className="muted">Loading…</p>;
  if (board.loops.length === 0) return <p className="muted">Nothing owed yet. Try "Sync my inbox".</p>;
  return (
    <div className="board">
      {board.loops.map((l) => (
        <LoopCard key={l.id} loop={l} />
      ))}
    </div>
  );
}

const UserMessage = () => (
  <MessagePrimitive.Root className="msg user">
    <MessagePrimitive.Parts />
  </MessagePrimitive.Root>
);

const AssistantMessage = () => (
  <MessagePrimitive.Root className="msg assistant">
    <MessagePrimitive.Parts components={{ tools: { by_name: { list_open_loops: BoardToolUI } } }} />
  </MessagePrimitive.Root>
);

export default function Page() {
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setBoard(await api<Board>("/api/board"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  const runtime = useLocalRuntime(useMemo(() => makeAdapter(refresh), [refresh]));

  // F8: the browser drives polling (serverless has no background loop).
  useEffect(() => {
    refresh();
    const t = setInterval(async () => {
      try {
        await api("/api/poll", {});
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
      await refresh();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  const ctx = useMemo(() => ({ board, refresh }), [board, refresh]);
  const demoClock = board && board.stallAfter !== "5 days";

  return (
    <BoardContext.Provider value={ctx}>
      <AssistantRuntimeProvider runtime={runtime}>
        <main className="shell">
          <header className="top">
            <div>
              <h1>Owed</h1>
              <p className="tag">Remembers what people owe you, and gets it back.</p>
            </div>
            {demoClock && (
              <span className="clock" title="Demo clock">
                Demo clock: quiet after {board!.stallAfter} (normally 5 days)
              </span>
            )}
          </header>
          {error && <p className="error">{error}</p>}

          <ThreadPrimitive.Root className="thread">
            <ThreadPrimitive.Viewport className="viewport">
              <ThreadPrimitive.Empty>
                <div className="empty">
                  {board?.ccAddress ? (
                    <p>
                      CC <strong>{board.ccAddress}</strong> on anything you're waiting on. Owed never reads your inbox. When they go quiet,
                      it drafts the nudge and sends it for you, with you in CC. Nothing sends without your click.
                    </p>
                  ) : (
                    <p>Ask what you're owed. Owed reads your sent mail, finds where you spoke last and got silence, and drafts the nudge. Nothing sends without your click.</p>
                  )}
                  <div className="chips">
                    <button onClick={() => runtime.thread.append("What am I owed?")}>What am I owed?</button>
                    <button onClick={() => runtime.thread.append("Sync my inbox")}>Sync my inbox</button>
                  </div>
                </div>
              </ThreadPrimitive.Empty>
              <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
            </ThreadPrimitive.Viewport>
            <ComposerPrimitive.Root className="composer">
              <ComposerPrimitive.Input className="input" placeholder='Ask "What am I owed?"' autoFocus />
              <ComposerPrimitive.Send className="send">Ask</ComposerPrimitive.Send>
            </ComposerPrimitive.Root>
          </ThreadPrimitive.Root>
          <footer className="foot">Neon Postgres + AI Gateway · assistant-ui · AgentMail · sent only on click</footer>
        </main>
      </AssistantRuntimeProvider>
    </BoardContext.Provider>
  );
}
