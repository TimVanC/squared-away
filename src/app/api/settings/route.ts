import { NextResponse } from "next/server";
import { readJson, withUser } from "@/lib/api";
import { DEFAULT_THEME, getSettings } from "@/lib/services/day";
import { updateSettings, type SettingsInput } from "@/lib/services/settings";

export const GET = withUser(async (userId) => {
  const s = await getSettings(userId);
  return NextResponse.json({ settings: s, defaultTheme: DEFAULT_THEME });
});

export const PATCH = withUser(async (userId, req) => {
  const body = await readJson<SettingsInput>(req);
  const s = await updateSettings(userId, body);
  return NextResponse.json({ settings: s });
});
