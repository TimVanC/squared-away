// Applies PRD section 7 seed data to the account matching SEED_USER_EMAIL.
// Usage: npm run seed
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const email = process.env.SEED_USER_EMAIL?.trim().toLowerCase();
  if (!email) throw new Error("SEED_USER_EMAIL is not set");

  const { db } = await import("../src/db");
  const { users } = await import("../src/db/schema");
  const { applySeed } = await import("../src/lib/seed");
  const { eq } = await import("drizzle-orm");

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    console.error(`No account found for ${email}. Sign up with that email first (sign-up seeds automatically).`);
    process.exit(1);
  }
  const result = await applySeed(db, user.id);
  console.log(`${email}: ${result}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
