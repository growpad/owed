import { getDeps } from "@/lib/deps";
import { events } from "@/lib/owed";
import { handle } from "@/lib/route";
export const dynamic = "force-dynamic";
export const GET = (req: Request) =>
  handle(async () => {
    const loopId = new URL(req.url).searchParams.get("loopId") ?? "";
    return { events: await events(await getDeps(), loopId) };
  });
