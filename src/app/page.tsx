import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/services/day";
import { todayIn } from "@/lib/dates";
import DayScreen from "@/components/DayScreen";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const settings = await getSettings(user.id);
  return <DayScreen initialDate={todayIn(settings.timezone)} timezone={settings.timezone} />;
}
