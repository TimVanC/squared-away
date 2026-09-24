import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { lists, tasks } from "@/db/schema";
import { HttpError } from "@/lib/api";
import { getOwnedList } from "./tasks";

export async function createList(userId: number, name: string) {
  const clean = name.trim().slice(0, 40);
  if (!clean) throw new HttpError(400, "List name is required");
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${lists.sortOrder}), -1)` })
    .from(lists)
    .where(eq(lists.userId, userId));
  const [row] = await db.insert(lists).values({ userId, name: clean, sortOrder: Number(max) + 1 }).returning();
  return row;
}

export async function renameList(userId: number, listId: number, name: string) {
  await getOwnedList(userId, listId);
  const clean = name.trim().slice(0, 40);
  if (!clean) throw new HttpError(400, "List name is required");
  const [row] = await db.update(lists).set({ name: clean }).where(and(eq(lists.id, listId), eq(lists.userId, userId))).returning();
  return row;
}

/** Deletes a list and every task in it. Refuses to delete the last list. */
export async function deleteList(userId: number, listId: number) {
  await getOwnedList(userId, listId);
  const all = await db.select({ id: lists.id }).from(lists).where(eq(lists.userId, userId));
  if (all.length <= 1) throw new HttpError(400, "You need at least one list");
  await db.delete(tasks).where(and(eq(tasks.listId, listId), eq(tasks.userId, userId)));
  await db.delete(lists).where(and(eq(lists.id, listId), eq(lists.userId, userId)));
}

/** Find a list by name (case-insensitive) or null. */
export async function findListByName(userId: number, name: string) {
  const rows = await db.select().from(lists).where(eq(lists.userId, userId));
  const target = name.trim().toLowerCase();
  return rows.find((l) => l.name.toLowerCase() === target) ?? null;
}
