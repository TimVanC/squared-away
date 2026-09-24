import { NextResponse } from "next/server";
import { readJson, withUser } from "@/lib/api";
import { getDayTypesInRange } from "@/lib/services/day";
import { setDayTypeAndRetime } from "@/lib/services/daytype";
import type { DayType } from "@/db/schema";

export const GET = withUser(async (userId, req) => {
  const url = new URL(req.url);
  const start = url.searchParams.get("start") ?? "";
  const end = url.searchParams.get("end") ?? start;
  return NextResponse.json({ dayTypes: await getDayTypesInRange(userId, start, end) });
});

export const PATCH = withUser(async (userId, req) => {
  const body = await readJson<{ date: string; type: DayType | null }>(req);
  const result = await setDayTypeAndRetime(userId, body.date, body.type);
  return NextResponse.json({ ok: true, ...result });
});
