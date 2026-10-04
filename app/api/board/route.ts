import { ccAddress, getDeps } from "@/lib/deps";
import { board } from "@/lib/owed";
import { handle } from "@/lib/route";
export const dynamic = "force-dynamic";
export const GET = () =>
  handle(async () => {
    const deps = await getDeps();
    return { stallAfter: deps.stallAfter, ccAddress: ccAddress(), now: new Date().toISOString(), loops: await board(deps) };
  });
