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

- **You stay in charge of every card:** edit the draft before it goes (the mailbox draft is updated, so Send sends exactly what you see), mark a card resolved any time, or mark it "Not owed" if the model got it wrong.
- **Stall detector is SQL**, not an LLM: you sent the last message, and it is older than `STALL_AFTER`.
- **Drafts never reset the clock:** Gmail stores drafts as `DRAFT`-labelled messages in the thread; sync skips them.
- **Memory:** every classify, draft, send and reply is a row in `events`; the drafter reads the last 10 before writing.
- **Reply detection:** a card flips when any real message from them is newer than your ask or Owed's last nudge, so it still flips if you answer "thanks" after them. Bounces and auto-replies don't count.
- **Safety:** nothing sends without a click, and a click sends once. Send re-reads the thread first and refuses if they already replied. A timed-out send is held, not released, and retrying it is safe: providers delete a draft once it is sent, so a retry either sends it or records that it already went. Optional `SEND_ALLOWLIST` and `SEND_BUDGET`. Email text is treated as data in both prompts. Bounces and auto-replies (RFC 3834) never count as a reply.
- **Deploy safely:** set `APP_PASSWORD` and the whole app sits behind HTTP Basic Auth, since its API can send email.
- **Resilience:** every outbound call has a timeout; AgentMail `429`s are retried with `Retry-After`.
- **The chat is deterministic:** "What am I owed?" calls the board directly and renders live cards as an assistant-ui tool UI. The model is used where it adds value: classifying threads and writing drafts.

## Setup (about 15 minutes)

1. **Neon:** create a project in AWS us-east-2 at [console.neon.tech](https://console.neon.tech). Copy `DATABASE_URL`, and create an AI Gateway credential for `NEON_AI_GATEWAY_BASE_URL` + `NEON_AI_GATEWAY_TOKEN` ([docs](https://neon.com/docs/ai-gateway/get-started)).
2. **AgentMail:** at [console.agentmail.to](https://console.agentmail.to) create an inbox and an API key; set `AGENTMAIL_INBOX`, `AGENTMAIL_API_KEY`, `OWNER_EMAILS`. (Gmail instead: see step 2b.)
   2b. **Google (only for `MAIL_PROVIDER=gmail`):** at [console.cloud.google.com](https://console.cloud.google.com), enable the Gmail API, then in Google Auth Platform create an OAuth client of type **Desktop app**. Audience: Testing, add the demo Gmail as a test user. Scopes: `gmail.readonly`, `gmail.compose`.
3. `cp .env.example .env` and fill it in.
4. ```bash
   npm install
   npm run db:schema   # creates the 4 tables, and upgrades older ones in place
   npm run token       # gmail only: sign in, paste GOOGLE_REFRESH_TOKEN into .env
   npm run dev         # http://localhost:3000
   ```
5. **Deploy:** on [vercel.com/new](https://vercel.com/new), import the repo, open *Environment Variables*, and paste your whole `.env` in one go (the same file you run locally). `vercel.json` sets the framework, `npm ci`, and the `cle1` region next to Neon's us-east-2. Deploy. The app asks for `APP_PASSWORD` (any username).

No gateway access? Set `LLM_BASE_URL=https://api.openai.com/v1` and `LLM_API_KEY` instead.

## Demo recipe

1. From your own email, send 3 asks that need an answer (deposit, refund, proposal) and one thank-you note, each with Owed's inbox in **CC**. Do not reply yet.
2. Set `STALL_AFTER=20 minutes` (the UI shows a "Demo clock" label; real use is `5 days`).
3. After 20 minutes, ask "What am I owed?" (new CC'd asks are picked up every minute; "Check my mail" does it now). Draft, edit if you like, Send (Owed sends it with you in CC), then reply-all from the other account. The card flips within about 10 seconds.

## Demo kit

Submission text, video script and judge Q&A: [DEMO.md](DEMO.md).

## Tests

```bash
npm test   # end-to-end flow on in-memory Postgres (PGlite, real schema) with test doubles for mail and LLM (33 tests)
```

## Files

| Path | What |
|---|---|
| `lib/owed.ts` | sync, board, draft, send, poll: the whole flow |
| `lib/mail.ts` | thread summary (skips drafts), RFC 822 in-thread reply |
| `lib/agentmail.ts` | AgentMail adapter: Owed's own inbox, CC model |
| `lib/gmail.ts` | Gmail adapter (refresh token, one demo account) |
| `lib/llm.ts` | prompts + OpenAI-compatible call to Neon AI Gateway |
| `app/page.tsx` | assistant-ui chat; live board with 10 s polling |
| `components/LoopCard.tsx` | card: draft, send, reply, history |
| `middleware.ts` | password gate (`APP_PASSWORD`) for deploys |
| `tests/` | end-to-end tests; `doubles.ts` holds the in-memory mailbox, scripted LLM and PGlite |
| `schema.sql` | threads, loops, follow_ups, events |

The full product is [Operator Brief](https://operatorbrief.xyz). MIT licensed.
