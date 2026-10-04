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

const POLL_MS = 10_000; // reply detection: F8 asks for a flip within 15 s
const SYNC_MS = 60_000; // new CC'd asks appear on their own, no need to type "sync"

/** Deterministic router: no LLM tool-calling needed for the chat itself. */
const makeAdapter = (refresh: () => Promise<void>): ChatModelAdapter => ({
  async run({ messages }) {
    const last = messages[messages.length - 1];
    const text = last.content.map((p) => (p.type === "text" ? p.text : "")).join(" ");
    try {
      if (/sync|scan|refresh|check (my )?mail/i.test(text)) {
        const r = await api<{ threads: number; classified: number; owed: number }>("/api/sync", {});
        await refresh();
        const found = r.owed === 0 ? "Nothing new is owed to you." : `Found ${r.owed} new thing${r.owed === 1 ? "" : "s"} you're owed.`;
        return { content: [{ type: "text", text: `Checked ${r.threads} thread${r.threads === 1 ? "" : "s"}. ${found}` }] };
      }
      if (/ow(e|ed|ing)|waiting|open loops|what.*due/i.test(text)) {
        const b = await api<Board>("/api/board");
        await refresh(); // the cards render from the shared board, not from `b`
        const quiet = b.loops.filter((l) => l.is_stalled).length;
        const head =
          b.loops.length === 0
            ? "Nobody owes you anything right now."
            : `You're owed ${b.loops.length} thing${b.loops.length === 1 ? "" : "s"}. ${quiet === 0 ? "None has" : quiet === 1 ? "One has" : `${quiet} have`} gone quiet.`;
        return {
          content: [
            { type: "text", text: head },
            { type: "tool-call", toolCallId: `board-${Date.now()}`, toolName: "list_open_loops", args: {}, argsText: "{}", result: { count: b.loops.length } },
          ],
        };
      }
      return { content: [{ type: "text", text: 'Ask "What am I owed?", or "Check my mail" to look for new asks right now.' }] };
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      return { content: [{ type: "text", text: `Couldn't do that: ${why}. Check the server log and your .env, then ask again.` }] };
    }
  },
});

function BoardToolUI() {
  const { board } = useBoard();
  if (!board) return <p className="muted">Loading…</p>;
  if (board.loops.length === 0) return null;
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

function CcAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="cc">
      <span>Add to CC</span>
      <code>{address}</code>
      <button
        onClick={() =>
          navigator.clipboard.writeText(address).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
        }
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

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

  // The browser drives the background work (serverless has no long-running loop):
  // poll known threads for replies every 10 s, and look for new CC'd asks every minute.
  useEffect(() => {
    const run = (path: string) => async () => {
      try {
        await api(path, {});
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    };
    const sync = run("/api/sync");
    sync();
    const p = setInterval(run("/api/poll"), POLL_MS);
    const s = setInterval(sync, SYNC_MS);
    return () => {
      clearInterval(p);
      clearInterval(s);
    };
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
            {board?.ccAddress && <CcAddress address={board.ccAddress} />}
          </header>
          {demoClock && (
            <p className="clock">
              Demo clock: an ask counts as quiet after {board!.stallAfter}. In real use it is 5 days.
            </p>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}

          <ThreadPrimitive.Root className="thread">
            <ThreadPrimitive.Viewport className="viewport">
              <ThreadPrimitive.Empty>
                <div className="empty">
                  {board?.ccAddress ? (
                    <p>
                      Asking someone for money, a document or an answer? Add Owed in CC. If they go quiet, Owed writes the follow-up and
                      sends it for you, with you in CC. It never reads the rest of your inbox, and nothing is sent until you click Send.
                    </p>
                  ) : (
                    <p>
                      Owed reads your sent mail and finds where you asked and got silence. If they go quiet, it drafts the follow-up in your
                      thread. Nothing is sent until you click Send.
                    </p>
                  )}
                  <div className="chips">
                    <button className="primary" onClick={() => runtime.thread.append("What am I owed?")}>What am I owed?</button>
                    <button onClick={() => runtime.thread.append("Check my mail")}>Check my mail</button>
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
          <footer className="foot">Runs on Neon Postgres and AI Gateway, assistant-ui and AgentMail.</footer>
        </main>
      </AssistantRuntimeProvider>
    </BoardContext.Provider>
  );
}
