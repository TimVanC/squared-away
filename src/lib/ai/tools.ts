import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { addDays, dateRange, formatDateShort, formatTime12, isValidDate } from "@/lib/dates";
import { sortDayTasks } from "@/lib/sort";
import { HttpError } from "@/lib/api";
import {
  createTask,
  deleteTask,
  getOwnedTask,
  getTimeOverride,
  getVisibleTasksForRange,
  setTimeOverride,
  updateTask,
  type TaskInput,
} from "@/lib/services/tasks";
import { completeTask, getDayTypesInRange, getLists, getLogs, uncompleteTask } from "@/lib/services/day";
import { setDayTypeAndRetime } from "@/lib/services/daytype";
import { createList, findListByName } from "@/lib/services/lists";
import { db } from "@/db";
import { completions, type Task } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";

// ---------- Schemas ----------

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const timeStr = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "HH:MM 24h");

const repeatSchema = z
  .object({
    type: z.enum(["daily", "weekdays", "range", "once"]).describe("daily = every day; weekdays = certain days each week; range = between two dates (optionally only certain weekdays); once = a single date"),
    days: z.array(z.number().int().min(0).max(6)).optional().describe("Weekdays 0=Sunday .. 6=Saturday. Required for weekdays, optional for range."),
    start_date: dateStr.optional().describe("Required for range"),
    end_date: dateStr.optional().describe("Optional for range (open-ended if omitted)"),
    date: dateStr.optional().describe("Required for once"),
  })
  .describe("How the task repeats");

export const toolSchemas = {
  list_tasks: z.object({
    start_date: dateStr,
    end_date: dateStr.describe("Inclusive. At most 31 days after start_date."),
  }),
  create_task: z.object({
    title: z.string().min(1).max(120),
    time: timeStr.nullable().optional().describe("HH:MM 24h, or null for Anytime"),
    note: z.string().max(500).optional().describe("Short note shown on the tile"),
    list: z.string().optional().describe("List name, e.g. Daily, Fitness, Work. Created if it does not exist. Defaults to the first list."),
    repeat: repeatSchema.optional().describe("Defaults to daily if omitted. Always pass it explicitly."),
    kind: z.enum(["normal", "water"]).optional().describe("water = a water checkpoint tile that adds water_oz to the meter when completed"),
    water_oz: z.number().int().min(1).max(200).optional().describe("Ounces for a water checkpoint"),
    log_type: z.enum(["none", "actual_time", "number"]).optional(),
    log_unit: z.string().max(20).optional().describe("Unit for number logs, e.g. lbs, miles"),
    notify: z.boolean().optional().describe("Send a push notification at the task time"),
    follows_wake: z.boolean().optional().describe("Default true: the task moves with the day type schedule (morning tasks follow the previous night, evening tasks follow that night). Set false for fixed-time things like a weekly weigh-in."),
  }),
  update_task: z.object({
    id: z.number().int(),
    title: z.string().min(1).max(120).optional(),
    time: timeStr.nullable().optional().describe("Changes the task's default time on every day it shows. Use set_time_override to change one date only."),
    note: z.string().max(500).optional(),
    list: z.string().optional(),
    repeat: repeatSchema.optional(),
    kind: z.enum(["normal", "water"]).optional(),
    water_oz: z.number().int().min(1).max(200).nullable().optional(),
    log_type: z.enum(["none", "actual_time", "number"]).optional(),
    log_unit: z.string().max(20).nullable().optional(),
    notify: z.boolean().optional(),
    follows_wake: z.boolean().optional(),
  }),
  delete_task: z.object({ id: z.number().int() }),
  set_time_override: z.object({
    date: dateStr,
    task_id: z.number().int(),
    time: timeStr.nullable().describe("New time for that date only, or null to remove the override"),
  }),
  set_day_type: z.object({
    date: dateStr,
    type: z.enum(["close", "open", "prep", "off"]).nullable().describe("null clears the day type"),
  }),
  complete_task: z.object({
    date: dateStr,
    task_id: z.number().int(),
    actual_time: timeStr.optional(),
    value: z.number().optional(),
    note: z.string().max(1000).optional(),
    done: z.boolean().optional().describe("false to undo a completion. Defaults to true."),
  }),
  get_logs: z.object({
    start_date: dateStr,
    end_date: dateStr,
    task_id: z.number().int().optional(),
  }),
};

export type ToolName = keyof typeof toolSchemas;

const descriptions: Record<ToolName, string> = {
  list_tasks:
    "List the tasks that show on each date in a range, with ids, effective times (after overrides), list names, kind, and whether they are done. Call this before editing so you use real task ids.",
  create_task: "Create a task. Use repeat once + date for a one-off like a shift. Use kind water + water_oz for water checkpoints.",
  update_task: "Change a task's fields for every day it repeats. To retime a single date use set_time_override instead.",
  delete_task: "Delete a task and all of its history. Prefer update_task or set_time_override when possible.",
  set_time_override: "Retime a repeating task on one date only, e.g. Wake up at 10:00 on a close-shift day. Pass null to remove the override.",
  set_day_type:
    "Set the day type (close, open, prep, off) for a date. The app then retimes routine tasks automatically: that evening (fiber, lights out, evening water) from the day type's bed time, and the NEXT morning (wake, shakes, meals, daytime water) from its wake time. Shifts and one-off tasks do not move. Shift days raise the water goal. Only use set_time_override afterwards for exceptions.",
  complete_task: "Mark a task done on a date, optionally with a logged actual time, a number value, or a note. done=false undoes.",
  get_logs: "Read completion logs (completed_at, actual time, value, note) for a date range, optionally one task. Use for questions about trends like wake time or weight.",
};

/** Tool definitions for the Messages API, generated from the zod schemas. */
export function toolDefinitions(): Anthropic.Tool[] {
  return (Object.keys(toolSchemas) as ToolName[]).map((name) => {
    const json = z.toJSONSchema(toolSchemas[name], { target: "draft-7" }) as Record<string, unknown>;
    delete json.$schema;
    return {
      name,
      description: descriptions[name],
      input_schema: json as Anthropic.Tool["input_schema"],
      eager_input_streaming: true,
    };
  });
}

// ---------- Undo descriptors ----------

export type Undo =
  | { type: "delete_task"; id: number }
  | { type: "restore_task"; task: TaskInput & { listId: number }; overrides?: { date: string; time: string }[] }
  | { type: "update_task"; id: number; fields: TaskInput }
  | { type: "set_time_override"; taskId: number; date: string; time: string | null }
  | { type: "set_day_type"; date: string; dayType: "close" | "open" | "prep" | "off" | null }
  | { type: "uncomplete"; taskId: number; date: string }
  | { type: "complete"; taskId: number; date: string; actualTime: string | null; value: number | null; note: string | null };

export type ActionResult = {
  ok: boolean;
  summary: string; // one-line card text
  detail?: string; // second line
  undo?: Undo;
  data: unknown; // what Claude sees
};

// ---------- Helpers ----------

async function resolveListId(userId: number, name?: string): Promise<number | undefined> {
  if (!name) return undefined;
  const existing = await findListByName(userId, name);
  if (existing) return existing.id;
  const created = await createList(userId, name);
  return created.id;
}

function repeatToInput(r?: z.infer<typeof repeatSchema>): Partial<TaskInput> {
  if (!r) return {};
  return {
    repeatType: r.type,
    repeatDays: r.days ?? [],
    startDate: r.start_date ?? null,
    endDate: r.end_date ?? null,
    onceDate: r.date ?? null,
  };
}

function taskToInput(t: Task): TaskInput & { listId: number } {
  return {
    title: t.title,
    note: t.note,
    time: t.time,
    listId: t.listId,
    repeatType: t.repeatType,
    repeatDays: t.repeatDays,
    startDate: t.startDate,
    endDate: t.endDate,
    onceDate: t.onceDate,
    kind: t.kind,
    waterOz: t.waterOz,
    logType: t.logType,
    logUnit: t.logUnit,
    notify: t.notify,
    followsWake: t.followsWake,
  };
}

function describeRepeat(t: Task): string {
  const days = (d: number[]) => d.map((x) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][x]).join("/");
  switch (t.repeatType) {
    case "daily":
      return "every day";
    case "weekdays":
      return days(t.repeatDays);
    case "range":
      return `${t.startDate} to ${t.endDate ?? "open"}${t.repeatDays.length ? " on " + days(t.repeatDays) : ""}`;
    case "once":
      return `once on ${t.onceDate}`;
  }
}

// ---------- Executor ----------

export async function runTool(userId: number, name: string, rawInput: unknown): Promise<ActionResult> {
  if (!(name in toolSchemas)) return { ok: false, summary: `Unknown tool ${name}`, data: { error: "unknown tool" } };
  const parsed = toolSchemas[name as ToolName].safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, summary: `Invalid input for ${name}`, data: { error: "invalid input", issues: parsed.error.issues } };
  }
  try {
    return await execute(userId, name as ToolName, parsed.data);
  } catch (err) {
    const message = err instanceof HttpError ? err.message : err instanceof Error ? err.message : "failed";
    return { ok: false, summary: `${name} failed: ${message}`, data: { error: message } };
  }
}

async function execute(userId: number, name: ToolName, input: unknown): Promise<ActionResult> {
  switch (name) {
    case "list_tasks": {
      const { start_date, end_date } = input as z.infer<typeof toolSchemas.list_tasks>;
      if (!isValidDate(start_date) || !isValidDate(end_date) || end_date < start_date) throw new HttpError(400, "Bad date range");
      const capped = end_date > addDays(start_date, 31) ? addDays(start_date, 31) : end_date;
      const [visible, listRows, dayTypes] = await Promise.all([
        getVisibleTasksForRange(userId, start_date, capped),
        getLists(userId),
        getDayTypesInRange(userId, start_date, capped),
      ]);
      const listName = new Map(listRows.map((l) => [l.id, l.name]));
      const allIds = new Set<number>();
      for (const list of visible.values()) for (const t of list) allIds.add(t.id);
      const doneRows = allIds.size
        ? await db
            .select({ taskId: completions.taskId, date: completions.date })
            .from(completions)
            .where(and(inArray(completions.taskId, [...allIds]), inArray(completions.date, dateRange(start_date, capped))))
        : [];
      const doneSet = new Set(doneRows.map((r) => `${r.taskId}|${r.date}`));
      const days = dateRange(start_date, capped).map((date) => ({
        date,
        weekday: formatDateShort(date).slice(0, 3),
        day_type: dayTypes[date] ?? null,
        tasks: sortDayTasks(
          (visible.get(date) ?? []).map((t) => ({
            id: t.id,
            title: t.title,
            time: t.effectiveTime,
            default_time: t.time,
            list: listName.get(t.listId) ?? "",
            kind: t.kind,
            water_oz: t.waterOz ?? undefined,
            repeat: describeRepeat(t),
            completion: doneSet.has(`${t.id}|${date}`) ? true : null,
          })),
        ).map(({ completion, ...rest }) => ({ ...rest, done: !!completion })),
      }));
      return { ok: true, summary: `Read tasks ${formatDateShort(start_date)} to ${formatDateShort(capped)}`, data: { days } };
    }

    case "create_task": {
      const i = input as z.infer<typeof toolSchemas.create_task>;
      const listId = await resolveListId(userId, i.list);
      const task = await createTask(userId, {
        title: i.title,
        time: i.time ?? null,
        note: i.note ?? "",
        listId,
        repeatType: "daily",
        ...repeatToInput(i.repeat),
        kind: i.kind ?? "normal",
        waterOz: i.water_oz ?? null,
        logType: i.log_type ?? "none",
        logUnit: i.log_unit ?? null,
        notify: i.notify ?? false,
        followsWake: i.follows_wake ?? true,
      });
      return {
        ok: true,
        summary: `Added "${task.title}"`,
        detail: `${formatTime12(task.time)} · ${describeRepeat(task)}`,
        undo: { type: "delete_task", id: task.id },
        data: { task: { id: task.id, title: task.title, time: task.time, repeat: describeRepeat(task) } },
      };
    }

    case "update_task": {
      const i = input as z.infer<typeof toolSchemas.update_task>;
      const before = await getOwnedTask(userId, i.id);
      const listId = await resolveListId(userId, i.list);
      const fields: TaskInput = {
        ...(i.title !== undefined ? { title: i.title } : {}),
        ...(i.time !== undefined ? { time: i.time } : {}),
        ...(i.note !== undefined ? { note: i.note } : {}),
        ...(listId !== undefined ? { listId } : {}),
        ...repeatToInput(i.repeat),
        ...(i.kind !== undefined ? { kind: i.kind } : {}),
        ...(i.water_oz !== undefined ? { waterOz: i.water_oz } : {}),
        ...(i.log_type !== undefined ? { logType: i.log_type } : {}),
        ...(i.log_unit !== undefined ? { logUnit: i.log_unit } : {}),
        ...(i.notify !== undefined ? { notify: i.notify } : {}),
        ...(i.follows_wake !== undefined ? { followsWake: i.follows_wake } : {}),
      } as TaskInput;
      const after = await updateTask(userId, i.id, fields);
      const changed = Object.keys(fields).filter((k) => JSON.stringify((before as Record<string, unknown>)[k]) !== JSON.stringify((after as Record<string, unknown>)[k]));
      return {
        ok: true,
        summary: `Updated "${after.title}"`,
        detail: changed.length ? `Changed ${changed.join(", ")}` : "No changes",
        undo: { type: "update_task", id: i.id, fields: taskToInput(before) },
        data: { task: { id: after.id, title: after.title, time: after.time, repeat: describeRepeat(after) }, changed },
      };
    }

    case "delete_task": {
      const i = input as z.infer<typeof toolSchemas.delete_task>;
      const task = await deleteTask(userId, i.id);
      return {
        ok: true,
        summary: `Deleted "${task.title}"`,
        undo: { type: "restore_task", task: taskToInput(task) },
        data: { deleted: { id: task.id, title: task.title } },
      };
    }

    case "set_time_override": {
      const i = input as z.infer<typeof toolSchemas.set_time_override>;
      const task = await getOwnedTask(userId, i.task_id);
      const previous = await getTimeOverride(userId, i.task_id, i.date);
      await setTimeOverride(userId, i.task_id, i.date, i.time);
      return {
        ok: true,
        summary: `${task.title}: ${formatTime12(i.time)} on ${formatDateShort(i.date)}`,
        detail: i.time === null ? "Override removed" : `Default is ${formatTime12(task.time)}`,
        undo: { type: "set_time_override", taskId: i.task_id, date: i.date, time: previous },
        data: { task_id: i.task_id, date: i.date, time: i.time },
      };
    }

    case "set_day_type": {
      const i = input as z.infer<typeof toolSchemas.set_day_type>;
      const { previous, retimed, configured } = await setDayTypeAndRetime(userId, i.date, i.type);
      const label = i.type ? i.type[0].toUpperCase() + i.type.slice(1) : "cleared";
      return {
        ok: true,
        summary: `${formatDateShort(i.date)}: ${label}`,
        detail: retimed ? `${retimed} routine tiles retimed (this evening and tomorrow morning)` : configured ? undefined : "No wake/bed times set in Settings",
        undo: { type: "set_day_type", date: i.date, dayType: previous },
        data: { date: i.date, type: i.type, retimed_tasks: retimed, day_type_times_configured: configured },
      };
    }

    case "complete_task": {
      const i = input as z.infer<typeof toolSchemas.complete_task>;
      const task = await getOwnedTask(userId, i.task_id);
      const [existing] = await db
        .select()
        .from(completions)
        .where(and(eq(completions.taskId, i.task_id), eq(completions.date, i.date)))
        .limit(1);
      if (i.done === false) {
        await uncompleteTask(userId, i.task_id, i.date);
        return {
          ok: true,
          summary: `Un-did "${task.title}" for ${formatDateShort(i.date)}`,
          undo: existing
            ? { type: "complete", taskId: i.task_id, date: i.date, actualTime: existing.actualTime, value: existing.value === null ? null : Number(existing.value), note: existing.note }
            : undefined,
          data: { task_id: i.task_id, date: i.date, done: false },
        };
      }
      await completeTask(userId, i.task_id, i.date, { actualTime: i.actual_time, value: i.value, note: i.note });
      return {
        ok: true,
        summary: `Marked "${task.title}" done for ${formatDateShort(i.date)}`,
        detail: [i.actual_time ? `actual ${formatTime12(i.actual_time)}` : null, i.value !== undefined ? `${i.value} ${task.logUnit ?? ""}`.trim() : null, i.note].filter(Boolean).join(" · ") || undefined,
        undo: existing
          ? { type: "complete", taskId: i.task_id, date: i.date, actualTime: existing.actualTime, value: existing.value === null ? null : Number(existing.value), note: existing.note }
          : { type: "uncomplete", taskId: i.task_id, date: i.date },
        data: { task_id: i.task_id, date: i.date, done: true },
      };
    }

    case "get_logs": {
      const i = input as z.infer<typeof toolSchemas.get_logs>;
      const logs = await getLogs(userId, i.start_date, i.end_date, i.task_id);
      return {
        ok: true,
        summary: `Read logs ${formatDateShort(i.start_date)} to ${formatDateShort(i.end_date)}`,
        detail: `${logs.length} entries`,
        data: {
          logs: logs.map((l) => ({
            date: l.date,
            task_id: l.taskId,
            title: l.title,
            planned_time: l.plannedTime,
            completed_at: l.completedAt,
            actual_time: l.actualTime,
            value: l.value,
            unit: l.logUnit,
            note: l.note,
          })),
        },
      };
    }
  }
}

// ---------- Undo executor ----------

export async function executeUndo(userId: number, undo: Undo): Promise<string> {
  switch (undo.type) {
    case "delete_task": {
      const t = await deleteTask(userId, undo.id);
      return `Removed "${t.title}"`;
    }
    case "restore_task": {
      const t = await createTask(userId, undo.task);
      return `Restored "${t.title}"`;
    }
    case "update_task": {
      const t = await updateTask(userId, undo.id, undo.fields);
      return `Reverted "${t.title}"`;
    }
    case "set_time_override": {
      await setTimeOverride(userId, undo.taskId, undo.date, undo.time);
      return "Time restored";
    }
    case "set_day_type": {
      await setDayTypeAndRetime(userId, undo.date, undo.dayType);
      return "Day type restored";
    }
    case "uncomplete": {
      await uncompleteTask(userId, undo.taskId, undo.date);
      return "Completion removed";
    }
    case "complete": {
      await completeTask(userId, undo.taskId, undo.date, { actualTime: undo.actualTime, value: undo.value, note: undo.note });
      return "Completion restored";
    }
  }
}
