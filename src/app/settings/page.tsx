import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { DEFAULT_THEME, getLists, getSettings } from "@/lib/services/day";
import SettingsScreen from "@/components/SettingsScreen";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const [settings, lists] = await Promise.all([getSettings(user.id), getLists(user.id)]);
  return (
    <SettingsScreen
      email={user.email}
      initial={{
        theme: { ...DEFAULT_THEME, ...(settings.theme ?? {}) },
        calorieTarget: settings.calorieTarget,
        proteinTarget: settings.proteinTarget,
        waterGoalOz: settings.waterGoalOz,
        waterGoalShiftOz: settings.waterGoalShiftOz,
        myPlan: settings.myPlan,
        timezone: settings.timezone,
      }}
      defaultTheme={DEFAULT_THEME}
      initialLists={lists}
      vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""}
    />
  );
}
