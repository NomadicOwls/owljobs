import type { NicheConfig } from "@owljobs/niches";

const config: NicheConfig = {
  id: "wind-turbine",
  name: "Wind Turbine Jobs",
  tagline: "Wind Turbine Technician Jobs",
  domain: "windturbinejobs.com",
  supabaseSchema: "wind_turbine",

  atsTargets: [
    // ── Wave 0 (original) ─────────────────────────────────────────────────────
    {
      employer: "GE Vernova",
      atsType: "workday",
      tenant: "gevernova",
      instance: "wd5",
      site: "Vernova_ExternalSite",
    },
    {
      employer: "Vestas",
      atsType: "successfactors",
      careersBaseUrl: "https://careers.vestas.com",
      // Pure wind company — fetch all roles, let classifier filter
    },
    {
      employer: "NextEra Energy",
      atsType: "successfactors",
      careersBaseUrl: "https://jobs.nexteraenergy.com",
      searchText: "wind", // Pre-filter: large diversified utility — nuclear/solar/gas noise
    },

    // ── Wave 1: OEMs ──────────────────────────────────────────────────────────
    // Siemens Gamesa / Siemens Energy: SGRE was fully acquired by Siemens Energy in 2023.
    // siemensgamesa.wd3/SGRE is empty (200, 0 jobs — tenant migrated).
    // New portal: jobs.siemens-energy.com → Workday but CXS API returns 401 (private tenant).
    // Option: Adzuna/JSearch aggregator as interim, or contact SE for a data feed.
    // {
    //   employer: "Siemens Energy (ex-SGRE)",
    //   atsType: "workday",
    //   tenant: "siemensenergy",
    //   instance: "wd3",
    //   site: "SE_External_Staff_Careers", // ← returns 401, not public
    // },
    {
      employer: "Nordex",
      atsType: "successfactors",
      careersBaseUrl: "https://jobs.nordex-online.com",
      // jobs.nordex-online.com (not careers.nordex-online.com which is dead) — confirmed live SF portal
    },

    // ── Wave 1: OEMs — needs careers-page verification before activating ──────
    // Goldwind: https://en.goldwind.com/en/careers/ — likely custom ATS, skip for now
    // Suzlon: https://careers.suzlon.com — may be Workday; verify

    // ── Wave 1: O&M contractors ───────────────────────────────────────────────
    // Quanta Services uses iCIMS (careers-quanta.icims.com) — NOT Workday. Adapter needed before activating.
    // {
    //   employer: "Quanta Services",
    //   atsType: "icims",
    //   tenant: "careers-quanta",
    //   searchText: "wind",
    // },
    {
      employer: "Blattner Energy",
      atsType: "workday",
      tenant: "blattner",
      instance: "wd5",
      site: "BlattnerEnergy",
      searchText: "wind",
      // blattner.wd5.myworkdayjobs.com/BlattnerEnergy — confirmed from careers page
      // BlattnerCompany site covers corporate roles; BlattnerEnergy covers field/project work
    },

    // ── Wave 1: O&M — needs new adapter (Emply) ───────────────────────────────
    // TODO: Semco Maritime — https://semcomaritime.career.emply.com/vacancies — Emply ATS, adapter needed

    // ── Wave 1: Operators ─────────────────────────────────────────────────────
    // Ørsted: does NOT use Workday. ATS is Trakstar (orsted.hire.trakstar.com).
    // Trakstar has no public JSON/REST API — SPA, requires headless browser or auth token.
    // Option: build a Trakstar adapter, or use Adzuna/JSearch as interim.
    // {
    //   employer: "Ørsted",
    //   atsType: "trakstar", // adapter does not exist yet
    //   companySlug: "orsted",
    // },
    {
      employer: "Invenergy",
      atsType: "workday",
      tenant: "invenergyllc",
      instance: "wd1",
      site: "invenergycareers",
      searchText: "wind",
      // invenergyllc.wd1.myworkdayjobs.com/invenergycareers — confirmed
      // Invenergy is the largest private wind developer in the US
    },
    {
      employer: "Avangrid Renewables",
      atsType: "workday",
      tenant: "iberdrola",
      instance: "wd3",
      site: "Iberdrola",
      searchText: "wind",
      // Avangrid jobs are posted on the parent Iberdrola Workday tenant
      // appliedFacets narrows to Avangrid US (subholding ID confirmed from career portal URL)
      appliedFacets: {
        // Workday expects array values for facets, not strings
        ZCF_HCM_EEB_Subholding_Job_Posting_Anchor_Extended: ["59c5d91f3d96100fc6c399067e2d0001"],
      },
    },

    // ── Wave 1: O&M / global (new adapters) ──────────────────────────────────
    {
      employer: "Global Wind Service",
      atsType: "recruitee",
      companySlug: "globalwindservice",
      // globalwindservice.recruitee.com/api/offers/ — confirmed live, ~10 active positions
    },
    {
      employer: "Deutsche Windtechnik",
      atsType: "softgarden",
      feedUrl: "https://jobs-global.deutsche-windtechnik.com/jobs.feed.json",
      // 216 active jobs, Schema.org DataFeed format, descriptions included inline
      // Jobs span DE/FR/NL/PL/SE/UK/US — classifier filters to wind-relevant roles
    },

    // ── Wave 2: SmartRecruiters (D-09) ──
    {
      employer: "Bosch Rexroth",
      atsType: "smartrecruiters",
      companyId: "BoschRexroth",
      // Bosch Rexroth wind division provides pitch control and hydraulic systems for turbines.
      // Uses SmartRecruiters (careers.boschrexroth.com redirects to jobs.smartrecruiters.com/BoschRexroth).
      // NOTE: live verification deferred per no-live-probe constraint; validate via Plan 08 discovery
      // or production ingest logs. If 404, companyId may need adjustment to "Rexroth" or "bosch-rexroth".
    },
    {
      employer: "Enercon",
      atsType: "smartrecruiters",
      companyId: "Enercon",
      // Enercon is a major German wind turbine OEM (5th largest globally by installed capacity).
      // Uses SmartRecruiters (enercon.de/karriere links to jobs.smartrecruiters.com/Enercon).
      // NOTE: live verification deferred per no-live-probe constraint; validate via Plan 08 discovery
      // or production ingest logs. If 404, companyId may need adjustment to "ENERCON".
    },

    // ── Wave 2: Adzuna aggregator (D-05, COVG-03) — per-country, queries fanned out via niche.aggregatorQueries ──
    {
      employer: "adzuna",
      atsType: "adzuna",
      country: "us",
    },
    {
      employer: "adzuna",
      atsType: "adzuna",
      country: "gb",
    },
    {
      employer: "adzuna",
      atsType: "adzuna",
      country: "de",
    },
    {
      employer: "adzuna",
      atsType: "adzuna",
      country: "nl",
    },
    {
      employer: "adzuna",
      atsType: "adzuna",
      country: "dk",
    },

    // ── Wave 2: JSearch fallback (D-06) — single global target ──
    {
      employer: "jsearch",
      atsType: "jsearch",
    },
  ],

  aggregatorQueries: [
    "wind turbine technician",
    "wind energy technician",
    "WTG technician",
    "wind turbine service technician",
    "wind O&M technician",
    "wind turbine field service",
    "wind turbine maintenance",
  ],

  classificationPrompt:
    "Is this job primarily focused on wind turbine operations, maintenance, or field service? Answer YES or NO only.",

  classificationExemplars: {
    positive: [
      "Wind Turbine Technician",
      "WTG Field Service Engineer",
      "Wind Energy O&M Technician",
      "Wind Turbine Service Tech II",
      "Senior Wind Technician",
      "Wind Farm Operations Lead",
    ],
    negative: [
      "Solar Panel Installer",
      "Software Engineer",
      "Sales Manager",
      "HR Business Partner",
      "Project Manager",
      "Accounting Analyst",
    ],
  },

  branding: {
    primaryColor: "#1a6b3c",
    accentColor: "#2ecc71",
  },
};

export default config;
