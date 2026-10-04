# Owed

**The agent that remembers what people owe you, and gets it back.**

Owed reads your sent Gmail, finds every thread where you spoke last and got silence (a deposit, a refund, an answer on a proposal), drafts the follow-up inside the original thread, sends it only when you click, and flips the card to "They replied" when the other person answers.

Built at the Build Personal Agents Hack, Oct 4 2026, on **Neon** (Postgres + AI Gateway) and **assistant-ui**.

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
2. **Google:** at [console.cloud.google.com](https://console.cloud.google.com), enable the Gmail API, then in Google Auth Platform create an OAuth client of type **Desktop app**. Audience: Testing, add the demo Gmail as a test user. Scopes: `gmail.readonly`, `gmail.compose`.
3. `cp .env.example .env` and fill it in.
4. ```bash
   npm install
   npm run db:schema   # creates the 4 tables
   npm run token       # sign in as the demo Gmail, paste GOOGLE_REFRESH_TOKEN into .env
   npm run dev         # http://localhost:3000
   ```
5. **Deploy:** import the repo on [vercel.com/new](https://vercel.com/new) and add the same env vars.

No gateway access? Set `LLM_BASE_URL=https://api.openai.com/v1` and `LLM_API_KEY` instead.

## Demo recipe

1. From the demo Gmail, send 3 asks that need an answer (deposit, refund, proposal) and one thank-you note. Do not reply yet.
2. Set `STALL_AFTER=20 minutes` (the UI shows a "Demo clock" label; real use is `5 days`).
3. After 20 minutes: "Sync my inbox", then "What am I owed?". Draft, Send, then reply from the other account. The card flips within about 10 seconds.

## Fake mode (UI work only)

`OWED_FAKE=1 npm run dev` runs with in-memory Postgres (PGlite), a fake Gmail with seeded threads and a fake LLM. The UI shows a **FAKE MODE** banner and a "Simulate their reply" button. Do not record a submission in fake mode.

## Tests

```bash
npm test   # end-to-end flow on in-memory Postgres + fake Gmail/LLM (10 tests)
```

## Files

| Path | What |
|---|---|
| `lib/owed.ts` | sync, board, draft, send, poll: the whole flow |
| `lib/mail.ts` | thread summary (skips drafts), RFC 822 in-thread reply |
| `lib/gmail.ts` | Gmail adapter (refresh token, one demo account) |
| `lib/llm.ts` | prompts + OpenAI-compatible call to Neon AI Gateway |
| `lib/fake.ts` | PGlite, fake Gmail, fake LLM for tests and fake mode |
| `app/page.tsx` | assistant-ui chat; live board with 10 s polling |
| `components/LoopCard.tsx` | card: draft, send, reply, history |
| `schema.sql` | threads, loops, follow_ups, events |

The full product is [Operator Brief](https://operatorbrief.xyz). MIT licensed.
