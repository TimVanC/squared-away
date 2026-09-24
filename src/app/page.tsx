import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import Wordmark from "@/components/Wordmark";
import LogoutButton from "@/components/LogoutButton";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <main className="mx-auto w-full max-w-[480px] px-4 py-6">
      <div className="flex items-center justify-between">
        <Wordmark />
        <LogoutButton />
      </div>
      <p className="mt-6 text-sm opacity-80">Logged in as {user.email}</p>
    </main>
  );
}
