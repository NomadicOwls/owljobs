# Technology Stack
_Last updated: 2026-05-09_

## Summary
OwlJobs is a TypeScript monorepo built on Cloudflare's edge platform throughout. The frontend is an Astro SSR app deployed to Cloudflare Pages; the backend pipeline runs as a Cloudflare Worker (cron + queue consumer). All packages are pure TypeScript with no transpile step at the workspace level — direct source exports resolve via pnpm workspace links.

## Details

### Languages
- **TypeScript 5.7.3** — used across all packages, apps, and workers
- **SQL** — Supabase migrations in `packages/schema/src/migrations/`
- **TOML** — Wrangler configuration

### Runtime
- **Cloudflare Workers / workerd** — ingest worker (`workers/ingest`) and Pages Functions (web SSR)
- Node.js used only for scripts (`scripts/provision-niche.mjs`) and local dev tooling
- `compatibility_date = "2025-04-08"`, `nodejs_compat` flag enabled on both Worker and Pages

### Package Manager
- **pnpm 10.6.2** — declared in root `package.json` `packageManager` field
- Lockfile: present (`pnpm-lock.yaml`)
- Workspace protocol: `workspace:*` used for all internal packages

### Build / Dev Tooling
- **Turborepo 2.4.4** — orchestrates `build` and `typecheck` across packages
- **Wrangler 4.9.1** — deploys Workers and serves Pages locally; present at root and in `workers/ingest`
- **Astro 5.7.0** — web app framework with `output: "server"` (full SSR)
- `@astrojs/cloudflare ^12.0.0` — Astro adapter for Cloudflare Pages
- `@astrojs/check ^0.9.9` + `tsc --noEmit` — type checking in CI

### Frameworks & Libraries
| Package | Version | Purpose |
|---|---|---|
| `astro` | ^5.7.0 | Web SSR framework |
| `@astrojs/cloudflare` | ^12.0.0 | Cloudflare Pages adapter |
| `@astrojs/tailwind` | ^5.1.0 | Tailwind integration for Astro |
| `tailwindcss` | ^3.4.17 | Utility CSS |
| `tailwindcss-animate` | ^1.0.7 | Animation utilities |
| `@supabase/supabase-js` | ^2.47–^2.49 | DB client (web + worker) |
| `@cloudflare/workers-types` | ^4.20250430.0 | TypeScript types for Workers runtime |
| `xlsx` | ^0.18.5 | Root-level; used by provisioning scripts |

### Styling / Fonts
- Tailwind CSS 3.x with `tailwindcss-animate`
- `@fontsource-variable/geist` and `@fontsource-variable/geist-mono` (variable fonts, self-hosted)
- Path alias `~` → `/src` configured in `astro.config.mjs` via Vite

### Internal Workspace Packages
| Package | Path | Purpose |
|---|---|---|
| `@owljobs/schema` | `packages/schema` | Shared TypeScript types + SQL migrations |
| `@owljobs/niches` | `packages/niches` | Niche configs (classification exemplars, slugs, etc.) |
| `@owljobs/ats-adapters` | `packages/ats-adapters` | ATS feed parsers (Workday, Greenhouse, SuccessFactors, Recruitee, Softgarden) |

### Configuration Files
- `turbo.json` — build pipeline
- `workers/ingest/wrangler.toml` — Worker config (cron, queues, AI binding)
- `apps/web/wrangler.toml` — Pages config (secrets comment block)
- `apps/web/astro.config.mjs` — Astro + Cloudflare adapter config
- `tsconfig.json` files per package

### Known Platform Constraint
- `platformProxy: { enabled: false }` in `astro.config.mjs` — workerd requires macOS 13+; local dev reads from `apps/web/.env` instead of `.dev.vars`

## Key Facts
- Monorepo managed with pnpm workspaces + Turborepo
- Entire stack runs on Cloudflare edge (Workers + Pages); no traditional server
- TypeScript 5.7 throughout — no Babel, no SWC, no separate transpile
- Astro in full SSR mode (not static)
- Two Wrangler deployables: `owljobs-ingest` (Worker) and `owljobs-web` (Pages)
- `nodejs_compat` compatibility flag enabled on both deployables
- Geist variable fonts self-hosted via `@fontsource-variable`
