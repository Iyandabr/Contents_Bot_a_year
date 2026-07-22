/**
 * Pings Google to recrawl the sitemap after new/updated content — the
 * official, unrestricted way to nudge indexing for any content type
 * (unlike the Indexing API, which Google's terms restrict to Job/Livestream
 * pages and would require elevating the service account to Owner access).
 * Best-effort: never throws, a failed ping shouldn't fail a publish run.
 */
async function pingSitemap(site) {
  const sitemapUrl = site.sitemapUrl ?? `${site.url}/sitemap_index.xml`;

  try {
    const res = await fetch(`https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      console.log(`[SitemapPing:${site.name}] ✅ Pinged Google for ${sitemapUrl}`);
    } else {
      console.warn(`[SitemapPing:${site.name}] Ping returned ${res.status} for ${sitemapUrl}`);
    }
  } catch (err) {
    console.warn(`[SitemapPing:${site.name}] Failed: ${err.message}`);
  }
}

module.exports = { pingSitemap };
