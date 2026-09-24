import { NextResponse } from "next/server";
import { withUser } from "@/lib/api";
import { todayIn } from "@/lib/dates";
import { getDayView, getSettings } from "@/lib/services/day";

export const GET = withUser(async (userId, req) => {
  const url = new URL(req.url);
  let date = url.searchParams.get("date");
  if (!date) {
    const s = await getSettings(userId);
    date = todayIn(s.timezone);
  }
  const view = await getDayView(userId, date);
  return NextResponse.json(view);
});
