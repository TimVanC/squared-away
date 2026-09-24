import { timeSortKey } from "./dates";

/** Open tiles first sorted by time (before 4 a.m. goes last), then done tiles in the same order. */
export function sortDayTasks<T extends { time: string | null; completion: unknown; id: number }>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const ad = a.completion ? 1 : 0;
    const bd = b.completion ? 1 : 0;
    if (ad !== bd) return ad - bd;
    const diff = timeSortKey(a.time) - timeSortKey(b.time);
    return diff !== 0 ? diff : a.id - b.id;
  });
}
