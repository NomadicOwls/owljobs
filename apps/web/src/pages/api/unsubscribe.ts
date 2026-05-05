import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../lib/supabase.js";
import { getEnv } from "../../lib/env.js";

export const GET: APIRoute = async ({ locals, url }) => {
  const { niche } = locals;
  const env = getEnv(locals);

  const token = url.searchParams.get("token");
  if (!token) {
    return new Response("Missing unsubscribe token.", { status: 400 });
  }

  const db = supabaseAdmin(env);

  const { data, error } = await db
    .schema(niche.supabaseSchema)
    .from("subscribers")
    .delete()
    .eq("unsubscribe_token", token)
    .select("email")
    .single();

  if (error || !data) {
    return new Response(
      `<!doctype html><html lang="en"><head><meta charset="UTF-8"><title>Already unsubscribed</title></head>
      <body style="font-family:sans-serif;max-width:480px;margin:4rem auto;padding:0 1rem;text-align:center">
        <h1 style="font-size:1.5rem">Already unsubscribed</h1>
        <p>This link has already been used or is invalid.</p>
        <a href="/" style="color:#1a6b3c">← Back to ${niche.name}</a>
      </body></html>`,
      { status: 200, headers: { "Content-Type": "text/html" } },
    );
  }

  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="UTF-8"><title>Unsubscribed</title></head>
    <body style="font-family:sans-serif;max-width:480px;margin:4rem auto;padding:0 1rem;text-align:center">
      <h1 style="font-size:1.5rem">You're unsubscribed</h1>
      <p>You've been removed from ${niche.name} job alerts. You won't receive any more emails.</p>
      <a href="/" style="color:#1a6b3c">← Back to ${niche.name}</a>
    </body></html>`,
    { status: 200, headers: { "Content-Type": "text/html" } },
  );
};

// RFC 8058 List-Unsubscribe-Post one-click
export const POST: APIRoute = async ({ locals, url }) => {
  const { niche } = locals;
  const env = getEnv(locals);

  const token = url.searchParams.get("token");
  if (!token) return new Response("Missing token.", { status: 400 });

  const db = supabaseAdmin(env);

  await db
    .schema(niche.supabaseSchema)
    .from("subscribers")
    .delete()
    .eq("unsubscribe_token", token);

  return new Response("OK", { status: 200 });
};
