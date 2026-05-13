import type { NicheConfig } from "@owljobs/niches";

const config: NicheConfig = {
  id: "wind-turbine",
  name: "Wind Turbine Jobs",
  tagline: "Wind Turbine Technician Jobs",
  domain: "mywindturbinejobs.com",
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
    // Ørsted — Trakstar adapter ABORTED 2026-05-11: orsted.hire.trakstar.com returned
    // "Inactive account — This employer is no longer using Trakstar Hire."
    // Ørsted is covered by Adzuna/JSearch aggregator queries ("wind turbine technician" etc.)
    // added in Plan 06. Revisit if Ørsted migrates to a public-API ATS.
    // {
    //   employer: "Ørsted",
    //   atsType: "trakstar",
    //   companySlug: "orsted",
    //   cronGroup: "every3h",
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
      // Uses SmartRecruiters — verified 2026-05-11 via SR public page:
      // careers.smartrecruiters.com/BoschRexroth (HTTP 200, confirmed real tenant)
      // 0 active postings at probe time (seasonal); companyId confirmed valid.
      // Note: SR adapter fetches all jobs; classifier filters wind-relevant roles.
    },
    // Enercon — SmartRecruiters NOT confirmed. SR public page (jobs.smartrecruiters.com/Enercon)
    // redirects to generic SR home (not a real SR tenant). Both "Enercon" and "ENERCON" fail.
    // Enercon (German OEM) appears to use a custom eRecruiting system at enercon.de/karriere.
    // DNS resolution failures prevented probing their domain directly — revisit in a future run.
    // Probe result 2026-05-11: SR API returns 200 (SR API returns 200 for ANY string).
    // DO NOT activate until SR public page confirms tenant or alternate ATS is identified.
    // {
    //   employer: "Enercon",
    //   atsType: "smartrecruiters",
    //   companyId: "Enercon",
    // },

    // ── Wave 3: gap closure additions (COVG-02) — 2026-05-11 ──────────────────
    {
      employer: "Vattenfall",
      atsType: "smartrecruiters",
      companyId: "Vattenfall",
      // Vattenfall uses SmartRecruiters via a branded careers portal.
      // Verified 2026-05-11: jobs.smartrecruiters.com/Vattenfall → careers.vattenfall.com
      // (SR-branded custom domain, confirmed real tenant). 299 active postings at probe time.
      // Large European wind developer/operator. SR adapter fetches all; classifier filters wind.
    },
    {
      employer: "RES Group",
      atsType: "greenhouse",
      boardToken: "res",
      // boards-api.greenhouse.io/v1/boards/res/jobs — verified 2026-05-11 (HTTP 200, 37 jobs)
      // RES Group (Renewable Energy Systems) is a leading independent wind/solar developer.
      // Operates wind farms across UK, US, France, Germany — wind technician roles year-round.
    },
    {
      employer: "Enertrag",
      atsType: "smartrecruiters",
      companyId: "enertrag",
      // Enertrag uses SmartRecruiters — verified 2026-05-11 via:
      // 1. SR public page: careers.smartrecruiters.com/enertrag (confirmed real tenant)
      // 2. SR API: api.smartrecruiters.com/v1/companies/enertrag/postings → 81 active jobs
      // 3. Careers page source: links to jobs.smartrecruiters.com/enertrag (confirmed)
      // Enertrag is a major German wind operator and developer. Pure wind company — no filter needed.
    },
    {
      employer: "RWE Renewables",
      atsType: "successfactors",
      careersBaseUrl: "https://jobs.rwe.com",
      searchText: "wind",
      // jobs.rwe.com (SuccessFactors) — verified 2026-05-11 via:
      // 1. Page source: <script src="https://performancemanager5.successfactors.eu/..."> confirmed SF
      // 2. ssoCompanyId:'rweProd', ssoUrl:'https://career5.successfactors.eu' found in page source
      // 3. jobs.rwe.com/search/?startrow=0 returns 25 data-row job listings
      // RWE is Europe's 2nd largest renewables operator; wind turbine roles posted year-round.
      // Use searchText:"wind" to pre-filter — RWE is diversified (coal phaseout, nuclear).
    },
    {
      employer: "EDP Group",
      atsType: "successfactors",
      careersBaseUrl: "https://jobs.edp.com",
      searchText: "wind",
      // jobs.edp.com (SuccessFactors) — verified 2026-05-11 via:
      // 1. jobs.edp.com/search/?startrow=0 returns 25 data-row listings
      // 2. Wind tech roles confirmed: "WIND TECHNICIAN I", "WIND TECHNICIAN II" visible in results
      // EDP Group is the parent of EDP Renováveis (EDPR), one of the world's largest wind operators.
      // Use searchText:"wind" to pre-filter — EDP has diversified energy portfolio.
    },
    {
      employer: "Acciona Energía",
      atsType: "smartrecruiters",
      companyId: "Acciona",
      // Acciona uses SmartRecruiters — verified 2026-05-11 via:
      // SR public page: careers.smartrecruiters.com/Acciona (confirmed real tenant)
      // 0 active postings at probe time (cyclical hiring); companyId confirmed valid.
      // Acciona Energía is one of the world's largest renewable energy companies (wind + solar).
      // SR adapter fetches all postings; classifier filters wind-relevant roles.
    },
    {
      employer: "Siemens Energy",
      atsType: "smartrecruiters",
      companyId: "SiemensEnergy",
      // Siemens Energy uses SmartRecruiters — verified 2026-05-11 via:
      // SR public page: careers.smartrecruiters.com/SiemensEnergy (confirmed real tenant)
      // 0 active postings at probe time; companyId confirmed valid.
      // Siemens Energy acquired Siemens Gamesa (SGRE) in 2023 — now the primary employer
      // for SGRE wind roles. SR adapter fetches all; classifier filters wind-relevant roles.
    },
    {
      employer: "ABB",
      atsType: "smartrecruiters",
      companyId: "ABB",
      // ABB uses SmartRecruiters — verified 2026-05-11 via:
      // SR public page: careers.smartrecruiters.com/ABB (confirmed real tenant)
      // 0 active postings at probe time; companyId confirmed valid.
      // ABB supplies power converters, pitch drives, and automation systems for wind turbines.
      // Major supplier to Vestas, SGRE, Nordex — relevant wind tech/service roles.
      // SR adapter fetches all postings; classifier filters wind-relevant roles.
    },
    {
      employer: "SSE Renewables",
      atsType: "smartrecruiters",
      companyId: "SSE",
      // SSE uses SmartRecruiters — verified 2026-05-11 via:
      // SR public page: careers.smartrecruiters.com/SSE (confirmed real tenant)
      // 0 active postings at probe time; companyId confirmed valid.
      // SSE Renewables operates 4GW+ of onshore and offshore wind across UK and Ireland.
      // SR adapter fetches all postings; classifier filters wind-relevant roles.
    },
    {
      employer: "Engie",
      atsType: "smartrecruiters",
      companyId: "Engie",
      // Engie uses SmartRecruiters — verified 2026-05-11 via:
      // SR public page: careers.smartrecruiters.com/Engie (confirmed real tenant)
      // 0 active postings at probe time; companyId confirmed valid.
      // Engie is one of the world's largest independent power producers with major wind portfolio.
      // SR adapter fetches all postings; classifier filters wind-relevant roles.
    },

    // ── Wave 3: Unconfirmed / blocked candidates — do not activate without probe ──
    // TotalEnergies (Workday wd3 tenant) — 422 CSRF wall on CXS API. All slug variants return 422.
    // The Workday CSRF wall means our adapter cannot retrieve jobs without a browser session.
    // Probe result 2026-05-11: totalenergies.wd3.myworkdayjobs.com confirmed to exist (406 on root)
    // but all CXS API calls return 422 (Unprocessable Entity) with empty message — CSRF required.
    // {
    //   employer: "TotalEnergies",
    //   atsType: "workday",
    //   tenant: "totalenergies",
    //   instance: "wd3",
    //   site: "TotalEnergies", // ← returns 422 CSRF wall; adapter cannot retrieve jobs
    //   searchText: "wind",
    // },
    // Equinor (Workday wd5 tenant) — 422 CSRF wall on all CXS API calls.
    // equinor.wd5.myworkdayjobs.com exists but all slug variants return 422.
    // Probe result 2026-05-11: Equinor_Careers, ExternalCareers, equinor all return 422.
    // {
    //   employer: "Equinor",
    //   atsType: "workday",
    //   tenant: "equinor",
    //   instance: "wd5",
    //   site: "Equinor_Careers", // ← returns 422 CSRF wall; adapter cannot retrieve jobs
    //   searchText: "wind",
    // },
    // Acciona (Workday wd3 tenant) — 422 CSRF wall. acciona.wd3.myworkdayjobs.com exists.
    // Already added as SR/Acciona (confirmed SR tenant above).
    // juwi AG — uses rexx-systems.com custom ATS. No public API adapter available.
    // wpd group — uses rexx-systems.com custom ATS. No public API adapter available.
    // Enercon — ATS unknown; SR NOT confirmed; enercon.de DNS resolution failed during probe.
    // Probe result 2026-05-11: both SR/Enercon and SR/ENERCON redirect to generic SR home.

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

  // SEO landing pages (Phase 4, D-18). Slug prefix is `${id}-jobs` per D-17.
  landingPages: [
    // ── US Wind Belt States ────────────────────────────────────────────────
    // Ordered by actual DB job count (queried 2026-05-13).
    // Note: US locations are stored as "City, County" — state name rarely
    // appears verbatim. Coverage improves as ATS location data standardizes.
    {
      slug: "wind-turbine-jobs-colorado",
      label: "Colorado",
      filters: { location: "Colorado" },
    },
    {
      slug: "wind-turbine-jobs-new-mexico",
      label: "New Mexico",
      filters: { location: "New Mexico" },
    },
    {
      slug: "wind-turbine-jobs-north-dakota",
      label: "North Dakota",
      filters: { location: "North Dakota" },
    },
    {
      slug: "wind-turbine-jobs-texas",
      label: "Texas",
      filters: { location: "Texas" },
    },
    {
      slug: "wind-turbine-jobs-kansas",
      label: "Kansas",
      filters: { location: "Kansas" },
    },
    {
      slug: "wind-turbine-jobs-iowa",
      label: "Iowa",
      filters: { location: "Iowa" },
    },
    {
      slug: "wind-turbine-jobs-nebraska",
      label: "Nebraska",
      filters: { location: "Nebraska" },
    },
    {
      slug: "wind-turbine-jobs-illinois",
      label: "Illinois",
      filters: { location: "Illinois" },
    },

    // ── Europe ─────────────────────────────────────────────────────────────
    // Only DE (263 jobs) and UK (43 jobs) have enough density.
    // France/Denmark/Sweden/Spain all have <6 jobs — deferred.
    {
      slug: "wind-turbine-jobs-germany",
      label: "Germany",
      filters: { location: "Deutschland" },
      // Deutsche Windtechnik, Enertrag, RWE store locations as "City, Deutschland"
    },
    {
      slug: "wind-turbine-jobs-united-kingdom",
      label: "United Kingdom",
      filters: { location: "UK" },
      // SSE, RES Group, Vattenfall store locations as "Region, UK"
    },

    // ── Specializations ────────────────────────────────────────────────────
    {
      slug: "blade-repair-technician-jobs",
      label: "Blade Repair Technicians",
      filters: { keywords: ["blade repair", "blade technician"] },
    },
    {
      slug: "wind-turbine-jobs-offshore-north-sea",
      label: "Offshore — North Sea",
      filters: { keywords: ["offshore"] },
    },
    {
      slug: "wind-turbine-jobs-offshore",
      label: "Offshore Wind Jobs",
      filters: { keywords: ["offshore"] },
    },
    {
      slug: "entry-level-wind-turbine-jobs",
      label: "Entry Level",
      filters: { keywords: ["entry level", "entry-level", "trainee", "apprentice"] },
    },
    {
      slug: "wind-turbine-jobs-high-voltage",
      label: "Electrical & High Voltage",
      filters: { keywords: ["high voltage", "HV", "electrical technician"] },
    },
    {
      slug: "wind-turbine-jobs-scada",
      label: "SCADA & Controls",
      filters: { keywords: ["SCADA", "controls", "PLC"] },
    },
  ],

  seoFooter:
    "All wind-turbine technician roles on this page are aggregated hourly from OEM, O&M, and operator ATS feeds. Subscribe to weekly alerts to receive new openings the moment we detect them.",

  branding: {
    primaryColor: "#1a6b3c",
    accentColor: "#2ecc71",
  },
};

export default config;
