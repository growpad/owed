import { getDeps } from "@/lib/deps";
import { draft } from "@/lib/owed";
import { handle } from "@/lib/route";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const POST = (req: Request) =>
  handle(async () => {
    const { loopId } = await req.json();
    return draft(await getDeps(), String(loopId));
  });
