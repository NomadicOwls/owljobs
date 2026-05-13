import { createClient } from "@supabase/supabase-js";
import { createServerClient, parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";

interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_KEY: string;
}

export function supabasePublic(env: Env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
}

export function supabaseAdmin(env: Env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
}

/**
 * SSR-safe Supabase client for Pages Functions and SSR pages.
 *
 * Reads the incoming Cookie request header via parseCookieHeader (Pitfall 6 — NOT cookies.headers()).
 * Writes Set-Cookie via the provided responseHeaders, which the middleware propagates to the final
 * outgoing Response.
 *
 * Cookie adapter shape is getAll/setAll per @supabase/ssr ^0.10 (NOT legacy get/set/remove — Pitfall 3).
 */
export function createSupabaseServerClient(
  env: { SUPABASE_URL: string; SUPABASE_ANON_KEY: string },
  cookieHeader: string | null,
  responseHeaders: Headers,
) {
  return createServerClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return parseCookieHeader(cookieHeader ?? "").map((c) => ({
          name: c.name,
          value: c.value ?? "",
        }));
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          responseHeaders.append(
            "Set-Cookie",
            serializeCookieHeader(name, value, options),
          );
        }
      },
    },
  });
}
