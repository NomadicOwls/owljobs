import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../lib/supabase.js";
import { getEnv } from "../../lib/env.js";

export const GET: APIRoute = async ({ locals, url }) => {
  const { niche } = locals;
  const env = getEnv(locals);

  const token = url.searchParams.get("token");
  if (!token) {
    return new Response("Missing confirmation token.", { status: 400 });
  }

  const db = supabaseAdmin(env);

  const { data, error } = await db
    .schema(niche.supabaseSchema)
    .from("subscribers")
    .update({ confirmed_at: new Date().toISOString(), confirmation_token: null })
    .eq("confirmation_token", token)
    .select("id")
    .single();

  if (error || !data) {
    return new Response("Invalid or expired confirmation link.", { status: 400 });
  }

  return Response.redirect(`https://${niche.domain}/?confirmed=1`, 302);
};
