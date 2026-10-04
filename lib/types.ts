// Shared shapes. The core logic in lib/owed.ts only depends on these
// interfaces, so tests and fake mode swap in in-memory versions.

export type Sql = (text: string, params?: unknown[]) => Promise<Record<string, any>[]>;

export type RawMessage = {
  id: string;
  labelIds: string[];
  internalDate: number; // ms since epoch
  headers: Record<string, string>; // lower-cased header names
  text: string; // text/plain body
};

export type RawThread = { id: string; messages: RawMessage[] };

export interface GmailPort {
  myAddress(): Promise<string>;
  listSentThreadIds(max: number): Promise<string[]>;
  getThread(id: string): Promise<RawThread>;
  createDraft(threadId: string, raw: string): Promise<string>; // returns draft id
  sendDraft(draftId: string): Promise<string>; // returns the new SENT message id
}

export type Classification = {
  owed: boolean;
  what_owed: string | null;
  open_question: string | null;
  stakes_usd: number | null;
};

export type DraftInput = {
  myName: string;
  subject: string;
  counterpartName: string;
  bodyTail: string;
  whatOwed: string | null;
  openQuestion: string | null;
  priorEvents: { type: string; payload: unknown; created_at: string }[];
};

export interface LlmPort {
  classify(threadText: string): Promise<Classification>;
  draft(input: DraftInput): Promise<string>;
}

export type Deps = {
  sql: Sql;
  gmail: GmailPort;
  llm: LlmPort;
  myName: string;
  stallAfter: string; // Postgres interval, e.g. '5 days' or '20 minutes'
};

export type BoardRow = {
  id: string;
  thread_id: string;
  subject: string;
  counterpart: string;
  counterpart_name: string | null;
  what_owed: string | null;
  open_question: string | null;
  stakes_usd: string | number | null;
  state: string;
  last_msg_at: string;
  last_text: string | null;
  last_from_me: boolean;
  is_stalled: boolean;
  follow_up_id: string | null;
  follow_up_body: string | null;
  receipt: string | null;
};
