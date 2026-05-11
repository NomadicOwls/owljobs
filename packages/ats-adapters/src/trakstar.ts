/**
 * Trakstar adapter — ABORTED per D-10 + Pitfall 7.
 *
 * Probe of https://orsted.hire.trakstar.com on 2026-05-11 found:
 * "Inactive account — This employer is no longer using Trakstar Hire
 * to collect applications." The Ørsted Trakstar account is defunct.
 * The page returned HTTP 200 but contained no job data, no __NEXT_DATA__,
 * no __INITIAL_STATE__, and no parseable job listing. The canonical URL
 * even redirected to https://recruiterbox.com/inactive-ats.
 *
 * Fallback: Ørsted is covered by Adzuna/JSearch "Ørsted wind turbine"
 * aggregator queries added in Plan 06 (niches/wind-turbine.ts aggregatorQueries).
 * Revisit if Ørsted migrates to a public-API ATS.
 *
 * T-02-15 (Repudiation — abort decision documented): probe result above
 * satisfies the mitigation requirement.
 */
import type { TrakstarTarget } from "@owljobs/niches";
import type { AdaptedJob } from "./workday.js";

export { AdaptedJob };

export class TrakstarAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TrakstarAdapterError";
  }
}

/**
 * Trakstar adapter stub — Ørsted Trakstar account is inactive (confirmed 2026-05-11).
 * Returns [] so the ingest pipeline completes cleanly without upserts.
 * Ørsted is covered by Adzuna/JSearch aggregator queries.
 */
export async function fetchAllTrakstarJobs(
  _target: TrakstarTarget
): Promise<AdaptedJob[]> {
  console.warn(
    "[trakstar] Adapter aborted — Ørsted Trakstar account is inactive (orsted.hire.trakstar.com shows 'Inactive account'). Ørsted covered by Adzuna/JSearch aggregator."
  );
  return [];
}
