# OwlJobs — Claude Code Guide

## Project

Multi-niche job board aggregation engine. Wind turbine technicians is niche 1. Revenue: employer subscriptions (€499/€999/€1999/mo) for featured placement, company pages, and candidate alerts.

See `.planning/PROJECT.md` for full context.

## Current Phase

Check `.planning/STATE.md` for current phase and status.

## Architecture

- **Monorepo**: pnpm workspaces + Turborepo
- **Workers**: `workers/ingest` (ATS + classify + enrich + digest), `workers/billing` (Stripe), `workers/discover` (ATS auto-discovery)
- **Frontend**: `apps/web/` — Astro 5 SSR on Cloudflare Pages
- **DB**: Supabase — per-niche Postgres schema (e.g. `wind_turbine`)
- **Packages**: `@owljobs/niches`, `@owljobs/schema`, `@owljobs/ats-adapters`

## Hard Rules

- **Multi-niche always**: Never hardcode `wind_turbine` schema in new code. Use the niche registry pattern (`registerNiche`, `getAllNiches`, `nicheFromHost`).
- **Edge only**: All features must run on Cloudflare Workers/Pages. No Node.js servers, no Redis, no external auth services.
- **Stripe webhooks**: Use `constructEventAsync` + `Stripe.createSubtleCryptoProvider()`. Sync `constructEvent` does not work in Workers.
- **Supabase SSR auth**: Use `@supabase/ssr` ^0.10.0. v0.10+ fixes a CDN session cross-contamination bug — do not downgrade.
- **HTML sanitization**: Use `dompurify` (Workers no-DOM mode) on all employer-editable content. `sanitize-html` is Node-only.
- **Email digest pattern**: Cron → Queue (max_batch_size: 2) → Resend. Never loop-and-send in the cron handler (30s CPU cap).

## Key Technical Decisions

- `featured_until TIMESTAMPTZ` on jobs — self-expiring, partial index `WHERE featured_until > NOW()`
- `employer_subscriptions` in `public` schema (not per-niche) — billing is global
- `stripe_events` table with PK on Stripe event ID — idempotency without Redis
- `employer_id` JWT claim injected via Supabase Auth Hook — fast RLS without joins
- `PAGES_DEPLOY_HOOK` triggers rebuild after enrich and profile edits

## Deployment

- **CF Pages project name**: `owljobs` (not `owljobs-web` — use this with all `wrangler` commands)
- **Build output directory**: `apps/web/dist` (set in CF Pages dashboard, not in wrangler.toml)
- **No root `wrangler.toml`**: Adding one breaks secrets injection. `apps/web/wrangler.toml` is for local dev only.
- **Secrets**: Set via `wrangler pages secret bulk <json> --project-name owljobs` or CF dashboard → owljobs → Settings → Environment Variables. Required: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`, `BREVO_API_KEY`.
- **Live logs**: `pnpm wrangler pages deployment tail <deployment-id> --project-name owljobs`
- **Cache purge**: Automatic via `.github/workflows/purge-cache.yml` on every push to main. Requires `CF_ACCOUNT_ID`, `CF_ZONE_ID`, `CF_CACHE_PURGE_TOKEN` GitHub secrets.

## Workflow

This project uses GSD (Get Shit Done) planning workflow:

- `/gsd-plan-phase N` — plan next phase
- `/gsd-execute-phase N` — execute a planned phase
- `/gsd-progress` — check current status
- `/gsd-discuss-phase N` — discuss approach before planning

## GSD Mode

**YOLO** — auto-approve, just execute. Parallel execution enabled. Quality model profile.
Verifier and plan-checker enabled.
