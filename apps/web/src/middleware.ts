import { defineMiddleware } from "astro:middleware";
import { nicheFromHost, getAllNiches } from "~/lib/niches";

export const onRequest = defineMiddleware(async (ctx, next) => {
  const host = ctx.request.headers.get("host") ?? "";
  let niche;
  try {
    niche = nicheFromHost(host);
  } catch {
    niche = getAllNiches()[0]!;
  }
  ctx.locals.niche = niche;
  return next();
});
