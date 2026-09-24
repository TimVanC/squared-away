// Date and time helpers. All "dates" are YYYY-MM-DD strings in the user's timezone.
// All "times" are HH:MM 24h strings.

export const DEFAULT_TZ = "America/New_York";

function parts(d: Date, tz: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const map: Record<string, string> = {};
  for (const p of fmt.formatToParts(d)) map[p.type] = p.value;
  return map;
}

/** Today's date string in a timezone. */
export function todayIn(tz: string = DEFAULT_TZ, now: Date = new Date()): string {
  const p = parts(now, tz);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Current HH:MM in a timezone. */
export function nowTimeIn(tz: string = DEFAULT_TZ, now: Date = new Date()): string {
  const p = parts(now, tz);
  return `${p.hour}:${p.minute}`;
}

export function isValidDate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z"));
}

export function isValidTime(s: unknown): s is string {
  return typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

/** Add days to a date string (calendar arithmetic, timezone-free). */
export function addDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 0 = Sunday ... 6 = Saturday */
export function weekdayOf(date: string): number {
  return new Date(date + "T00:00:00Z").getUTCDay();
}

export function compareDates(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Inclusive list of date strings. */
export function dateRange(start: string, end: string): string[] {
  const out: string[] = [];
  let d = start;
  while (d <= end) {
    out.push(d);
    d = addDays(d, 1);
    if (out.length > 400) break;
  }
  return out;
}

/** Minutes since midnight. */
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(mins: number): string {
  const m = ((mins % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Sort key for a tile time. Anytime sorts last, times before 4 a.m. sort to the end of the day. */
export function timeSortKey(t: string | null | undefined): number {
  if (!t) return 10_000;
  const mins = timeToMinutes(t);
  return mins < 4 * 60 ? mins + 1440 : mins;
}

/** "8:30 AM" style display. */
export function formatTime12(t: string | null | undefined): string {
  if (!t) return "Anytime";
  const [h, m] = t.split(":").map(Number);
  const suffix = h < 12 ? "AM" : "PM";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** "Wed, Sep 24" */
export function formatDateShort(date: string): string {
  const d = new Date(date + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

/** "Wednesday, September 24, 2026" */
export function formatDateLong(date: string): string {
  const d = new Date(date + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
