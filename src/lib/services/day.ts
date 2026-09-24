import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/db";
import {
  completions,
  dayTypes,
  lists,
  settings,
  tasks,
  waterEntries,
  type DayType,
  type List,
  type Settings,
  type Theme,
} from "@/db/schema";
import { HttpError } from "@/lib/api";
import { isValidDate, isValidTime } from "@/lib/dates";
import { sortDayTasks } from "@/lib/sort";
import { getOwnedTask, getVisibleTasksForRange } from "./tasks";

export const DEFAULT_THEME: Theme = {
  background: "#1F2B4D",
  headerText: "#F3F5FA",
  tile: "#FFD84D",
  tileText: "#1F2B4D",
  doneTile: "#4B6B5E",
  doneText: "#DFE7E2",
};

export const SHIFT_DAY_TYPES: DayType[] = ["close", "open", "prep"];

export async function getSettings(userId: number): Promise<Settings> {
  const [row] = await db.select().from(settings).where(eq(settings.userId, userId)).limit(1);
  if (row) return row;
  const [created] = await db.insert(settings).values({ userId }).onConflictDoNothing().returning();
  if (created) return created;
  const [again] = await db.select().from(settings).where(eq(settings.userId, userId)).limit(1);
  return again;
}

export async function getLists(userId: number): Promise<List[]> {
  return db.select().from(lists).where(eq(lists.userId, userId)).orderBy(asc(lists.sortOrder), asc(lists.id));
}

export async function getDayType(userId: number, date: string): Promise<DayType | null> {
  const [row] = await db
    .select()
    .from(dayTypes)
    .where(and(eq(dayTypes.userId, userId), eq(dayTypes.date, date)))
    .limit(1);
  return row?.type ?? null;
}

export async function getDayTypesInRange(userId: number, start: string, end: string): Promise<Record<string, DayType>> {
  const rows = await db
    .select()
    .from(dayTypes)
    .where(and(eq(dayTypes.userId, userId), gte(dayTypes.date, start), lte(dayTypes.date, end)));
  const out: Record<string, DayType> = {};
  for (const r of rows) out[r.date] = r.type;
  return out;
}

export async function setDayType(userId: number, date: string, type: DayType | null): Promise<DayType | null> {
  if (!isValidDate(date)) throw new HttpError(400, "Bad date");
  const previous = await getDayType(userId, date);
  if (type === null) {
    await db.delete(dayTypes).where(and(eq(dayTypes.userId, userId), eq(dayTypes.date, date)));
    return previous;
  }
  if (!["close", "open", "prep", "off"].includes(type)) throw new HttpError(400, "Bad day type");
  await db
    .insert(dayTypes)
    .values({ userId, date, type })
    .onConflictDoUpdate({ target: [dayTypes.userId, dayTypes.date], set: { type } });
  return previous;
}

export type CompletionInfo = {
  completedAt: string;
  actualTime: string | null;
  value: number | null;
  note: string | null;
};

export type DayTask = {
  id: number;
  listId: number;
  title: string;
  note: string;
  time: string | null; // effective time for this date
  baseTime: string | null; // the task's own time (before override)
  hasOverride: boolean;
  kind: "normal" | "water";
  waterOz: number | null;
  logType: "none" | "actual_time" | "number";
  logUnit: string | null;
  notify: boolean;
  followsWake: boolean;
  repeatType: "daily" | "weekdays" | "range" | "once";
  repeatDays: number[];
  startDate: string | null;
  endDate: string | null;
  onceDate: string | null;
  completion: CompletionInfo | null;
};

export type DayView = {
  date: string;
  dayType: DayType | null;
  tasks: DayTask[];
  lists: List[];
  theme: Theme;
  calorieTarget: number;
  proteinTarget: number;
  timezone: string;
  water: { total: number; goal: number; fromCheckpoints: number; fromEntries: number };
  doneCount: number;
  totalCount: number;
};

export async function getDayView(userId: number, date: string): Promise<DayView> {
  if (!isValidDate(date)) throw new HttpError(400, "Bad date");
  const [visibleMap, userSettings, userLists, dayType] = await Promise.all([
    getVisibleTasksForRange(userId, date, date),
    getSettings(userId),
    getLists(userId),
    getDayType(userId, date),
  ]);
  const visible = visibleMap.get(date) ?? [];
  const ids = visible.map((t) => t.id);

  const [completionRows, entryRows] = await Promise.all([
    ids.length ? db.select().from(completions).where(and(inArray(completions.taskId, ids), eq(completions.date, date))) : [],
    db.select().from(waterEntries).where(and(eq(waterEntries.userId, userId), eq(waterEntries.date, date))),
  ]);
  const completionMap = new Map(completionRows.map((c) => [c.taskId, c]));

  const dayTasks: DayTask[] = visible.map((t) => {
    const c = completionMap.get(t.id);
    return {
      id: t.id,
      listId: t.listId,
      title: t.title,
      note: t.note,
      time: t.effectiveTime,
      baseTime: t.time,
      hasOverride: t.effectiveTime !== t.time,
      kind: t.kind,
      waterOz: t.waterOz,
      logType: t.logType,
      logUnit: t.logUnit,
      notify: t.notify,
      followsWake: t.followsWake,
      repeatType: t.repeatType,
      repeatDays: t.repeatDays,
      startDate: t.startDate,
      endDate: t.endDate,
      onceDate: t.onceDate,
      completion: c
        ? {
            completedAt: c.completedAt.toISOString(),
            actualTime: c.actualTime,
            value: c.value === null ? null : Number(c.value),
            note: c.note,
          }
        : null,
    };
  });

  const fromCheckpoints = dayTasks.filter((t) => t.kind === "water" && t.completion).reduce((s, t) => s + (t.waterOz ?? 0), 0);
  const fromEntries = entryRows.reduce((s, e) => s + e.oz, 0);
  const goal = dayType && SHIFT_DAY_TYPES.includes(dayType) ? userSettings.waterGoalShiftOz : userSettings.waterGoalOz;

  const sorted = sortDayTasks(dayTasks);
  return {
    date,
    dayType,
    tasks: sorted,
    lists: userLists,
    theme: { ...DEFAULT_THEME, ...(userSettings.theme ?? {}) },
    calorieTarget: userSettings.calorieTarget,
    proteinTarget: userSettings.proteinTarget,
    timezone: userSettings.timezone,
    water: { total: fromCheckpoints + fromEntries, goal, fromCheckpoints, fromEntries },
    doneCount: sorted.filter((t) => t.completion).length,
    totalCount: sorted.length,
  };
}

export type CompleteInput = {
  actualTime?: string | null;
  value?: number | null;
  note?: string | null;
};

/** Mark a task done on a date (upsert). */
export async function completeTask(userId: number, taskId: number, date: string, input: CompleteInput = {}) {
  if (!isValidDate(date)) throw new HttpError(400, "Bad date");
  await getOwnedTask(userId, taskId);
  const fields = cleanLog(input);
  const [row] = await db
    .insert(completions)
    .values({ taskId, date, completedAt: new Date(), ...fields })
    .onConflictDoUpdate({
      target: [completions.taskId, completions.date],
      set: Object.keys(fields).length ? fields : { taskId },
    })
    .returning();
  return row;
}

/** Undo a completion. */
export async function uncompleteTask(userId: number, taskId: number, date: string) {
  if (!isValidDate(date)) throw new HttpError(400, "Bad date");
  await getOwnedTask(userId, taskId);
  await db.delete(completions).where(and(eq(completions.taskId, taskId), eq(completions.date, date)));
}

/** Update the log fields of an existing completion. */
export async function updateLog(userId: number, taskId: number, date: string, input: CompleteInput) {
  if (!isValidDate(date)) throw new HttpError(400, "Bad date");
  await getOwnedTask(userId, taskId);
  const fields = cleanLog(input);
  if (Object.keys(fields).length === 0) return;
  const rows = await db
    .update(completions)
    .set(fields)
    .where(and(eq(completions.taskId, taskId), eq(completions.date, date)))
    .returning();
  if (rows.length === 0) throw new HttpError(404, "Not completed on that date");
  return rows[0];
}

function cleanLog(input: CompleteInput) {
  const fields: { actualTime?: string | null; value?: string | null; note?: string | null } = {};
  if (input.actualTime !== undefined) {
    if (input.actualTime === null || input.actualTime === "") fields.actualTime = null;
    else if (isValidTime(input.actualTime)) fields.actualTime = input.actualTime;
    else throw new HttpError(400, "Actual time must be HH:MM");
  }
  if (input.value !== undefined) {
    if (input.value === null || (typeof input.value === "string" && input.value === "")) fields.value = null;
    else {
      const n = Number(input.value);
      if (!Number.isFinite(n)) throw new HttpError(400, "Value must be a number");
      fields.value = String(n);
    }
  }
  if (input.note !== undefined) fields.note = input.note ? String(input.note).trim().slice(0, 1000) : null;
  return fields;
}

export async function addWaterEntry(userId: number, date: string, oz: number) {
  if (!isValidDate(date)) throw new HttpError(400, "Bad date");
  const n = Math.round(Number(oz));
  if (!Number.isFinite(n) || n === 0 || Math.abs(n) > 200) throw new HttpError(400, "Ounces must be between -200 and 200");
  const [row] = await db.insert(waterEntries).values({ userId, date, oz: n }).returning();
  return row;
}

export async function deleteWaterEntry(userId: number, entryId: number) {
  await db.delete(waterEntries).where(and(eq(waterEntries.id, entryId), eq(waterEntries.userId, userId)));
}

/** Completion logs for a date range, optionally one task. Used by the AI and CSV export. */
export async function getLogs(userId: number, start: string, end: string, taskId?: number) {
  if (!isValidDate(start) || !isValidDate(end)) throw new HttpError(400, "Bad date range");
  const conds = [eq(tasks.userId, userId), gte(completions.date, start), lte(completions.date, end)];
  if (taskId !== undefined) conds.push(eq(completions.taskId, taskId));
  const rows = await db
    .select({
      taskId: completions.taskId,
      title: tasks.title,
      kind: tasks.kind,
      waterOz: tasks.waterOz,
      logType: tasks.logType,
      logUnit: tasks.logUnit,
      plannedTime: tasks.time,
      date: completions.date,
      completedAt: completions.completedAt,
      actualTime: completions.actualTime,
      value: completions.value,
      note: completions.note,
    })
    .from(completions)
    .innerJoin(tasks, eq(tasks.id, completions.taskId))
    .where(and(...conds))
    .orderBy(asc(completions.date), asc(completions.completedAt));
  return rows.map((r) => ({ ...r, value: r.value === null ? null : Number(r.value), completedAt: r.completedAt.toISOString() }));
}
