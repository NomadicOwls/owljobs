import type { APIRoute } from "astro";
import { supabasePublic } from "../lib/supabase.js";
import { listSitemapJobs, slugFromId } from "../lib/jobs.js";
import { getEnv } from "../lib/env.js";

export const GET: APIRoute = async ({ locals }) => {
  const { niche } = locals;
  const env = getEnv(locals);

  const db = supabasePublic(env);
  const jobs = await listSitemapJobs(db, niche.supabaseSchema);

  const baseUrl = `https://${niche.domain}`;

  const staticUrls = [
    { loc: baseUrl, changefreq: "hourly", priority: "1.0" },
    { loc: `${baseUrl}/jobs`, changefreq: "hourly", priority: "0.9" },
    { loc: `${baseUrl}/privacy`, changefreq: "yearly", priority: "0.3" },
    { loc: `${baseUrl}/terms`, changefreq: "yearly", priority: "0.3" },
  ];

  const jobUrls = jobs.map((job) => {
    const slug = slugFromId(job.id);
    const lastmod = new Date(job.updated_at).toISOString().split("T")[0] ?? new Date().toISOString().split("T")[0];
    return `  <url>
    <loc>${baseUrl}/jobs/${slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
  });

  const staticXml = staticUrls
    .map(
      (u) => `  <url>
    <loc>${u.loc}</loc>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`,
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticXml}
${jobUrls.join("\n")}
</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600",
    },
  });
};
