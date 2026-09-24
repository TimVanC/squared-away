import { NextResponse } from "next/server";
import { readJson, withUser } from "@/lib/api";
import { createTask, recentTitles, type TaskInput } from "@/lib/services/tasks";

export const POST = withUser(async (userId, req) => {
  const body = await readJson<TaskInput>(req);
  const task = await createTask(userId, body);
  return NextResponse.json({ task });
});

/** Recent titles for the tap-to-fill chips. */
export const GET = withUser(async (userId) => {
  return NextResponse.json({ titles: await recentTitles(userId) });
});
