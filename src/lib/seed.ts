import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { lists, settings, tasks } from "@/db/schema";
import { SEED_LISTS, SEED_MY_PLAN, SEED_SETTINGS, SEED_TASKS } from "./seed-data";

/** True when this email is the one account that receives PRD seed data. */
export function isSeedUser(email: string): boolean {
  const target = process.env.SEED_USER_EMAIL?.trim().toLowerCase();
  return !!target && email.trim().toLowerCase() === target;
}

/** Fresh slate for any new account: one empty Daily list, default settings. */
export async function createFreshSlate(db: Db, userId: number) {
  await db.insert(settings).values({ userId }).onConflictDoNothing();
  const existing = await db.select({ id: lists.id }).from(lists).where(eq(lists.userId, userId)).limit(1);
  if (existing.length === 0) {
    await db.insert(lists).values({ userId, name: "Daily", sortOrder: 0 });
  }
}

/**
 * Apply PRD section 7 seed data to one account. Idempotent: skips entirely if the
 * account already has tasks. Returns a short description of what happened.
 */
export async function applySeed(db: Db, userId: number): Promise<string> {
  const existingTasks = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.userId, userId)).limit(1);
  if (existingTasks.length > 0) {
    return "skipped: account already has tasks";
  }

  await db
    .insert(settings)
    .values({ userId, ...SEED_SETTINGS, myPlan: SEED_MY_PLAN })
    .onConflictDoUpdate({
      target: settings.userId,
      set: { ...SEED_SETTINGS, myPlan: SEED_MY_PLAN },
    });

  const existingLists = await db.select().from(lists).where(eq(lists.userId, userId));
  const listIds = new Map<string, number>(existingLists.map((l) => [l.name, l.id]));
  for (const [i, name] of SEED_LISTS.entries()) {
    if (!listIds.has(name)) {
      const [row] = await db.insert(lists).values({ userId, name, sortOrder: i }).returning({ id: lists.id });
      listIds.set(name, row.id);
    }
  }

  await db.insert(tasks).values(
    SEED_TASKS.map((t) => ({
      userId,
      listId: listIds.get(t.list)!,
      title: t.title,
      note: t.note,
      time: t.time,
      repeatType: t.repeatType,
      repeatDays: t.repeatDays ?? [],
      kind: t.kind ?? "normal",
      waterOz: t.waterOz ?? null,
      logType: t.logType ?? "none",
      logUnit: t.logUnit ?? null,
      notify: t.notify ?? false,
    })),
  );

  return `seeded ${SEED_TASKS.length} tasks, ${SEED_LISTS.length} lists, settings and My Plan`;
}
