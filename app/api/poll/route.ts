import { getDeps } from "@/lib/deps";
import { poll } from "@/lib/owed";
import { handle } from "@/lib/route";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export const POST = () => handle(async () => poll(await getDeps()));
