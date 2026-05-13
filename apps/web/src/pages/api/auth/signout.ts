import type { APIContext } from "astro";
import { getEnv } from "../../../lib/env.js";
import { createSupabaseServerClient } from "../../../lib/supabase.js";

export async function GET({ request, locals }: APIContext) {
  const env = getEnv(locals);
  const responseHeaders = new Headers();
  const supabase = createSupabaseServerClient(
    env,
    request.headers.get("cookie"),
    responseHeaders,
  );
  await supabase.auth.signOut();
  const headers = new Headers({ Location: "/" });
  responseHeaders.forEach((value, key) => headers.append(key, value));
  return new Response(null, { status: 302, headers });
}
