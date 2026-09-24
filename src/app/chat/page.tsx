import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import ChatScreen from "@/components/ChatScreen";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <ChatScreen />;
}
