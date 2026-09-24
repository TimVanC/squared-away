import type Anthropic from "@anthropic-ai/sdk";
import { addDays, formatDateLong, formatDateShort, nowTimeIn, todayIn } from "@/lib/dates";
import { getVisibleTasksForRange } from "@/lib/services/tasks";
import { getDayTypesInRange, getLists, getSettings } from "@/lib/services/day";
import { db } from "@/db";
import { completions, tasks } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";

// Stable part first (cached), volatile context after.
const BEHAVIOR = `You are the assistant inside Squared Away, a personal daily-routine app. The user sees a grid of task tiles for each day and taps them off. You know their plan and can read and change their tasks with tools.

How to behave:
- Be direct and honest. Not a cheerleader. Short, plain sentences. No em dashes anywhere in your writing.
- When they missed a day or slipped, help them get back on track today. No scolding, no lectures.
- Never encourage betting or gambling in any form. If they mention gambling urges or a relapse, remind them of their plan and rules, and mention the helpline 1-800-GAMBLER.
- If they report low mood, no appetite, and no motivation lasting weeks, suggest seeing a doctor. Say it plainly, once.
- The "My Plan" text is the source of truth for their routine, sleep table, nutrition, training, and rules. If it is empty, work without it and help them build one through conversation.

Working with tasks:
- Dates are YYYY-MM-DD and times are HH:MM 24h. Times before 04:00 belong to the end of the previous evening (e.g. lights out at 00:30).
- Call list_tasks before editing so you use real task ids and see effective times. Make many tool calls in one turn when a job needs them (parallel calls are fine).
- To retime a repeating task on specific dates, use set_time_override per date. Only use update_task time when the default should change everywhere.
- One-off things like a work shift are create_task with repeat once and a date. Put shifts in the Work list, lifts and runs in the Fitness list.
- Planning from a schedule (screenshot, photo, or text): for each date, set the day type, then retime wake up, shakes, meals, water checkpoints, fiber, and lights out using the sleep table and water checkpoint rules in My Plan. Water checkpoint amounts differ on shift days. Add each shift as a task with its hours. Place lifts on off days or before close shifts, never during a shift, and runs can share a day with a lift. Respect any rule in My Plan about avoiding prep shifts after closes.
- After making changes, summarize briefly by day. Do not restate every tool call.
- When the user asks about trends (wake time, weight, water), use get_logs and give the numbers plainly.`;

export type PromptContext = {
  system: Anthropic.TextBlockParam[];
  today: string;
  timezone: string;
};

export async function buildSystemPrompt(userId: number): Promise<PromptContext> {
  const settings = await getSettings(userId);
  const tz = settings.timezone;
  const today = todayIn(tz);
  const now = nowTimeIn(tz);
  const horizon = addDays(today, 14);

  const [lists, visible, dayTypes, allTasks] = await Promise.all([
    getLists(userId),
    getVisibleTasksForRange(userId, today, today),
    getDayTypesInRange(userId, addDays(today, -1), horizon),
    db.select().from(tasks).where(eq(tasks.userId, userId)).orderBy(tasks.id),
  ]);
  const listName = new Map(lists.map((l) => [l.id, l.name]));
  const todayTasks = visible.get(today) ?? [];
  const doneRows = todayTasks.length
    ? await db
        .select({ taskId: completions.taskId })
        .from(completions)
        .where(and(inArray(completions.taskId, todayTasks.map((t) => t.id)), eq(completions.date, today)))
    : [];
  const done = new Set(doneRows.map((r) => r.taskId));

  const taskLines = allTasks.map((t) => {
    const rep =
      t.repeatType === "daily"
        ? "daily"
        : t.repeatType === "weekdays"
          ? "weekdays " + t.repeatDays.map((d) => ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"][d]).join("")
          : t.repeatType === "range"
            ? `range ${t.startDate}..${t.endDate ?? "open"}${t.repeatDays.length ? " " + t.repeatDays.join("") : ""}`
            : `once ${t.onceDate}`;
    const extras = [t.kind === "water" ? `water ${t.waterOz}oz` : null, t.logType !== "none" ? `log:${t.logType}${t.logUnit ? " " + t.logUnit : ""}` : null, t.notify ? "notify" : null]
      .filter(Boolean)
      .join(", ");
    return `- #${t.id} "${t.title}" @${t.time ?? "anytime"} [${listName.get(t.listId) ?? "?"}] ${rep}${extras ? " (" + extras + ")" : ""}`;
  });

  const todayLines = todayTasks.map((t) => `- #${t.id} ${t.title} @${t.effectiveTime ?? "anytime"}${done.has(t.id) ? " DONE" : ""}`);

  const dayTypeLines: string[] = [];
  for (let i = -1; i <= 14; i++) {
    const d = addDays(today, i);
    dayTypeLines.push(`${d} ${formatDateShort(d).slice(0, 3)}: ${dayTypes[d] ?? "unset"}`);
  }

  const volatile = [
    `Now: ${formatDateLong(today)} (${today}) at ${now}, timezone ${tz}.`,
    `Lists: ${lists.map((l) => l.name).join(", ") || "none"}.`,
    `Targets: ${settings.calorieTarget} cal, ${settings.proteinTarget}g protein, water ${settings.waterGoalOz} oz (${settings.waterGoalShiftOz} on shift days).`,
    "",
    "All task definitions (id, title, default time, list, repeat):",
    ...(taskLines.length ? taskLines : ["- none yet"]),
    "",
    "Today's tiles (effective times):",
    ...(todayLines.length ? todayLines : ["- none"]),
    "",
    "Day types, yesterday through the next 14 days:",
    ...dayTypeLines,
  ].join("\n");

  const plan = settings.myPlan.trim();
  const system: Anthropic.TextBlockParam[] = [
    {
      type: "text",
      text: `${BEHAVIOR}\n\n<my_plan>\n${plan || "(empty: the user has not written a plan yet)"}\n</my_plan>`,
      cache_control: { type: "ephemeral" },
    },
    { type: "text", text: volatile },
  ];
  return { system, today, timezone: tz };
}
