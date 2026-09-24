import webpush from "web-push";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { pushSubs } from "@/db/schema";

let configured = false;
function configure() {
  if (configured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails("mailto:" + (process.env.SEED_USER_EMAIL || "admin@example.com"), pub, priv);
  configured = true;
  return true;
}

export type PushPayload = { title: string; body: string; url?: string; tag?: string };

/** Send a payload to every device of one user. Removes subscriptions that are gone. */
export async function sendPushToUser(userId: number, payload: PushPayload): Promise<{ sent: number; removed: number }> {
  if (!configure()) throw new Error("VAPID keys are not configured");
  const subs = await db.select().from(pushSubs).where(eq(pushSubs.userId, userId));
  let sent = 0;
  let removed = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 60 * 30 });
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await db.delete(pushSubs).where(and(eq(pushSubs.id, s.id), eq(pushSubs.userId, userId)));
          removed++;
        } else {
          console.error("push failed", status, (err as Error).message);
        }
      }
    }),
  );
  return { sent, removed };
}
