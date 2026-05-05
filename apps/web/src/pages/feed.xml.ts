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
  const now = new Date().toUTCString();

  const items = jobs
    .map((job) => {
      const slug = slugFromId(job.id);
      const jobUrl = `${baseUrl}/jobs/${slug}`;
      const pubDate = job.posted_at ? new Date(job.posted_at).toUTCString() : now;
      const employer = job.employers?.name ?? "";
      const location = [job.location, job.country].filter(Boolean).join(", ");

      return `
    <item>
      <title><![CDATA[${job.title}${employer ? ` — ${employer}` : ""}]]></title>
      <link>${jobUrl}</link>
      <guid isPermaLink="true">${jobUrl}</guid>
      <pubDate>${pubDate}</pubDate>
      ${location ? `<category><![CDATA[${location}]]></category>` : ""}
      <description><![CDATA[${job.title}${employer ? ` at ${employer}` : ""}${location ? ` in ${location}` : ""}. Apply on ${niche.name}.]]></description>
    </item>`;
    })
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title><![CDATA[${niche.name} — ${niche.tagline}]]></title>
    <link>${baseUrl}</link>
    <description><![CDATA[${niche.tagline} from ${niche.name}, updated hourly.]]></description>
    <language>en</language>
    <lastBuildDate>${now}</lastBuildDate>
    <atom:link href="${baseUrl}/feed.xml" rel="self" type="application/rss+xml"/>
    <ttl>15</ttl>
    ${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600",
    },
  });
};
