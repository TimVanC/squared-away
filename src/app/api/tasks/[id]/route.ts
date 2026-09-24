import { NextResponse } from "next/server";
import { HttpError, readJson, withUser } from "@/lib/api";
import { deleteTask, pushToTomorrow, setTimeOverride, updateTask, type TaskInput } from "@/lib/services/tasks";

type Ctx = { params: Promise<{ id: string }> };

function parseId(id: string) {
  const n = Number(id);
  if (!Number.isInteger(n)) throw new HttpError(400, "Bad id");
  return n;
}

export const PATCH = withUser(async (userId, req, ctx: Ctx) => {
  const id = parseId((await ctx.params).id);
  const body = await readJson<TaskInput & { action?: "push"; date?: string; overrideTime?: string | null }>(req);
  if (body.action === "push") {
    const result = await pushToTomorrow(userId, id, body.date ?? "");
    return NextResponse.json({ ok: true, ...result });
  }
  if (body.overrideTime !== undefined) {
    if (!body.date) throw new HttpError(400, "date is required for a time override");
    const time = await setTimeOverride(userId, id, body.date, body.overrideTime);
    return NextResponse.json({ ok: true, overrideTime: time });
  }
  const task = await updateTask(userId, id, body);
  return NextResponse.json({ task });
});

export const DELETE = withUser(async (userId, _req, ctx: Ctx) => {
  const id = parseId((await ctx.params).id);
  await deleteTask(userId, id);
  return NextResponse.json({ ok: true });
});
