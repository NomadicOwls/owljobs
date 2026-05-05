#!/usr/bin/env node
/**
 * Compares EIA Form 860 employers against our manual longlist.
 * Only surfaces companies that are plausible direct employers of wind techs.
 *
 * Filters OUT:
 *   - Companies with <50 MW total wind capacity (too small to employ techs directly)
 *   - Financial investors, holding companies, cooperatives, municipals
 *   - Project-level SPEs
 *
 * Usage: node scripts/eia860-match-longlist.mjs [year]
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const year = process.argv[2] ?? "2024";

const __dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dir, "..");

const longlistPath  = resolve(repoRoot, "docs/employer-longlist.md");
const jsonPath      = resolve(__dir, `.eia860-tmp/companies-${year}.json`);
const outPath       = resolve(repoRoot, "docs/eia860-new-candidates.md");

if (!readFileSync(jsonPath, "utf8").length) {
  console.error(`Company data not found. Run eia860-wind-employers.mjs first.`);
  process.exit(1);
}

// --- Parse longlist ---
const longlistRaw = readFileSync(longlistPath, "utf8");
const longlistNames = longlistRaw
  .split("\n")
  .filter(l => l.trimStart().startsWith("- "))
  .map(l => l
    .replace(/^[-\s✓]+/, "")
    .replace(/\s*\(.*?\)\s*/g, " ")
    .replace(/\s*\*.*?\*\s*/g, " ")
    .replace(/\s*\/\s*/g, " / ")
    .trim()
  )
  .filter(Boolean);

// --- Load EIA company data ---
const allCompanies = JSON.parse(readFileSync(jsonPath, "utf8"));
// { name: { mw, plants } }

// --- Normalisation ---
const LEGAL_SUFFIXES = /\b(llc|lp|llp|inc|incorporated|corp|corporation|co|ltd|limited|plc|as|ag|sa|gmbh|sarl|bv|nv|oy|ab)\b\.?/gi;
const STOP_WORDS     = /\b(energy|wind|power|renewable|renewables|electric|electricity|generation|generating|resources|services|holdings|holding|ventures|partners|group|global|north america|usa|us|america|americas|clean|green|new|national|international|united)\b/gi;
const PUNCT          = /[^a-z0-9\s]/g;

function normalize(name) {
  return name
    .toLowerCase()
    .replace(LEGAL_SUFFIXES, " ")
    .replace(STOP_WORDS, " ")
    .replace(PUNCT, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(norm) {
  return norm.split(" ").filter(t => t.length >= 3);
}

function matches(eiaName, longlistName) {
  const a = normalize(eiaName);
  const b = normalize(longlistName);
  if (!a || !b) return false;
  if (a.includes(b) || b.includes(a)) return true;
  const ta = new Set(tokens(a));
  const tb = tokens(b);
  const shared = tb.filter(t => ta.has(t));
  if (shared.length >= 2) return true;
  // Single short token match is enough for acronym-style names (AES, RWE, EDF)
  if (shared.length === 1 && shared[0].length <= 4) return true;
  return false;
}

const longlistNormalized = longlistNames.map(n => ({ raw: n, norm: normalize(n) }));

function findMatch(name) {
  const norm = normalize(name);
  const toks = new Set(tokens(norm));
  for (const entry of longlistNormalized) {
    if (!entry.norm) continue;
    if (norm.includes(entry.norm) || entry.norm.includes(norm)) return entry.raw;
    const shared = tokens(entry.norm).filter(t => toks.has(t));
    if (shared.length >= 2) return entry.raw;
    if (shared.length === 1 && shared[0].length <= 4) return entry.raw;
  }
  return null;
}

// --- Filters: skip non-employers of wind techs ---

// Too small to have in-house tech team
const MIN_MW = 50;

// Patterns that indicate an asset owner / financial entity, not a tech employer
const NON_EMPLOYER_PATTERNS = [
  // Financial / investment
  /\bblackrock\b/i,
  /\bcapital\b/i,
  /\bfund\b/i,
  /\binvestment\b/i,
  /\binvestors\b/i,
  /\bcapital partners\b/i,
  /\bprivate equity\b/i,
  /\binfrastructure\b/i,
  /\basset management\b/i,
  /\bacquisition\b/i,
  /\bfinance\b/i,
  /\bfinancial\b/i,
  /\bsecurities\b/i,
  /\btrust\b/i,
  /\bbank\b/i,
  // Cooperatives / municipals (outsource O&M)
  /\bcooperative\b/i,
  /\bcoop\b/i,
  /\bmunicipal\b/i,
  /\bmunicipal power\b/i,
  /\bmun power\b/i,
  /\bcity of\b/i,
  /\bcounty of\b/i,
  // Government / federal transmission
  /\bwapa\b/i,
  /\bbpa\b/i,
  /bonneville/i,
  /\btva\b/i,
  /air force/i,
  /\bmilitary\b/i,
  /\bfederal\b/i,
  // SPE patterns
  /wind project/i,
  /wind farm/i,
  /\bproject\b/i,
  /\bfarm\s+(i|ii|iii|iv|v|vi|vii|viii|1|2|3|4|5|6|7|8|9)\b/i,
  /\b(i|ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii|xiii)\s*(llc|lp|,)?\s*$/i,
  /\b\d+(st|nd|rd|th)?\s*(llc|lp|inc)?\s*$/i,
  /\b[a-z]+\s+(i|ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii),?\s*(llc|lp)?\s*$/i,
  /(county|creek|ridge|mountain|plains|prairie|flat|flats|hill|hills|lake|river|valley|mesa|butte|peak|hollow|fork|ridge),?\s*(llc|lp|inc)?\s*$/i,
  /owner,?\s*llc/i,
  /holding/i,
  /\bpartnership\b/i,
  // Wrong technology
  /\bsolar\b/i,
  /\bhydro\b/i,
  /\bnuclear\b/i,
  /\bcoal\b/i,
];

// Signals that override non-employer patterns — these are real operators
const EMPLOYER_OVERRIDES = [
  /\bservices?\b/i,
  /\boperations?\b/i,
  /\bmaintenance\b/i,
  /\bengineering\b/i,
  /siemens/i,
  /vestas/i,
  /vernova/i,
  /nordex/i,
  /berkshire hathaway/i,
  /\bbhe\b/i,   // BHE Renewables (Berkshire Hathaway Energy) — large operator
];

function isEmployer(name, mw) {
  if (mw < MIN_MW) return false;
  if (EMPLOYER_OVERRIDES.some(p => p.test(name))) return true;
  if (NON_EMPLOYER_PATTERNS.some(p => p.test(name))) return false;
  return true;
}

// --- Run ---
const matched    = [];
const candidates = [];
const filtered   = [];

for (const [name, { mw, plants }] of Object.entries(allCompanies)) {
  if (!isEmployer(name, mw)) {
    filtered.push({ name, mw, plants });
    continue;
  }
  const match = findMatch(name);
  if (match) {
    matched.push({ name, mw, plants, match });
  } else {
    candidates.push({ name, mw, plants });
  }
}

// Sort candidates by MW descending — biggest operators first
candidates.sort((a, b) => b.mw - a.mw);
matched.sort((a, b) => b.mw - a.mw);

// --- Build report ---
const lines = [
  `# EIA Form 860 (${year}) — New Employer Candidates`,
  ``,
  `Only companies with ≥${MIN_MW} MW installed wind capacity that show signals`,
  `of directly employing wind technicians (not financial investors, cooperatives,`,
  `or project-level SPEs).`,
  ``,
  `| Category | Count |`,
  `|---|---|`,
  `| Already in longlist | ${matched.length} |`,
  `| **New candidates** | **${candidates.length}** |`,
  `| Filtered out (non-employers / SPEs / small) | ${filtered.length} |`,
  ``,
  `---`,
  ``,
  `## New Candidates`,
  ``,
  `Sorted by installed capacity — bigger operators are more likely to have`,
  `in-house tech teams. Review and add confirmed employers to the longlist.`,
  ``,
  ...candidates.map(({ name, mw, plants }) =>
    `- **${name}** — ${mw} MW, ${plants} plants`
  ),
  ``,
  `---`,
  ``,
  `## Already in Longlist`,
  ``,
  ...matched.map(({ name, mw, match }) =>
    `- ${name} (${mw} MW) → *${match}*`
  ),
];

writeFileSync(outPath, lines.join("\n") + "\n");

console.log(`
EIA 860 → Longlist comparison (${year})
  Total EIA companies    : ${Object.keys(allCompanies).length}
  Already in longlist    : ${matched.length}
  New candidates         : ${candidates.length}
  Filtered (non-employer): ${filtered.length}

Report written to:
  ${outPath}

Top 20 new candidates by MW:
${candidates.slice(0, 20).map(({ name, mw }) => `  ${String(mw).padStart(8)} MW  ${name}`).join("\n")}
`);
