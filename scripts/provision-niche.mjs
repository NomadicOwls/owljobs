#!/usr/bin/env node
/**
 * Usage: node scripts/provision-niche.mjs <niche-id>
 *
 * Generates a Postgres migration for the given niche's schema and prints
 * the SQL to stdout with instructions to paste into the Supabase SQL Editor.
 *
 * The niche-id must match the `id` field in niches/<niche-id>.ts.
 * The SQL substitutes the schema name from the niche config automatically.
 *
 * Example:
 *   node scripts/provision-niche.mjs wind-turbine
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dir, "..");

const nicheId = process.argv[2];
if (!nicheId) {
  console.error("Usage: node scripts/provision-niche.mjs <niche-id>");
  process.exit(1);
}

// Derive the Postgres schema name: wind-turbine → wind_turbine
const schemaName = nicheId.replace(/-/g, "_");

const migrationTemplate = readFileSync(
  resolve(repoRoot, "packages/schema/src/migrations/0001_initial.sql"),
  "utf8"
);

// Replace the placeholder schema name with the actual one
const sql = migrationTemplate.replace(/\bwind_turbine\b/g, schemaName);

const outPath = resolve(repoRoot, `scripts/migration-${nicheId}.sql`);
writeFileSync(outPath, sql, "utf8");

console.log(`
╔══════════════════════════════════════════════════════════════════╗
║  OwlJobs — Niche provisioning: ${nicheId.padEnd(33)}║
╚══════════════════════════════════════════════════════════════════╝

Migration written to:
  ${outPath}

Steps to provision this niche in Supabase:

  1. Open your Supabase project → SQL Editor → New query
  2. Paste the contents of the file above and run it
     (or use: pbcopy < ${outPath})

  3. Expose the schema to PostgREST:
     Settings → API → "Exposed schemas" → add "${schemaName}" → Save

  4. Copy your credentials from Supabase:
     Settings → API → Project URL  →  SUPABASE_URL
     Settings → API → service_role key  →  SUPABASE_SERVICE_KEY

  5. Set Worker secrets:
     wrangler secret put SUPABASE_URL     (in workers/ingest/)
     wrangler secret put SUPABASE_SERVICE_KEY

  6. For local dev, add to workers/ingest/.dev.vars:
     SUPABASE_URL=https://<ref>.supabase.co
     SUPABASE_SERVICE_KEY=<service_role_key>

  7. Add the niche config at niches/${nicheId}.ts
     (use niches/wind-turbine.ts as a template)

  8. Import and register the niche in workers/ingest/src/index.ts:
     import ${schemaName} from "../../../niches/${nicheId}.js";
     registerNiche(${schemaName});

Done. Run \`wrangler dev\` from workers/ingest/ to test.
`);
