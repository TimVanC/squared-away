import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { extras, lists, skips, tasks, timeOverrides, type Task } from "@/db/schema";
import { HttpError } from "@/lib/api";
import { addDays, isValidDate, isValidTime, weekdayOf } from "@/lib/dates";

// Every function here takes the caller's userId and verifies ownership before
// reading or writing. Both the API routes and the AI tools go through this file.

export async function getOwnedTask(userId: number, taskId: number): Promise<Task> {
  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
    .limit(1);
  if (!task) throw new HttpError(404, "Task not found");
  return task;
}

export async function getOwnedList(userId: number, listId: number) {
  const [list] = await db
    .select()
    .from(lists)
    .where(and(eq(lists.id, listId), eq(lists.userId, userId)))
    .limit(1);
  if (!list) throw new HttpError(404, "List not found");
  return list;
}

export async function getDefaultListId(userId: number): Promise<number> {
  const rows = await db.select().from(lists).where(eq(lists.userId, userId)).orderBy(lists.sortOrder, lists.id).limit(1);
  if (rows.length === 0) {
    const [row] = await db.insert(lists).values({ userId, name: "Daily", sortOrder: 0 }).returning();
    return row.id;
  }
  return rows[0].id;
}

/** Does this task's repeat rule match the date (ignoring skips and extras)? */
export function ruleMatches(task: Task, date: string): boolean {
  const wd = weekdayOf(date);
  switch (task.repeatType) {
    case "daily":
      return true;
    case "weekdays":
      return task.repeatDays.includes(wd);
    case "range": {
      if (task.startDate && date < task.startDate) return false;
      if (task.endDate && date > task.endDate) return false;
      return task.repeatDays.length === 0 || task.repeatDays.includes(wd);
    }
    case "once":
      return task.onceDate === date;
  }
}

export type TaskInput = {
  title: string;
  note?: string;
  time?: string | null;
  listId?: number;
  repeatType?: Task["repeatType"];
  repeatDays?: number[];
  startDate?: string | null;
  endDate?: string | null;
  onceDate?: string | null;
  kind?: Task["kind"];
  waterOz?: number | null;
  logType?: Task["logType"];
  logUnit?: string | null;
  notify?: boolean;
};

function cleanTaskInput(input: TaskInput, existing?: Task) {
  const out: Partial<typeof tasks.$inferInsert> = {};
  if (input.title !== undefined) {
    const title = input.title.trim();
    if (!title) throw new HttpError(400, "Title is required");
    out.title = title.slice(0, 120);
  }
  if (input.note !== undefined) out.note = (input.note ?? "").trim().slice(0, 500);
  if (input.time !== undefined) {
    if (input.time === null || input.time === "") out.time = null;
    else if (isValidTime(input.time)) out.time = input.time;
    else throw new HttpError(400, "Time must be HH:MM");
  }
  if (input.repeatType !== undefined) {
    if (!["daily", "weekdays", "range", "once"].includes(input.repeatType)) throw new HttpError(400, "Bad repeat type");
    out.repeatType = input.repeatType;
  }
  if (input.repeatDays !== undefined) {
    const days = Array.from(new Set((input.repeatDays ?? []).map(Number))).filter((d) => d >= 0 && d <= 6);
    out.repeatDays = days.sort();
  }
  for (const key of ["startDate", "endDate", "onceDate"] as const) {
    const v = input[key];
    if (v === undefined) continue;
    if (v === null || v === "") out[key] = null;
    else if (isValidDate(v)) out[key] = v;
    else throw new HttpError(400, `${key} must be YYYY-MM-DD`);
  }
  if (input.kind !== undefined) {
    if (!["normal", "water"].includes(input.kind)) throw new HttpError(400, "Bad kind");
    out.kind = input.kind;
  }
  if (input.waterOz !== undefined) {
    out.waterOz = input.waterOz === null ? null : Math.max(0, Math.round(Number(input.waterOz) || 0));
  }
  if (input.logType !== undefined) {
    if (!["none", "actual_time", "number"].includes(input.logType)) throw new HttpError(400, "Bad log type");
    out.logType = input.logType;
  }
  if (input.logUnit !== undefined) out.logUnit = input.logUnit ? input.logUnit.trim().slice(0, 20) : null;
  if (input.notify !== undefined) out.notify = !!input.notify;

  // Consistency rules
  const repeatType = out.repeatType ?? existing?.repeatType ?? "daily";
  const repeatDays = out.repeatDays ?? existing?.repeatDays ?? [];
  if (repeatType === "weekdays" && repeatDays.length === 0) throw new HttpError(400, "Pick at least one weekday");
  if (repeatType === "once" && !(out.onceDate ?? existing?.onceDate)) throw new HttpError(400, "A one-day task needs a date");
  if (repeatType === "range" && !(out.startDate ?? existing?.startDate)) throw new HttpError(400, "A date range needs a start date");
  const kind = out.kind ?? existing?.kind ?? "normal";
  if (kind === "water" && !(out.waterOz ?? existing?.waterOz)) throw new HttpError(400, "A water checkpoint needs an ounce amount");
  return out;
}

export async function createTask(userId: number, input: TaskInput): Promise<Task> {
  const listId = input.listId ? (await getOwnedList(userId, input.listId)).id : await getDefaultListId(userId);
  const clean = cleanTaskInput({ repeatType: "daily", ...input });
  const [task] = await db
    .insert(tasks)
    .values({
      userId,
      listId,
      title: clean.title!,
      note: clean.note ?? "",
      time: clean.time ?? null,
      repeatType: clean.repeatType ?? "daily",
      repeatDays: clean.repeatDays ?? [],
      startDate: clean.startDate ?? null,
      endDate: clean.endDate ?? null,
      onceDate: clean.onceDate ?? null,
      kind: clean.kind ?? "normal",
      waterOz: clean.kind === "water" ? (clean.waterOz ?? null) : null,
      logType: clean.logType ?? "none",
      logUnit: clean.logUnit ?? null,
      notify: clean.notify ?? false,
    })
    .returning();
  return task;
}

export async function updateTask(userId: number, taskId: number, input: TaskInput): Promise<Task> {
  const existing = await getOwnedTask(userId, taskId);
  const clean = cleanTaskInput(input, existing);
  if (input.listId !== undefined) clean.listId = (await getOwnedList(userId, input.listId)).id;
  if ((clean.kind ?? existing.kind) !== "water") clean.waterOz = null;
  if (Object.keys(clean).length === 0) return existing;
  const [task] = await db.update(tasks).set(clean).where(and(eq(tasks.id, taskId), eq(tasks.userId, userId))).returning();
  return task;
}

export async function deleteTask(userId: number, taskId: number): Promise<Task> {
  const task = await getOwnedTask(userId, taskId);
  await db.delete(tasks).where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));
  return task;
}

/** Hide the task on `fromDate` and show it on the next day only. */
export async function pushToTomorrow(userId: number, taskId: number, fromDate: string) {
  if (!isValidDate(fromDate)) throw new HttpError(400, "Bad date");
  await getOwnedTask(userId, taskId);
  const tomorrow = addDays(fromDate, 1);
  await db.insert(skips).values({ taskId, date: fromDate }).onConflictDoNothing();
  await db.insert(extras).values({ taskId, date: tomorrow }).onConflictDoNothing();
  return { fromDate, toDate: tomorrow };
}

/** Undo a push: remove the skip and the extra. */
export async function unpushFromTomorrow(userId: number, taskId: number, fromDate: string) {
  await getOwnedTask(userId, taskId);
  const tomorrow = addDays(fromDate, 1);
  await db.delete(skips).where(and(eq(skips.taskId, taskId), eq(skips.date, fromDate)));
  await db.delete(extras).where(and(eq(extras.taskId, taskId), eq(extras.date, tomorrow)));
}

/** Retime a task on one date only. Pass null to clear the override. */
export async function setTimeOverride(userId: number, taskId: number, date: string, time: string | null) {
  if (!isValidDate(date)) throw new HttpError(400, "Bad date");
  await getOwnedTask(userId, taskId);
  if (time === null) {
    await db.delete(timeOverrides).where(and(eq(timeOverrides.taskId, taskId), eq(timeOverrides.date, date)));
    return null;
  }
  if (!isValidTime(time)) throw new HttpError(400, "Time must be HH:MM");
  await db
    .insert(timeOverrides)
    .values({ taskId, date, time })
    .onConflictDoUpdate({ target: [timeOverrides.taskId, timeOverrides.date], set: { time } });
  return time;
}

export async function getTimeOverride(userId: number, taskId: number, date: string): Promise<string | null> {
  await getOwnedTask(userId, taskId);
  const [row] = await db
    .select()
    .from(timeOverrides)
    .where(and(eq(timeOverrides.taskId, taskId), eq(timeOverrides.date, date)))
    .limit(1);
  return row?.time ?? null;
}

export type VisibleTask = Task & { effectiveTime: string | null; isExtra: boolean };

/**
 * All tasks visible on each date in [start, end], with time overrides applied.
 * Returns a map date -> tasks (sorted later by the caller).
 */
export async function getVisibleTasksForRange(userId: number, start: string, end: string): Promise<Map<string, VisibleTask[]>> {
  const allTasks = await db.select().from(tasks).where(eq(tasks.userId, userId)).orderBy(tasks.id);
  const ids = allTasks.map((t) => t.id);
  const result = new Map<string, VisibleTask[]>();
  if (ids.length === 0) return result;

  const [skipRows, extraRows, overrideRows] = await Promise.all([
    db.select().from(skips).where(inArray(skips.taskId, ids)),
    db.select().from(extras).where(inArray(extras.taskId, ids)),
    db.select().from(timeOverrides).where(inArray(timeOverrides.taskId, ids)),
  ]);
  const skipSet = new Set(skipRows.map((r) => `${r.taskId}|${r.date}`));
  const extraSet = new Set(extraRows.map((r) => `${r.taskId}|${r.date}`));
  const overrideMap = new Map(overrideRows.map((r) => [`${r.taskId}|${r.date}`, r.time]));

  let d = start;
  let guard = 0;
  while (d <= end && guard++ < 400) {
    const list: VisibleTask[] = [];
    for (const t of allTasks) {
      const key = `${t.id}|${d}`;
      if (skipSet.has(key)) continue;
      const isExtra = extraSet.has(key);
      if (!isExtra && !ruleMatches(t, d)) continue;
      list.push({ ...t, effectiveTime: overrideMap.get(key) ?? t.time, isExtra });
    }
    result.set(d, list);
    d = addDays(d, 1);
  }
  return result;
}

/** Recent distinct task titles for the tap-to-fill chips. */
export async function recentTitles(userId: number, limit = 12): Promise<string[]> {
  const rows = await db
    .select({ title: tasks.title })
    .from(tasks)
    .where(eq(tasks.userId, userId))
    .orderBy(desc(tasks.createdAt))
    .limit(60);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rows) {
    if (seen.has(r.title)) continue;
    seen.add(r.title);
    out.push(r.title);
    if (out.length >= limit) break;
  }
  return out;
}
