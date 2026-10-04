import { getDeps } from "@/lib/deps";
import { setState, HttpError } from "@/lib/owed";
import { body, handle, uuid } from "@/lib/route";
export const dynamic = "force-dynamic";
export const POST = (req: Request) =>
  handle(async () => {
    const { loopId, state } = await body(req);
    if (state !== "resolved" && state !== "dismissed") throw new HttpError(400, "state must be resolved or dismissed");
    await setState(await getDeps(), uuid(loopId, "loopId"), state);
    return { ok: true };
  });
