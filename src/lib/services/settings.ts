import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings, type Theme } from "@/db/schema";
import { HttpError } from "@/lib/api";
import { DEFAULT_THEME, getSettings } from "./day";

export type SettingsInput = {
  theme?: Partial<Theme> | null;
  calorieTarget?: number;
  proteinTarget?: number;
  waterGoalOz?: number;
  waterGoalShiftOz?: number;
  myPlan?: string;
  timezone?: string;
};

const HEX = /^#[0-9a-fA-F]{6}$/;

export async function updateSettings(userId: number, input: SettingsInput) {
  await getSettings(userId);
  const set: Partial<typeof settings.$inferInsert> = {};
  if (input.theme !== undefined) {
    if (input.theme === null) set.theme = null;
    else {
      const theme: Theme = { ...DEFAULT_THEME };
      for (const key of Object.keys(DEFAULT_THEME) as (keyof Theme)[]) {
        const v = input.theme[key];
        if (v === undefined) continue;
        if (!HEX.test(v)) throw new HttpError(400, `Bad color for ${key}`);
        theme[key] = v.toUpperCase();
      }
      set.theme = theme;
    }
  }
  for (const key of ["calorieTarget", "proteinTarget", "waterGoalOz", "waterGoalShiftOz"] as const) {
    const v = input[key];
    if (v === undefined) continue;
    const n = Math.round(Number(v));
    if (!Number.isFinite(n) || n < 0 || n > 100000) throw new HttpError(400, `Bad value for ${key}`);
    set[key] = n;
  }
  if (input.myPlan !== undefined) set.myPlan = String(input.myPlan).slice(0, 50000);
  if (input.timezone !== undefined) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: input.timezone });
      set.timezone = input.timezone;
    } catch {
      throw new HttpError(400, "Unknown timezone");
    }
  }
  if (Object.keys(set).length === 0) return getSettings(userId);
  const [row] = await db.update(settings).set(set).where(eq(settings.userId, userId)).returning();
  return row;
}
