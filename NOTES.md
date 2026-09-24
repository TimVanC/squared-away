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

## Deployment

- **Vercel project:** `squared-away-qay3` in team "Tim's projects" (the GitHub repo was already linked there through the Vercel import UI, so I reused it; a second empty project named `squared-away` also exists in the team and can be deleted). Production URL: https://squared-away-qay3.vercel.app
- **Env vars** were pushed with the Vercel CLI (`vercel env add`) from `.env.local`; the MCP connection lacked env-var permission. `DATABASE_URL` and `DATABASE_URL_UNPOOLED` were already set by the Neon integration and point at the same Neon project.
- **Scheduler:** Vercel Cron on the Hobby plan only allows once-a-day schedules, so `vercel.json` has no cron. Use cron-job.org (free) to call `GET https://<app>/api/cron/notify?secret=<CRON_SECRET>` every 5 minutes. The route also accepts `Authorization: Bearer <CRON_SECRET>`, so switching back to Vercel Cron on a Pro plan is a one-line `vercel.json` change.
- **Notification timing:** the sweep sends a task's push when its effective time is between 0 and 20 minutes ago (covers a 5-minute scheduler with room for delays). Tasks timed before 04:00 count as that evening, so a 00:30 "lights out" fires after midnight, not the previous morning.

## Anthropic API key

- The key provided is not scoped to a workspace, and the API now rejects such keys unless the request carries `anthropic-workspace-id`. The app reads an optional `ANTHROPIC_WORKSPACE_ID` env var and sends it as that header. Either set that var (console.anthropic.com, Settings, Workspaces) or create a new key inside a workspace.

## Chat storage

- Chat history persists as rows per API turn: user text, assistant text plus tool calls plus undo descriptors, and tool results. Uploaded file bytes are not stored; a later turn sees "[Attached earlier: name]" and can ask for a re-attach.
- Images are downscaled client-side (max 1800px JPEG) so uploads stay under Vercel's 4.5 MB request limit.

## Test data

- Two test accounts (`tester@example.com`, plus the AI test messages) were created in the Neon DB during development and are deleted at the end of the build.

## PRD gaps found while testing

- **Water checkpoint amounts per day type (PRD 4.4):** the data model only has `time_overrides` per date, so the AI can retime checkpoints per day but cannot change their ounce amounts on one date. In the planning test it worked around this by adding a "Shift day water boost" 20 oz checkpoint on shift days, which reaches the 120 oz goal. A per-date `water_oz` override would be the clean fix later.
- **Em dashes (PRD 4.10):** the model occasionally emits one despite the rule, so the chat route replaces em and en dashes with commas in streamed and stored text.
- **Chat history and files:** file bytes are not persisted, so a later turn cannot re-read an old screenshot; the model is told to ask for a re-attach.
