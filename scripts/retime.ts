// Re-apply day-type retiming for one user's dates. Usage: npx tsx scripts/retime.ts <userId> <date> [date...]
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const [userIdArg, ...dates] = process.argv.slice(2);
  const userId = Number(userIdArg);
  if (!Number.isInteger(userId) || dates.length === 0) throw new Error("usage: tsx scripts/retime.ts <userId> <date> [date...]");
  const { retimeDate } = await import("../src/lib/services/daytype");
  for (const d of dates) console.log(d, "retimed", await retimeDate(userId, d), "tiles");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
