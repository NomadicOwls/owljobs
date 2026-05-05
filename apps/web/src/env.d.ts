/// <reference types="astro/client" />

type CloudflareEnv = {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_KEY: string;
  RESEND_API_KEY: string;
  TURNSTILE_SECRET_KEY: string;
  TURNSTILE_SITE_KEY: string;
};

type Runtime = import("@astrojs/cloudflare").Runtime<CloudflareEnv>;

declare namespace App {
  interface Locals extends Runtime {
    niche: import("@owljobs/niches").NicheConfig;
  }
}

interface Window {
  turnstile?: {
    reset: (widgetId?: string) => void;
    getResponse: (widgetId?: string) => string;
  };
}
