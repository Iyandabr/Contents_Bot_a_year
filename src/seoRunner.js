const { getSites }                    = require("./siteManager");
const { auditPostSeo, applySeoUpdate } = require("./seoAgent");

const SEO_LIMIT = parseInt(process.env.SEO_LIMIT ?? "2", 10);

/**
 * Targets the oldest published posts and improves their SEO metadata.
 * Skips posts whose SEO is already strong (score >= 7/10).
 * Runs daily at midnight BST — gradually improves all old content over time.
 */
async function runSeo(siteName = null) {
  const allSites = getSites();
  const sites = siteName
    ? allSites.filter((s) => s.name.toLowerCase() === siteName.toLowerCase())
    : allSites;

  if (sites.length === 0) throw new Error(`No site found matching "${siteName}"`);
  console.log(`\n[SEO] Processing: ${sites.map((s) => s.name).join(", ")}`);

  const results = [];

  for (const site of sites) {
    console.log(`\n── SEO Audit: ${site.name} (${site.url}) ──────────────────────`);

    const credentials = Buffer.from(`${site.username}:${site.password.replace(/\s/g, "")}`).toString("base64");

    // Fetch oldest posts first — SEO agent cycles through old content over time
    let posts = [];
    try {
      const res = await fetch(
        `${site.url}/wp-json/wp/v2/posts?per_page=${SEO_LIMIT}&orderby=date&order=asc&status=publish&_fields=id,title,content,excerpt,tags,link`,
        { headers: { Authorization: `Basic ${credentials}` } }
      );
      if (!res.ok) throw new Error(`WP API ${res.status}`);
      posts = await res.json();
    } catch (err) {
      console.error(`[SEO:${site.name}] Failed to fetch posts: ${err.message}`);
      results.push({ site: site.name, type: "seo", success: false, error: err.message });
      continue;
    }

    if (posts.length === 0) {
      console.log(`[SEO:${site.name}] No posts found.`);
      results.push({ site: site.name, type: "seo", success: true, audited: [] });
      continue;
    }

    console.log(`[SEO:${site.name}] Auditing ${posts.length} old post(s)...`);

    const audited = [];

    for (const post of posts) {
      const title = post.title?.rendered ?? post.title ?? `ID ${post.id}`;
      try {
        console.log(`[SEO:${site.name}] Checking: "${title}"`);
        const audit = await auditPostSeo(post, site.name);

        if (audit.skip) {
          console.log(`[SEO:${site.name}] ✅ Score ${audit.score}/10 — SEO already strong, skipping: "${title}"`);
          audited.push({ postId: post.id, title, score: audit.score, updated: false });
          continue;
        }

        await applySeoUpdate(post.id, audit, site);
        console.log(`[SEO:${site.name}] 🔧 Score was ${audit.score}/10 — updated → "${audit.title}" | keyphrase: "${audit.focusKeyphrase}"`);
        audited.push({ postId: post.id, oldTitle: title, newTitle: audit.title, score: audit.score, keyphrase: audit.focusKeyphrase, updated: true });
      } catch (err) {
        console.error(`[SEO:${site.name}] ❌ Post ${post.id} failed: ${err.message}`);
        audited.push({ postId: post.id, title, updated: false, error: err.message });
      }
    }

    results.push({ site: site.name, type: "seo", success: true, audited });
  }

  return results;
}

module.exports = { runSeo };
