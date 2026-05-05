#!/usr/bin/env node
/**
 * Extracts wind farm owner/operator names from EIA Form 860,
 * enriched with total installed capacity (MW) per company.
 *
 * Downloads the annual zip, parses the wind generator + ownership files,
 * and writes a JSON map of { companyName -> { mw, plants } } to
 * scripts/.eia860-tmp/companies-<year>.json  (used by eia860-match-longlist.mjs)
 * and a human-readable list to docs/eia860-employers.txt
 *
 * Usage: node scripts/eia860-wind-employers.mjs [year]
 *   year defaults to 2024
 *
 * The zip is cached in scripts/.eia860-tmp/ — delete to re-download.
 */

import { writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const xlsx = require("xlsx");

const year = process.argv[2] ?? "2024";
const EIA_URL = `https://www.eia.gov/electricity/data/eia860/xls/eia860${year}.zip`;

const __dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dir, "..");
const tmpDir = resolve(__dir, ".eia860-tmp");
const zipPath = resolve(tmpDir, `eia860${year}.zip`);
const extractDir = resolve(tmpDir, `extracted-${year}`);
const jsonPath = resolve(tmpDir, `companies-${year}.json`);
const outPath = resolve(repoRoot, "docs", "eia860-employers.txt");

mkdirSync(tmpDir, { recursive: true });
mkdirSync(extractDir, { recursive: true });

// --- Download ---
if (existsSync(zipPath)) {
  console.log(`Using cached zip: ${zipPath}`);
} else {
  console.log(`Downloading EIA Form 860 (${year})...`);
  const res = await fetch(EIA_URL);
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}\n${EIA_URL}`);
  const buf = await res.arrayBuffer();
  writeFileSync(zipPath, Buffer.from(buf));
  console.log(`Downloaded ${(buf.byteLength / 1024 / 1024).toFixed(1)} MB`);
}

// --- Extract ---
console.log("Extracting...");
execSync(`unzip -o "${zipPath}" -d "${extractDir}"`, { stdio: "pipe" });

const allFiles = readdirSync(extractDir);

function findFile(pattern) {
  const match = allFiles.find(f => pattern.test(f));
  if (!match) throw new Error(`Could not find file matching ${pattern}. Files: ${allFiles.join(", ")}`);
  return resolve(extractDir, match);
}

const windFilePath  = findFile(/3_2_Wind/i);
const ownerFilePath = findFile(/4.*Owner/i);

console.log(`Wind file:  ${windFilePath.split("/").pop()}`);
console.log(`Owner file: ${ownerFilePath.split("/").pop()}`);

// --- Parse helpers ---
function readFirstSheet(filePath) {
  const wb = xlsx.readFile(filePath, { cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  // EIA 860 files have a title row at row 0; real column headers are at row 1
  return xlsx.utils.sheet_to_json(ws, { defval: "", range: 1 });
}

function col(row, ...candidates) {
  for (const c of candidates) {
    if (row[c] !== undefined && row[c] !== "") return String(row[c]).trim();
  }
  return "";
}

function numCol(row, ...candidates) {
  for (const c of candidates) {
    const v = parseFloat(row[c]);
    if (!isNaN(v)) return v;
  }
  return 0;
}

// --- Parse wind generator file ---
// Build: companyStats[name] = { mw, plants: Set<plantCode> }
console.log("Parsing wind generator file...");
const windRows = readFirstSheet(windFilePath);

const companyStats = {};   // name → { mw, plants }
const windPlantCodes = new Set();

for (const row of windRows) {
  const name      = col(row, "Utility Name", "Operator Name", "Company Name");
  const plantCode = col(row, "Plant Code", "Plant ID", "Plant_Code");
  const mw        = numCol(row, "Nameplate Capacity (MW)", "Summer Capacity (MW)");

  if (!name) continue;
  if (!companyStats[name]) companyStats[name] = { mw: 0, plants: new Set() };
  companyStats[name].mw += mw;
  if (plantCode) {
    companyStats[name].plants.add(plantCode);
    windPlantCodes.add(plantCode);
  }
}

console.log(`  ${Object.keys(companyStats).length} operators, ${windPlantCodes.size} wind plant codes`);

// --- Parse owner file — add owners of wind plants ---
console.log("Parsing ownership file...");
const ownerRows = readFirstSheet(ownerFilePath);

for (const row of ownerRows) {
  const plantCode = col(row, "Plant Code", "Plant ID", "Plant_Code");
  if (!windPlantCodes.has(plantCode)) continue;

  const name = col(row, "Owner Name", "Ownership Name", "Company Name");
  if (!name) continue;
  if (!companyStats[name]) companyStats[name] = { mw: 0, plants: new Set() };
  companyStats[name].plants.add(plantCode);
  // Owners don't add to MW here (would double-count) — they're already in operator MW
}

// --- Serialise (Set → Array for JSON) ---
const serialisable = Object.fromEntries(
  Object.entries(companyStats).map(([name, { mw, plants }]) => [
    name,
    { mw: Math.round(mw * 10) / 10, plants: plants.size },
  ])
);

writeFileSync(jsonPath, JSON.stringify(serialisable, null, 2));
console.log(`  Company data written to: ${jsonPath}`);

// --- Remove obvious non-employers and sort ---
const SKIP = [
  /\bwapa\b/i,
  /\bbpa\b/i,
  /bonneville power/i,
  /western area power/i,
  /southwestern power/i,
  /southeastern power/i,
  /\btva\b/i,
  /tennessee valley/i,
  /test\b/i,
  /n\/a/i,
];

const sorted = Object.entries(serialisable)
  .filter(([name]) => name.length > 2 && !SKIP.some(re => re.test(name)))
  .sort((a, b) => b[1].mw - a[1].mw);   // sort by capacity descending

const header = [
  `# EIA Form 860 (${year}) — Wind Farm Operators & Owners`,
  `# ${sorted.length} unique companies, sorted by total installed capacity`,
  `# Generated: ${new Date().toISOString().slice(0, 10)}`,
  `# Source: ${EIA_URL}`,
  `# Columns: MW (nameplate), Plants`,
  "",
].join("\n");

const body = sorted.map(([name, { mw, plants }]) =>
  `${String(mw).padStart(8)} MW  ${String(plants).padStart(4)} plants  ${name}`
).join("\n");

writeFileSync(outPath, header + body + "\n");

console.log(`\nDone. ${sorted.length} companies written to:\n  ${outPath}`);
console.log("\nTop 20 by installed capacity:");
sorted.slice(0, 20).forEach(([name, { mw, plants }]) =>
  console.log(`  ${String(mw).padStart(8)} MW  ${name}`)
);
