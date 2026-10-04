-- Owed schema. Run once against Neon: `npm run db:schema`.

create table if not exists threads (
  id               text primary key,          -- Gmail threadId
  subject          text not null,
  counterpart      text not null,             -- the other person's email
  counterpart_name text,
  last_msg_id      text not null,             -- RFC 822 Message-ID of the last non-draft message
  last_from_me     boolean not null,
  last_msg_at      timestamptz not null,
  last_text        text,                      -- text of the last non-draft message, trimmed
  body_tail        text,                      -- last 2-3 messages, plain text
  synced_at        timestamptz not null default now()
);

create table if not exists loops (
  id            uuid primary key default gen_random_uuid(),
  thread_id     text not null unique references threads(id) on delete cascade,
  what_owed     text,
  open_question text,
  stakes_usd    numeric,
  state         text not null default 'open', -- open|drafted|sent|replied|resolved|dismissed
  updated_at    timestamptz not null default now()
);

create table if not exists follow_ups (
  id               uuid primary key default gen_random_uuid(),
  loop_id          uuid not null references loops(id) on delete cascade,
  body             text not null,
  gmail_draft_id   text,
  gmail_message_id text,                      -- receipt after send
  status           text not null default 'draft', -- draft|sending|sent|discarded
  created_at       timestamptz not null default now(),
  sent_at          timestamptz
);

create table if not exists events (
  id         bigserial primary key,
  loop_id    uuid references loops(id) on delete cascade,
  type       text not null,                   -- classified|flagged|drafted|edited|sent|reply_received|resolved|dismissed
  payload    jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists events_loop_idx on events (loop_id, created_at desc);
