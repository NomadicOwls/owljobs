import type { APIRoute } from "astro";
import { getEnv } from "../lib/env.js";

export const GET: APIRoute = async ({ locals }) => {
  const { niche } = locals;
  getEnv(locals);

  const baseUrl = `https://${niche.domain}`;

  const staticUrls = [
    { loc: baseUrl, changefreq: "hourly", priority: "1.0" },
    { loc: `${baseUrl}/jobs`, changefreq: "hourly", priority: "0.9" },
    { loc: `${baseUrl}/privacy`, changefreq: "yearly", priority: "0.3" },
    { loc: `${baseUrl}/terms`, changefreq: "yearly", priority: "0.3" },
  ];

  const landingUrls = (niche.landingPages ?? []).map(
    (page) => `  <url>
    <loc>${baseUrl}/${page.slug}</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`,
  );

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
${landingUrls.join("\n")}
</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600",
    },
  });
};
