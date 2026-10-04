# Owed: demo kit

## Submission

- **Title:** Owed, the assistant you CC that remembers what people owe you
- **One-liner:** CC Owed on any ask. When they go quiet, it drafts the follow-up, sends it for you on one click, and closes the loop when they reply.
- **Built with:** Neon Postgres (state and agent memory), Neon AI Gateway (every model call), assistant-ui (the whole interface), AgentMail (Owed's own inbox), CodeRabbit (reviews on the public repo).
- **Links:** live URL · public repo · demo video (3 minutes or less)

## Before recording

1. From `events@anything.ai`, send 5 emails with `owed-agent@agentmail.to` in **CC** (not BCC) to addresses you can reply from on your phone:
   - Deposit: "Hi Sam, I moved out on Sep 28. When can I expect the $1,800 deposit back?"
   - Refund: "Returned the jacket on Sep 20, order 4471. Could you confirm the $240 refund?"
   - Founder ask: "Sent the pilot proposal for $12k. Any questions before Friday?"
   - Noise: "Thanks for lunch yesterday, great to catch up."
   - Spare deposit-style ask, for the real take.
2. Do not reply. Wait 20 minutes (`STALL_AFTER=20 minutes`).
3. Safety cap: `SEND_BUDGET=20` limits how many emails Owed can send. One Send per take is all the video needs; redrafting is free.
4. Put the 3 counterpart addresses in `SEND_ALLOWLIST`.

## Video script (target 2:30, cap 3:00)

1. **0:00–0:15 Hook.** "You asked for your deposit back three weeks ago. Silence. Owed is the assistant you CC. It remembers what people owe you, and gets it back."
2. **0:15–0:40 Find.** Show one seed email with Owed in CC. In the app: "Sync my inbox", then "What am I owed?". Three cards, ranked by stakes: $12k proposal, $1,800 deposit, $240 refund. The thank-you note is not there. Say: "Demo clock: 5 days runs as 20 minutes."
3. **0:40–1:10 Draft.** Draft follow-up on the deposit card. Read it: it cites the move-out date and the amount, asks one question, and is signed "Owed, assistant to Joydip". Owed never read the inbox; it only saw what was CC'd.
4. **1:10–1:30 Send.** Click Send. The card shows the receipt id. Show the email arriving on the phone, from Owed, with you in CC.
5. **1:30–1:55 Reply flip.** Reply-all from the phone on camera. Within about 10 seconds the card flips to "They replied" with their text.
6. **1:55–2:15 Memory.** Open History on the card, then the `events` table in the Neon console: classified, flagged, drafted, sent, reply received. The drafter reads these before every draft.
7. **2:15–2:30 Close.** "Neon Postgres and AI Gateway, assistant-ui, AgentMail, and an open repo reviewed by CodeRabbit. The full product is Operator Brief."

Recording: screen and voiceover, 1080p. One rehearsal take, then the real one on the spare seed.

## Judge Q&A

1. **Does it read my inbox?** No. Owed only sees threads you CC it on. Want it to scan your own sent mail instead? `MAIL_PROVIDER=gmail` switches to the Gmail adapter; same five-function interface.
2. **Can it send something I didn't approve?** No. Every send is a click on a draft you can read first. Sending twice is refused, `SEND_ALLOWLIST` limits recipients, `SEND_BUDGET` caps volume, and the deployed app sits behind a password. Email text is treated as data in both prompts.
3. **What if they reply only to me, not to Owed?** Owed is a visible CC, so reply-all keeps it in the thread, and every reply to Owed's nudge goes to Owed. If they reply only to you, one click on Mark resolved closes it.
4. **Why not an agent framework?** Two model calls, classify and draft, through Neon AI Gateway. The stall detector is SQL, and the chat answers "What am I owed?" deterministically, so the demo cannot break on tool calling.
5. **Where's the memory?** An append-only `events` table in Neon. Every classify, flag, draft, send and reply is a row; the drafter reads the last 10 so it never repeats a nudge.
