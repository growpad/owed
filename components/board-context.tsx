"use client";

import { createContext, useContext } from "react";
import type { BoardRow } from "@/lib/types";

export type Board = { stallAfter: string; ccAddress: string | null; now: string; loops: BoardRow[] };

export async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(
    path,
    body === undefined
      ? { cache: "no-store" }
      : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data as T;
}

// One live board for the whole page; the chat's tool UI renders from it.
type BoardCtx = { board: Board | null; refresh: () => Promise<void> };
export const BoardContext = createContext<BoardCtx>({ board: null, refresh: async () => {} });
export const useBoard = () => useContext(BoardContext);
