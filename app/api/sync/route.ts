import { getDeps } from "@/lib/deps";
import { sync } from "@/lib/owed";
import { handle } from "@/lib/route";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const POST = () => handle(async () => sync(await getDeps()));
