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

  // Soft-unsubscribe: preserve the row so email_sends FK remains valid AND
  // re-subscribe re-uses the existing row (RESEARCH Conflict 4 resolution).
  const { data, error } = await db
    .schema(niche.supabaseSchema)
    .from("subscribers")
    .update({ confirmed_at: null })
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

  // RFC 8058 one-click — soft-unsubscribe (D-20). Token comes from the URL query string,
  // never from the POST body (RFC 8058 §3.1: body is literally `List-Unsubscribe=One-Click`).
  // We deliberately do NOT branch on whether the token matched a row — returning the same
  // 200 OK either way prevents subscriber enumeration (T-03-01).
  await db
    .schema(niche.supabaseSchema)
    .from("subscribers")
    .update({ confirmed_at: null })
    .eq("unsubscribe_token", token);

  return new Response("OK", { status: 200 });
};
