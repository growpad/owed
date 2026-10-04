import { getDeps } from "@/lib/deps";
import { draft } from "@/lib/owed";
import { body, handle, uuid } from "@/lib/route";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const POST = (req: Request) =>
  handle(async () => {
    const { loopId } = await body(req);
    return draft(await getDeps(), uuid(loopId, "loopId"));
  });
