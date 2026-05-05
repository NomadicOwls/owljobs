import type { APIRoute } from "astro";
import { supabasePublic } from "../lib/supabase.js";
import { listFeedJobs, slugFromId } from "../lib/jobs.js";
import { getEnv } from "../lib/env.js";

export const GET: APIRoute = async ({ locals }) => {
  const { niche } = locals;
  const env = getEnv(locals);

  const db = supabasePublic(env);
  const jobs = await listFeedJobs(db, niche.supabaseSchema, 50);

  const baseUrl = `https://${niche.domain}`;

  const items = jobs.map((job) => {
    const slug = slugFromId(job.id);
    const jobUrl = `${baseUrl}/jobs/${slug}`;
    const employer = job.employers?.name ?? "";
    const location = [job.location, job.country].filter(Boolean).join(", ");

    return {
      id: jobUrl,
      url: jobUrl,
      title: `${job.title}${employer ? ` — ${employer}` : ""}`,
      summary: `${job.title}${employer ? ` at ${employer}` : ""}${location ? ` in ${location}` : ""}.`,
      date_published: job.posted_at ?? new Date().toISOString(),
      tags: location ? [location] : undefined,
    };
  });

  const feed = {
    version: "https://jsonfeed.org/version/1.1",
    title: `${niche.name} — ${niche.tagline}`,
    home_page_url: baseUrl,
    feed_url: `${baseUrl}/feed.json`,
    description: niche.tagline,
    items,
  };

  return Response.json(feed, {
    headers: {
      "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600",
    },
  });
};
