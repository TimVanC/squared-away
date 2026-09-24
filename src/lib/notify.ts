import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { notifSent, pushSubs, settings, tasks } from "@/db/schema";
import { addDays, formatTime12, nowTimeIn, timeToMinutes, todayIn } from "@/lib/dates";
import { getVisibleTasksForRange } from "@/lib/services/tasks";
import { sendPushToUser } from "@/lib/push";

const LATE_WINDOW_MIN = 20; // send if the task time was within the last 20 minutes

/**
 * Find every task with notify=true whose effective time (after overrides) has
 * arrived in the user's timezone and has not been sent yet, then push it.
 * Safe to call every few minutes; notif_sent prevents duplicates.
 */
export async function runNotificationSweep(now = new Date()) {
  // Only users who have at least one device subscribed and at least one notify task.
  const subUsers = await db.selectDistinct({ userId: pushSubs.userId }).from(pushSubs);
  const notifyUsers = await db.selectDistinct({ userId: tasks.userId }).from(tasks).where(eq(tasks.notify, true));
  const candidates = [...new Set(subUsers.map((r) => r.userId))].filter((id) => notifyUsers.some((n) => n.userId === id));
  if (candidates.length === 0) return { users: 0, sent: 0, checked: 0 };

  const settingRows = await db.select().from(settings).where(inArray(settings.userId, candidates));
  const tz = new Map(settingRows.map((s) => [s.userId, s.timezone]));

  let sent = 0;
  let checked = 0;
  for (const userId of candidates) {
    const zone = tz.get(userId) ?? "America/New_York";
    const today = todayIn(zone, now);
    const nowMin = timeToMinutes(nowTimeIn(zone, now));
    // Tasks before 04:00 belong to the evening; check yesterday's late tasks too when it is after midnight.
    const dates = nowMin < 4 * 60 ? [addDays(today, -1), today] : [today];
    const visible = await getVisibleTasksForRange(userId, dates[0], dates[dates.length - 1]);

    const due: { taskId: number; date: string; title: string; note: string; time: string }[] = [];
    for (const date of dates) {
      for (const t of visible.get(date) ?? []) {
        if (!t.notify || !t.effectiveTime) continue;
        checked++;
        let taskMin = timeToMinutes(t.effectiveTime);
        let nowRel = nowMin;
        if (date !== today) {
          // Yesterday's date, and we're past midnight: shift both onto one axis.
          nowRel = nowMin + 1440;
          if (taskMin < 4 * 60) taskMin += 1440;
        } else if (taskMin < 4 * 60 && nowMin >= 4 * 60) {
          // Today's early-morning task belongs to tonight; not due until after midnight.
          continue;
        }
        const diff = nowRel - taskMin;
        if (diff >= 0 && diff <= LATE_WINDOW_MIN) due.push({ taskId: t.id, date, title: t.title, note: t.note, time: t.effectiveTime });
      }
    }
    if (due.length === 0) continue;

    const already = await db
      .select({ taskId: notifSent.taskId, date: notifSent.date })
      .from(notifSent)
      .where(inArray(notifSent.taskId, due.map((d) => d.taskId)));
    const sentSet = new Set(already.map((a) => `${a.taskId}|${a.date}`));

    for (const d of due) {
      if (sentSet.has(`${d.taskId}|${d.date}`)) continue;
      // Claim first so a concurrent sweep cannot double-send.
      const claimed = await db.insert(notifSent).values({ taskId: d.taskId, date: d.date }).onConflictDoNothing().returning();
      if (claimed.length === 0) continue;
      try {
        const r = await sendPushToUser(userId, {
          title: d.title,
          body: d.note ? `${formatTime12(d.time)} · ${d.note}` : formatTime12(d.time),
          url: "/",
          tag: `task-${d.taskId}-${d.date}`,
        });
        sent += r.sent;
      } catch (err) {
        console.error("notify failed", err);
      }
    }
  }
  return { users: candidates.length, sent, checked };
}
