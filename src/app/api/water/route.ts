import { NextResponse } from "next/server";
import { readJson, withUser } from "@/lib/api";
import { addWaterEntry } from "@/lib/services/day";

/** Manual tap on the meter: { date, oz } (negative oz removes). */
export const POST = withUser(async (userId, req) => {
  const body = await readJson<{ date: string; oz: number }>(req);
  const row = await addWaterEntry(userId, body.date, Number(body.oz));
  return NextResponse.json({ entry: row });
});
