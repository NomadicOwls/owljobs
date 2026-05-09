# Codebase Structure
_Last updated: 2026-05-09_

## Summary

OwlJobs is a pnpm workspaces monorepo managed by Turborepo. Code is split into four workspace groups: `apps/` (deployable applications), `workers/` (Cloudflare Workers), `packages/` (shared libraries), and `niches/` (niche configuration data). Each workspace has its own `package.json`; the root manages dev tooling only.

## Details

### Directory Layout

```
owljobs/
├── apps/
│   └── web/                  # Astro SSR frontend → Cloudflare Pages
│       ├── src/
│       │   ├── components/   # Astro UI components
│       │   │   └── ui/       # Primitive UI components (buttons, inputs)
│       │   ├── lib/          # Runtime helpers (Supabase client, job queries, env, cache)
│       │   ├── pages/        # File-based routing
│       │   │   ├── api/      # Server API routes (subscribe, confirm, unsubscribe)
│       │   │   ├── employers/# /employers/[slug].astro
│       │   │   └── jobs/     # /jobs/[slug].astro
│       │   └── styles/       # Global CSS
│       ├── public/           # Static assets
│       └── docs/designs/     # Design reference files (not deployed)
│
├── workers/
│   └── ingest/               # Cloudflare Worker — cron + queue handler
│       └── src/
│           ├── index.ts      # Entry point: scheduled + queue + fetch handlers
│           ├── ingest.ts     # ATS polling and DB insert logic
│           ├── classify.ts   # AI classification (embedding + LLM)
│           ├── enrich.ts     # Description fetch and DB update
│           └── fetch-description.ts  # ATS-dispatch for job description fetching
│
├── packages/
│   ├── schema/               # @owljobs/schema — shared TypeScript types + DB utilities
│   │   └── src/
│   │       ├── index.ts      # Employer, Job, JobSource, Subscriber types + sha256Hex
│   │       └── migrations/   # SQL migration files
│   ├── niches/               # @owljobs/niches — NicheConfig type + in-memory registry
│   │   └── src/
│   │       └── index.ts      # NicheConfig interface, AtsTarget types, registerNiche()
│   └── ats-adapters/         # @owljobs/ats-adapters — ATS API clients
│       └── src/
│           ├── workday.ts
│           ├── greenhouse.ts
│           ├── successfactors.ts
│           ├── recruitee.ts
│           ├── softgarden.ts
│           └── sanitize.ts   # HTML sanitization for descriptions
│
├── niches/                   # Niche definition files (imported by both worker + web)
│   └── wind-turbine.ts       # Active niche: NicheConfig for windturbinejobs.com
│
├── scripts/                  # One-off maintenance scripts (Node)
│   └── provision-niche.mjs   # Scaffold a new niche (run via `pnpm niche:provision`)
│
├── .planning/
│   └── codebase/             # GSD codebase map documents
│
├── package.json              # Root: dev tooling only (turbo, wrangler, typescript)
├── pnpm-workspace.yaml       # Workspace roots: niches, packages/*, workers/*, apps/*
├── turbo.json                # Turborepo task graph (build depends on ^build)
└── tsconfig.base.json        # Shared TypeScript base config
```

### Key File Locations

**Entry Points:**
- `workers/ingest/src/index.ts` — Worker entry (cron, queue, fetch handlers)
- `apps/web/src/pages/index.astro` — Home page
- `apps/web/src/pages/jobs/[slug].astro` — Job detail page
- `apps/web/src/pages/employers/[slug].astro` — Employer profile page

**Core Data Access:**
- `apps/web/src/lib/jobs.ts` — All Supabase query functions for the frontend
- `apps/web/src/lib/supabase.ts` — `supabasePublic()` and `supabaseAdmin()` factory functions
- `apps/web/src/lib/env.ts` — `getEnv()` — reads Cloudflare runtime env or `import.meta.env`
- `apps/web/src/lib/niches.ts` — Registers niches for web runtime; re-exports `@owljobs/niches`

**Shared Types:**
- `packages/schema/src/index.ts` — `Job`, `Employer`, `JobSource`, `Subscriber`, `EmailSend`
- `packages/niches/src/index.ts` — `NicheConfig`, `AtsTarget` union, `registerNiche()`, `nicheFromHost()`

**Configuration:**
- `niches/wind-turbine.ts` — ATS targets, classification exemplars, branding for wind-turbine niche
- `apps/web/astro.config.*` — Astro + Cloudflare adapter config
- `workers/ingest/wrangler.toml` — Worker bindings (Queues, AI, env vars)

**API Routes:**
- `apps/web/src/pages/api/subscribe.ts` — POST newsletter signup
- `apps/web/src/pages/api/confirm.ts` — GET email confirmation
- `apps/web/src/pages/api/unsubscribe.ts` — GET unsubscribe

**Feeds:**
- `apps/web/src/pages/feed.json.ts` — JSON feed
- `apps/web/src/pages/feed.xml.ts` — RSS feed
- `apps/web/src/pages/sitemap.xml.ts` — XML sitemap

### Naming Conventions

**Files:**
- TypeScript source: `kebab-case.ts` everywhere (e.g. `fetch-description.ts`, `relative-date.ts`)
- Astro components: `PascalCase.astro` (e.g. `JobListings.astro`, `FeaturedJobCard.astro`)
- Astro pages/routes: `kebab-case.astro` or `[slug].astro`
- API routes: `kebab-case.ts` inside `pages/api/`

**Packages:**
- Internal packages use `@owljobs/` scope: `@owljobs/schema`, `@owljobs/niches`, `@owljobs/ats-adapters`

**Database:**
- Schema names: `snake_case` matching niche id with hyphens replaced (e.g. `wind_turbine`)
- Table names: `snake_case` plural (`jobs`, `employers`, `job_sources`, `subscribers`)

### Where to Add New Code

**New ATS adapter:**
- Implementation: `packages/ats-adapters/src/{ats-name}.ts`
- Export `fetchAll{AtsName}Jobs()` and optionally `fetch{AtsName}JobDescription()`
- Register in `workers/ingest/src/ingest.ts` dispatch switch

**New niche:**
- Config file: `niches/{niche-id}.ts` implementing `NicheConfig`
- Register in `workers/ingest/src/index.ts` (call `registerNiche()`)
- Register in `apps/web/src/lib/niches.ts` (call `registerNiche()`)
- Run `pnpm niche:provision` to scaffold Supabase schema

**New frontend page:**
- Add `apps/web/src/pages/{route}.astro`
- Use `const { niche } = Astro.locals` for niche context
- Use `getEnv(Astro.locals)` to read env vars
- Use `supabasePublic(env)` for read-only queries

**New API endpoint:**
- Add `apps/web/src/pages/api/{name}.ts`
- Export named HTTP method handler (e.g. `export const POST: APIRoute = ...`)
- Use `supabaseAdmin(env)` for write operations

**New shared type:**
- Add to `packages/schema/src/index.ts`

**New lib helper (web):**
- Add to `apps/web/src/lib/{name}.ts`

### Special Directories

**`apps/web/dist/`:**
- Purpose: Astro build output for Cloudflare Pages
- Generated: Yes
- Committed: No

**`apps/web/docs/designs/`:**
- Purpose: UI design reference files (unused template from Next.js era)
- Generated: No
- Committed: Yes (present in working tree, untracked)

**`workers/ingest/.wrangler/`:**
- Purpose: Wrangler local dev state and build cache
- Generated: Yes
- Committed: No

**`.planning/`:**
- Purpose: GSD planning documents (codebase maps, phase plans)
- Generated: By GSD tooling
- Committed: Yes

**`scripts/`:**
- Purpose: Maintenance and provisioning scripts (Node, not Worker-compatible)
- Contains: `provision-niche.mjs` for scaffolding new niches

## Key Facts

- Monorepo: pnpm workspaces + Turborepo; `build` tasks topologically ordered via `^build`
- Four workspace roots: `apps/*`, `workers/*`, `packages/*`, `niches/`
- `niches/` workspace holds niche config objects shared between worker and web
- Astro components use `PascalCase.astro`; all TypeScript uses `kebab-case.ts`
- Internal packages scoped as `@owljobs/*` — no npm publish, workspace-linked only
- New niches require `registerNiche()` calls in both `workers/ingest/src/index.ts` AND `apps/web/src/lib/niches.ts`
- All Supabase queries scope to the niche's Postgres schema via `db.schema(niche.supabaseSchema)`
- Env access: Cloudflare Pages runtime via `Astro.locals.runtime.env`; dev fallback via `import.meta.env`
- `apps/web/docs/designs/` contains stale Next.js design files — not part of build
