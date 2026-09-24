import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { timeOverrides, type DayType, type DayTypeTimes } from "@/db/schema";
import { addDays, minutesToTime, timeToMinutes } from "@/lib/dates";
import { getDayTypesInRange, getSettings, setDayType } from "./day";
import { getVisibleTasksForRange } from "./tasks";

/**
 * How day types move the routine.
 *
 * The sleep table entry for a day type describes the NIGHT after that day's shift:
 * "Close: bed 2:00, wake 10:00" means bed at 2:00 that night and wake at 10:00 the next morning.
 * So on date D:
 *   - evening tasks (default time 21:00 or later, including after-midnight ones) shift by
 *     bed(type of D) minus bed(off)
 *   - morning and daytime tasks (default time before 21:00) shift by
 *     wake(type of D-1) minus wake(off)
 * Task default times are off-day times. Only tasks with followsWake move, and never one-off tasks.
 */
export const EVENING_SPLIT_MIN = 21 * 60;

function isEveningTask(time: string): boolean {
  const m = timeToMinutes(time);
  return m >= EVENING_SPLIT_MIN || m < 4 * 60;
}

/** Bed-time offset (minutes) for the night of a day with `type`, relative to an off day. */
export function bedOffsetMinutes(times: DayTypeTimes | null | undefined, type: DayType | null): number | null {
  if (!times?.off?.bed) return null;
  const t = type === null ? "off" : type;
  if (!times[t]?.bed) return null;
  return wrapNight(timeToMinutes(times[t]!.bed)) - wrapNight(timeToMinutes(times.off.bed));
}

/** Wake-time offset (minutes) for the morning after a day with `type`, relative to an off day. */
export function wakeOffsetMinutes(times: DayTypeTimes | null | undefined, type: DayType | null): number | null {
  if (!times?.off?.wake) return null;
  const t = type === null ? "off" : type;
  if (!times[t]?.wake) return null;
  return timeToMinutes(times[t]!.wake) - timeToMinutes(times.off.wake);
}

/** Bed times before 04:00 belong to the night, so treat them as 24h later for arithmetic. */
function wrapNight(mins: number): number {
  return mins < 4 * 60 ? mins + 1440 : mins;
}

/** Recompute overrides for every routine task on one date from the day types around it. */
export async function retimeDate(userId: number, date: string): Promise<number> {
  const settings = await getSettings(userId);
  const times = settings.dayTypeTimes;
  if (!times?.off) return 0;
  const prev = addDays(date, -1);
  const types = await getDayTypesInRange(userId, prev, date);
  const wakeOffset = wakeOffsetMinutes(times, types[prev] ?? null);
  const bedOffset = bedOffsetMinutes(times, types[date] ?? null);

  const visible = (await getVisibleTasksForRange(userId, date, date)).get(date) ?? [];
  const movable = visible.filter((t) => t.followsWake && t.time && t.repeatType !== "once");
  if (movable.length === 0) return 0;

  const clear: number[] = [];
  for (const t of movable) {
    const offset = isEveningTask(t.time!) ? bedOffset : wakeOffset;
    if (offset === null || offset === 0) {
      clear.push(t.id);
      continue;
    }
    const time = minutesToTime(timeToMinutes(t.time!) + offset);
    await db
      .insert(timeOverrides)
      .values({ taskId: t.id, date, time })
      .onConflictDoUpdate({ target: [timeOverrides.taskId, timeOverrides.date], set: { time } });
  }
  if (clear.length) {
    await db.delete(timeOverrides).where(and(inArray(timeOverrides.taskId, clear), eq(timeOverrides.date, date)));
  }
  return movable.length;
}

/**
 * Set a day type and retime that date's evening plus the next morning.
 * Returns how many tiles were retimed across both dates.
 */
export async function setDayTypeAndRetime(userId: number, date: string, type: DayType | null) {
  const previous = await setDayType(userId, date, type);
  const settings = await getSettings(userId);
  if (!settings.dayTypeTimes?.off) return { previous, retimed: 0, configured: false };
  const a = await retimeDate(userId, date);
  const b = await retimeDate(userId, addDays(date, 1));
  return { previous, retimed: a + b, configured: true };
}
