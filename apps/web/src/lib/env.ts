type CloudflareEnv = {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_KEY: string;
  RESEND_API_KEY: string;
  TURNSTILE_SECRET_KEY: string;
  TURNSTILE_SITE_KEY: string;
};

/**
 * Returns env vars from whichever runtime is available:
 * - Cloudflare Pages (prod/preview): Astro.locals.runtime.env
 * - astro dev (macOS 12, platformProxy disabled): import.meta.env
 */
export function getEnv(locals: App.Locals): CloudflareEnv {
  const runtime = (locals as { runtime?: { env?: Partial<CloudflareEnv> } }).runtime;
  if (runtime?.env?.SUPABASE_URL) {
    return runtime.env as CloudflareEnv;
  }
  return {
    SUPABASE_URL: import.meta.env["SUPABASE_URL"] ?? "",
    SUPABASE_ANON_KEY: import.meta.env["SUPABASE_ANON_KEY"] ?? "",
    SUPABASE_SERVICE_KEY: import.meta.env["SUPABASE_SERVICE_KEY"] ?? "",
    RESEND_API_KEY: import.meta.env["RESEND_API_KEY"] ?? "",
    TURNSTILE_SECRET_KEY: import.meta.env["TURNSTILE_SECRET_KEY"] ?? "",
    TURNSTILE_SITE_KEY: import.meta.env["TURNSTILE_SITE_KEY"] ?? "",
  };
}
