const { getTargetYear } = require("./targetYear");

/**
 * Finds published posts whose content is anchored to an old year
 * (e.g. "DV Lottery 2024 Registration") and never mentions the current
 * target year at all — a stronger staleness signal than post age alone,
 * since a 3-month-old post can already be talking about last year's deadline.
 */
async function findStalePosts(site, { limit = 100 } = {}) {
  const credentials = Buffer.from(`${site.username}:${site.password.replace(/\s/g, "")}`).toString("base64");
  const targetYear   = getTargetYear();
  const staleYears   = [targetYear - 1, targetYear - 2, targetYear - 3];

  const url = new URL(`${site.url}/wp-json/wp/v2/posts`);
  url.searchParams.set("per_page", String(limit));
  url.searchParams.set("orderby",  "modified");
  url.searchParams.set("order",    "asc"); // least-recently-touched first
  url.searchParams.set("status",   "publish");
  url.searchParams.set("_fields",  "id,title,content,excerpt,date,modified,categories,tags,slug,link");

  const res = await fetch(url.toString(), { headers: { Authorization: `Basic ${credentials}` } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[${site.name}] WP API ${res.status}: ${text.slice(0, 200)}`);
  }

  const posts = await res.json();
  console.log(`[Freshness:${site.name}] Scanning ${posts.length} post(s) for outdated year references...`);

  const stale = posts.filter((p) => {
    const text = `${p.title?.rendered ?? ""} ${p.content?.rendered ?? ""}`;
    const yearsMentioned = [...text.matchAll(/\b(20\d{2})\b/g)].map((m) => Number(m[1]));
    if (yearsMentioned.length === 0) return false;

    const mentionsStaleYear   = yearsMentioned.some((y) => staleYears.includes(y));
    const mentionsCurrentYear = yearsMentioned.includes(targetYear);
    return mentionsStaleYear && !mentionsCurrentYear;
  });

  console.log(`[Freshness:${site.name}] Found ${stale.length} post(s) still anchored to ${staleYears.join("/")} with no ${targetYear} mention`);

  return stale.map((p) => ({
    id:         p.id,
    title:      decodeEntities(p.title?.rendered ?? ""),
    content:    p.content?.rendered ?? "",
    excerpt:    p.excerpt?.rendered ?? "",
    date:       p.date,
    modified:   p.modified,
    categories: p.categories ?? [],
    tags:       p.tags ?? [],
    slug:       p.slug,
    link:       p.link,
  }));
}

function decodeEntities(str) {
  return str
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

module.exports = { findStalePosts };
