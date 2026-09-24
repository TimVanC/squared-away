import { NextResponse } from "next/server";
import { withUser } from "@/lib/api";
import { clearThread, loadThread } from "@/lib/ai/chat";

export const GET = withUser(async (userId) => {
  return NextResponse.json({ messages: await loadThread(userId) });
});

export const DELETE = withUser(async (userId) => {
  await clearThread(userId);
  return NextResponse.json({ ok: true });
});
