import { NextResponse } from "next/server";
import { withUser } from "@/lib/api";
import { sendPushToUser } from "@/lib/push";

/** Send a test notification to every device of the logged-in user. */
export const POST = withUser(async (userId) => {
  const result = await sendPushToUser(userId, { title: "Squared Away", body: "Notifications are working.", url: "/", tag: "test" });
  return NextResponse.json(result);
});
