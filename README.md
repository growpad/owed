# Owed

**The agent that remembers what people owe you, and gets it back.**

Owed is the assistant you CC. Ask anyone for anything (a deposit, a refund, an answer on a proposal) and CC Owed's inbox. Owed never reads your mailbox. When they go quiet, it drafts the follow-up in the thread, sends it on your behalf with you in CC only when you click, and flips the card to "They replied" when the other person answers.

CC, not BCC: a BCC'd address is dropped from replies, so Owed would never hear back.

Prefer it to read your own mail instead? `MAIL_PROVIDER=gmail` switches to a Gmail adapter (sent mail, drafts in your own thread).

Built at the Build Personal Agents Hack, Oct 4 2026, on **Neon** (Postgres + AI Gateway), **assistant-ui** and **AgentMail**.

## How it works

```
Gmail (sent mail) ──> /api/sync ──> Neon Postgres: threads, loops, follow_ups, events
                         │                ▲
                         └─ classify ─────┤  Neon AI Gateway (gpt-5-mini)
assistant-ui chat ──> /api/board          │
   "What am I owed?"   /api/draft ── draft ┘ ──> Gmail draft inside the thread
                       /api/send  ──> drafts.send (only on click; message id = receipt)
   browser every 10s ─> /api/poll ──> reply detected ──> card flips, event logged
```

- **Stall detector is SQL**, not an LLM: you sent the last message, and it is older than `STALL_AFTER`.
- **Drafts never reset the clock:** Gmail stores drafts as `DRAFT`-labelled messages in the thread; sync skips them.
- **Memory:** every classify, draft, send and reply is a row in `events`; the drafter reads the last 10 before writing.
- **Safety:** nothing sends without a click; email text is treated as data in both prompts.
- **The chat is deterministic:** "What am I owed?" calls the board directly and renders live cards as an assistant-ui tool UI. The model is used where it adds value: classifying threads and writing drafts.

## Setup (about 15 minutes)

1. **Neon:** create a project in AWS us-east-2 at [console.neon.tech](https://console.neon.tech). Copy `DATABASE_URL`, and create an AI Gateway credential for `NEON_AI_GATEWAY_BASE_URL` + `NEON_AI_GATEWAY_TOKEN` ([docs](https://neon.com/docs/ai-gateway/get-started)).
2. **AgentMail:** at [console.agentmail.to](https://console.agentmail.to) create an inbox and an API key; set `AGENTMAIL_INBOX`, `AGENTMAIL_API_KEY`, `OWNER_EMAILS`. (Gmail instead: see step 2b.)
   2b. **Google (only for `MAIL_PROVIDER=gmail`):** at [console.cloud.google.com](https://console.cloud.google.com), enable the Gmail API, then in Google Auth Platform create an OAuth client of type **Desktop app**. Audience: Testing, add the demo Gmail as a test user. Scopes: `gmail.readonly`, `gmail.compose`.
3. `cp .env.example .env` and fill it in.
4. ```bash
   npm install
   npm run db:schema   # creates the 4 tables
   npm run token       # gmail only: sign in, paste GOOGLE_REFRESH_TOKEN into .env
   npm run dev         # http://localhost:3000
   ```
5. **Deploy:** import the repo on [vercel.com/new](https://vercel.com/new) and add the same env vars.

No gateway access? Set `LLM_BASE_URL=https://api.openai.com/v1` and `LLM_API_KEY` instead.

## Demo recipe

1. From your own email, send 3 asks that need an answer (deposit, refund, proposal) and one thank-you note, each with Owed's inbox in **CC**. Do not reply yet.
2. Set `STALL_AFTER=20 minutes` (the UI shows a "Demo clock" label; real use is `5 days`).
3. After 20 minutes: "Sync my inbox", then "What am I owed?". Draft, Send (Owed sends it with you in CC), then reply-all from the other account. The card flips within about 10 seconds.

## Fake mode (UI work only)

`OWED_FAKE=1 npm run dev` runs with in-memory Postgres (PGlite), a fake Gmail with seeded threads and a fake LLM. The UI shows a **FAKE MODE** banner and a "Simulate their reply" button. Do not record a submission in fake mode.

## Demo kit

Submission text, video script and judge Q&A: [DEMO.md](DEMO.md).

## Tests

```bash
npm test   # end-to-end flow on in-memory Postgres + fake Gmail/LLM (15 tests)
```

## Files

| Path | What |
|---|---|
| `lib/owed.ts` | sync, board, draft, send, poll: the whole flow |
| `lib/mail.ts` | thread summary (skips drafts), RFC 822 in-thread reply |
| `lib/agentmail.ts` | AgentMail adapter: Owed's own inbox, CC model |
| `lib/gmail.ts` | Gmail adapter (refresh token, one demo account) |
| `lib/llm.ts` | prompts + OpenAI-compatible call to Neon AI Gateway |
| `lib/fake.ts` | PGlite, fake Gmail, fake LLM for tests and fake mode |
| `app/page.tsx` | assistant-ui chat; live board with 10 s polling |
| `components/LoopCard.tsx` | card: draft, send, reply, history |
| `schema.sql` | threads, loops, follow_ups, events |

The full product is [Operator Brief](https://operatorbrief.xyz). MIT licensed.
