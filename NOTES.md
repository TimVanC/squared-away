# Build notes and decisions

Decisions and assumptions made while building from the PRD. Anything here is a call I made where the PRD was silent or ambiguous.

## Infrastructure

- **Neon project:** `squared-away` (id `green-breeze-56007628`, region aws-us-east-1, Postgres 17). The pooled connection string is in `.env.local` as `DATABASE_URL`.
- **Schema management:** `drizzle-kit push` (`npm run db:push`) applies the schema straight from `src/db/schema.ts`. No migration files for v1 since there is one environment and one schema owner.
- **DB driver:** `@neondatabase/serverless` over HTTP with `drizzle-orm/neon-http`. Works in Vercel serverless functions without connection pooling concerns.
- **IDs:** integer serial primary keys everywhere. Simple, and the AI tool calls pass ids around as small numbers.

## Seed data

- The seed runs in two ways, both idempotent and both gated on `SEED_USER_EMAIL`:
  1. `npm run seed` applies it to an existing account with that email.
  2. Signing up with that exact email applies it automatically, so the account is ready on first login. Any other email gets the fresh-slate defaults from PRD 4.1.
- The seed skips if the account already has any tasks, so re-running never duplicates tiles.
- Section 3 of the PRD lives only in `scripts/seed-data.ts` as the My Plan text. Nothing from sections 3 or 7 is referenced by app code.

## Model

- `ANTHROPIC_MODEL` defaults to `claude-sonnet-5`, the latest Sonnet, per PRD section 5.
