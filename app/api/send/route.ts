import { getDeps } from "@/lib/deps";
import { send } from "@/lib/owed";
import { body, handle, uuid } from "@/lib/route";
export const dynamic = "force-dynamic";
// Called only from the Send button. There is no other send path.
export const POST = (req: Request) =>
  handle(async () => {
    const { followUpId } = await body(req);
    return send(await getDeps(), uuid(followUpId, "followUpId"));
  });
