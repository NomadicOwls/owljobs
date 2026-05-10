import { fetchWorkdayJobDescription } from "@owljobs/ats-adapters/workday";
import { fetchSuccessFactorsJobDescription } from "@owljobs/ats-adapters/successfactors";
import { fetchRecruiteeJobDescription } from "@owljobs/ats-adapters/recruitee";

export interface DescriptionRow {
  id: string;
  canonical_url: string;
  employers: {
    ats_type: string;
    ats_tenant: string | null;
    ats_instance: string | null;
    ats_site: string | null;
  };
}

export async function fetchDescription(row: DescriptionRow): Promise<string | null> {
  const { ats_type, ats_tenant, ats_instance, ats_site } = row.employers;

  if (ats_type === "workday" && ats_tenant && ats_instance && ats_site) {
    // canonical_url: https://{tenant}.{instance}.myworkdayjobs.com/{site}/job/...
    // externalPath = /job/... (everything after /{site})
    const basePrefix = `https://${ats_tenant}.${ats_instance}.myworkdayjobs.com/${ats_site}`;
    if (!row.canonical_url.startsWith(basePrefix)) return null;
    const externalPath = row.canonical_url.slice(basePrefix.length);

    return fetchWorkdayJobDescription(
      { employer: "", atsType: "workday", tenant: ats_tenant, instance: ats_instance, site: ats_site },
      externalPath
    );
  }

  if (ats_type === "successfactors") {
    return fetchSuccessFactorsJobDescription(row.canonical_url);
  }

  if (ats_type === "recruitee") {
    return fetchRecruiteeJobDescription(row.canonical_url);
  }

  // Greenhouse / softgarden: descriptions set eagerly at ingest from API response; no re-fetch needed.
  return null;
}
