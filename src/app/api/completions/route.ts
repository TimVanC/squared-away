import { NextResponse } from "next/server";
import { readJson, withUser } from "@/lib/api";
import { completeTask, uncompleteTask, updateLog } from "@/lib/services/day";

type Body = {
  taskId: number;
  date: string;
  done?: boolean;
  actualTime?: string | null;
  value?: number | null;
  note?: string | null;
};

/** Toggle completion. done=true completes (with optional log), done=false undoes. */
export const POST = withUser(async (userId, req) => {
  const body = await readJson<Body>(req);
  const taskId = Number(body.taskId);
  if (body.done === false) {
    await uncompleteTask(userId, taskId, body.date);
    return NextResponse.json({ ok: true, done: false });
  }
  const row = await completeTask(userId, taskId, body.date, {
    actualTime: body.actualTime,
    value: body.value,
    note: body.note,
  });
  return NextResponse.json({ ok: true, done: true, completion: row });
});

/** Update the log on an existing completion. */
export const PATCH = withUser(async (userId, req) => {
  const body = await readJson<Body>(req);
  const row = await updateLog(userId, Number(body.taskId), body.date, {
    actualTime: body.actualTime,
    value: body.value,
    note: body.note,
  });
  return NextResponse.json({ ok: true, completion: row });
});
