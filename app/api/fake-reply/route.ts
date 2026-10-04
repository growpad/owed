import { getFakeDeps, isFake } from "@/lib/deps";
import { HttpError } from "@/lib/owed";
import { handle } from "@/lib/route";
export const dynamic = "force-dynamic";
// Fake mode only: simulates the other person replying.
export const POST = (req: Request) =>
  handle(async () => {
    if (!isFake()) throw new HttpError(404, "only in OWED_FAKE=1");
    const { threadId } = await req.json();
    (await getFakeDeps()).fakeGmail.reply(String(threadId), "Sorry for the delay! Sending it today.");
    return { ok: true };
  });
