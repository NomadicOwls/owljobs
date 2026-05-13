import { defineMiddleware } from "astro:middleware";
import { nicheFromHost, getAllNiches } from "~/lib/niches";
import { createSupabaseServerClient } from "./lib/supabase.js";
import { getEnv } from "./lib/env.js";

export const onRequest = defineMiddleware(async (ctx, next) => {
  const host = ctx.request.headers.get("host") ?? "";
  let niche;
  try {
    niche = nicheFromHost(host);
  } catch {
    niche = getAllNiches()[0]!;
  }
  ctx.locals.niche = niche;

  // PROF-03: SSR session for every request. responseHeaders captures
  // Set-Cookie writes from @supabase/ssr (refresh tokens, etc.) and is
  // merged into the final response below.
  const env = getEnv(ctx.locals);
  const responseHeaders = new Headers();
  const supabase = createSupabaseServerClient(
    env,
    ctx.request.headers.get("cookie"),
    responseHeaders,
  );
  try {
    const { data } = await supabase.auth.getSession();
    ctx.locals.session = data.session ?? null;
    const employerId =
      (data.session?.user?.app_metadata as Record<string, unknown> | undefined)
        ?.employer_id;
    ctx.locals.employerId =
      typeof employerId === "string" && employerId.length > 0 ? employerId : null;
  } catch {
    ctx.locals.session = null;
    ctx.locals.employerId = null;
  }

  const response = await next();
  // WR-04: only forward Set-Cookie — don't blindly propagate any future SDK headers
  responseHeaders.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") response.headers.append(key, value);
  });
  return response;
});
