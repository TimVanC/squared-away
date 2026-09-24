// Edge-safe subset of auth (no database imports) for use in proxy.ts.
import { jwtVerify } from "jose";

export const SESSION_COOKIE = "sa_session";

export async function verifySessionToken(token: string): Promise<number | null> {
  const s = process.env.SESSION_SECRET;
  if (!s) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(s));
    return typeof payload.uid === "number" ? payload.uid : null;
  } catch {
    return null;
  }
}
