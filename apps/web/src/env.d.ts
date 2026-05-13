/// <reference types="astro/client" />
/// <reference types="@cloudflare/workers-types" />

type CloudflareEnv = {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_KEY: string;
  RESEND_API_KEY: string;
  TURNSTILE_SECRET_KEY: string;
  TURNSTILE_SITE_KEY: string;
  CF_ACCOUNT_ID: string;
  CF_API_TOKEN: string;
  LOGODEV_TOKEN?: string;
  ANALYTICS: AnalyticsEngineDataset;
};

type Runtime = import("@astrojs/cloudflare").Runtime<CloudflareEnv>;

declare namespace App {
  interface Locals extends Runtime {
    niche: import("@owljobs/niches").NicheConfig;
    /** Populated by auth middleware when employer is signed in (JWT claim). */
    employerId?: string;
  }
}

interface Window {
  turnstile?: {
    reset: (widgetId?: string) => void;
    getResponse: (widgetId?: string) => string;
  };
}
