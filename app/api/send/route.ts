import { getDeps } from "@/lib/deps";
import { send } from "@/lib/owed";
import { handle } from "@/lib/route";
export const dynamic = "force-dynamic";
// Called only from the Send button. There is no other send path.
export const POST = (req: Request) =>
  handle(async () => {
    const { followUpId } = await req.json();
    return send(await getDeps(), String(followUpId));
  });
