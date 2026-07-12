/**
 * Fetches posts that were published more than 12 months ago
 * and haven't been refreshed recently (modified more than 30 days ago).
 * Returns up to `limit` posts, oldest-modified first.
 */
async function fetchOldPosts(site, limit = 5) {
  const credentials = Buffer.from(`${site.username}:${site.password.replace(/\s/g, "")}`).toString("base64");

  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);
  const cutoff = twelveMonthsAgo.toISOString();

  console.log(`[FetchOld:${site.name}] Looking for posts published before ${cutoff.split("T")[0]}...`);

  // Fetch up to 100 old posts, ordered by modified date ascending (least recently updated first)
  const url = new URL(`${site.url}/wp-json/wp/v2/posts`);
  url.searchParams.set("before",   cutoff);
  url.searchParams.set("orderby",  "modified");
  url.searchParams.set("order",    "asc");
  url.searchParams.set("per_page", "100");
  url.searchParams.set("status",   "publish");
  url.searchParams.set("_fields",  "id,title,content,excerpt,date,modified,categories,tags,slug,link");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Basic ${credentials}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[${site.name}] WP API ${res.status}: ${text.slice(0, 200)}`);
  }

  const posts = await res.json();
  console.log(`[FetchOld:${site.name}] Found ${posts.length} posts older than 12 months`);

  // Decode HTML entities in title
  return posts.slice(0, limit).map((p) => ({
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

module.exports = { fetchOldPosts };
