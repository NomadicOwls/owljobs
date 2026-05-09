# Coding Conventions
_Last updated: 2026-05-09_

## Summary

OwlJobs uses TypeScript 5.7 with strict settings across all packages and apps. There is no ESLint or Prettier config — formatting is unenforced beyond TypeScript's type checker. Code style is consistent and idiomatic: `interface` for data shapes, `export function` (not arrow functions) for named exports, `camelCase` for functions/variables, `PascalCase` for types/interfaces/classes, `snake_case` for database field names matching Supabase column names. Imports use explicit `.js` extensions for internal workspace packages (ESM interop requirement).

## Details

### TypeScript Configuration

**Base config:** `tsconfig.base.json` (root) — inherited by all packages and apps:
- `target: ES2022`, `module: ES2022`, `moduleResolution: bundler`
- `strict: true` — full strict mode
- `noUncheckedIndexedAccess: true` — array indexing returns `T | undefined`, requires non-null assertion `!` when index is known safe
- `exactOptionalPropertyTypes: true` — `undefined` is not assignable to optional properties unless explicitly typed `T | undefined`
- `isolatedModules: true` — each file must be independently compilable
- `declaration: true`, `declarationMap: true`, `sourceMap: true` for packages

**Per-app overrides:**
- `apps/web/tsconfig.json`: adds `jsx: react-jsx`, path alias `~/*` → `./src/*`
- `workers/ingest/tsconfig.json`: adds `types: ["@cloudflare/workers-types"]`, maps workspace packages to source `.ts` files directly (avoids build step during dev)

**Type checking commands:**
- Root: `pnpm typecheck` (via Turborepo)
- Web app: `astro check && tsc --noEmit`
- Worker: `tsc --noEmit`

### Naming Patterns

**Files:**
- kebab-case for all `.ts` and `.astro` files: `fetch-description.ts`, `relative-date.ts`, `JobCardModern.astro`
- Astro components: PascalCase matching component name: `JobCardModern.astro`, `FeaturedJobCard.astro`
- Library files: kebab-case: `jobs.ts`, `supabase.ts`, `env.ts`

**Functions:**
- `camelCase` for all exported and internal functions: `fetchAllWorkdayJobs`, `classifyPendingJobs`, `buildEmbedText`
- Async functions named with action verbs: `fetch*`, `list*`, `get*`, `enrich*`, `classify*`

**Variables and constants:**
- `camelCase` for variables: `positiveVecs`, `embedModel`
- `SCREAMING_SNAKE_CASE` for module-level constants: `EMBED_MODEL`, `BATCH_SIZE`, `POSITIVE_THRESHOLD`, `CLASSIFY_LIMIT`

**Types and Interfaces:**
- `PascalCase` for all: `WorkdayTarget`, `NicheConfig`, `AdaptedJob`, `ClassifyStats`
- Prefer `interface` for data shapes (database rows, config objects, API responses)
- Use `type` for unions, computed types, aliases: `AtsTarget = WorkdayTarget | SuccessFactorsTarget | ...`
- Internal-only types scoped to file: prefixed with no special marker (e.g., `JobRow`, `NicheMessage`, `ClassifyUpdate`)

**Database fields:**
- `snake_case` matching Postgres column names: `employer_id`, `canonical_url`, `ats_type`, `classification_score`

**Error classes:**
- PascalCase with `Error` suffix: `WorkdayAdapterError`, `RecruiteeAdapterError`, `SoftgardenAdapterError`
- All extend `Error`, set `this.name`, expose typed `statusCode` or similar field

### Import Organization

**Order (observed pattern):**
1. External packages: `@supabase/supabase-js`, `astro`, `@cloudflare/workers-types`
2. Workspace packages with `@owljobs/*` scope: `@owljobs/schema`, `@owljobs/niches`, `@owljobs/ats-adapters`
3. Relative imports with `.js` extension (required for ESM): `./ingest.js`, `./classify.js`, `../../../niches/wind-turbine.js`

**Path aliases:**
- Web app only: `~/*` maps to `src/*` (defined in `apps/web/tsconfig.json`)
- Workers/packages: no aliases; relative imports or workspace package names

**Type-only imports:**
- `import type { ... }` used consistently when importing only types: `import type { NicheConfig } from "@owljobs/niches"`

### Function Design

**Signatures:** Options objects for functions with multiple optional params:
```typescript
interface ListJobsOpts {
  page?: number | undefined;
  perPage?: number | undefined;
  country?: string | undefined;
  q?: string | undefined;
}
export async function listJobs(db, schema, opts: ListJobsOpts = {}): Promise<...>
```

**Return shapes:** Explicit `Promise<{ field: Type; ... }>` return types on all exported async functions.

**Error handling:** `throw new Error(message)` at service boundaries; never swallow errors silently except in clearly annotated best-effort catch blocks with `// best-effort` comment.

### Module Design

**Packages use barrel `index.ts`** that re-exports explicitly by name — no wildcard `export *`:
```typescript
// packages/ats-adapters/src/index.ts
export { fetchAllWorkdayJobs, WorkdayAdapterError } from "./workday.js";
export type { AdaptedJob as WorkdayAdaptedJob } from "./workday.js";
```

**Workers export a single default handler** matching Cloudflare's `ExportedHandler<Env>` interface:
```typescript
const handler: ExportedHandler<Env, NicheMessage> = { scheduled, queue, fetch };
export default handler;
```

### Comments

- Inline comments explain non-obvious business logic (API quirks, threshold values, pagination limits)
- JSDoc not used — TypeScript types are the documentation
- `// URL format:` and `// API endpoint:` comments document external API URL patterns
- `// ?target=N runs only that target index` style for endpoint query params

### Linting and Formatting

No ESLint, Prettier, Biome, or `.editorconfig` present. Code quality enforced only via `tsc --noEmit`. Consistent style is maintained manually — 2-space indentation, double quotes for strings, trailing commas in multi-line objects/arrays.

## Key Facts

- TypeScript strict mode + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` — all three enabled; non-null assertions (`!`) required when indexing arrays with known-safe indices
- No formatter configured — consistency is manual
- No linter configured — only `tsc` catches issues
- `.js` extensions required on all relative imports (ESM interop)
- `interface` for shapes, `type` for unions
- `SCREAMING_SNAKE_CASE` for module-level constants only
- `snake_case` for database field names; `camelCase` for TypeScript variables
- Barrel `index.ts` in every package with explicit named re-exports
- `import type` used consistently for type-only imports
- Error classes follow `AdapterError` suffix pattern and extend `Error`
- Options objects pattern for functions with 3+ optional params
