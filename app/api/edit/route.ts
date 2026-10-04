import { getDeps } from "@/lib/deps";
import { editDraft, HttpError } from "@/lib/owed";
import { body, handle, uuid } from "@/lib/route";
export const dynamic = "force-dynamic";
export const POST = (req: Request) =>
  handle(async () => {
    const { followUpId, text } = await body(req);
    if (typeof text !== "string") throw new HttpError(400, "text must be a string");
    return editDraft(await getDeps(), uuid(followUpId, "followUpId"), text);
  });
