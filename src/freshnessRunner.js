const { getSites }            = require("./siteManager");
const { findStalePosts }      = require("./checkFreshness");
const { refreshPost }         = require("./refreshPost");
const { updateWordPress }     = require("./updateWordPress");
const { validateAndFixLinks } = require("./validateLinks");
const { injectFaqSchema }     = require("./faqSchema");
const { pingSitemap }         = require("./pingSitemap");

const POSTS_PER_SITE = parseInt(process.env.FRESHNESS_LIMIT ?? "2", 10);

/**
 * Scans each site for posts still anchored to an old year with no mention
 * of the current target year, and rewrites the worst offenders — separate
 * from the age-based refresh cycle, since a post can go stale content-wise
 * well before it turns 12 months old.
 */
async function runFreshnessSweep(siteName = null) {
  const allSites = getSites();
  const sites = siteName
    ? allSites.filter((s) => s.name.toLowerCase() === siteName.toLowerCase())
    : allSites;

  if (sites.length === 0) throw new Error(`No site found matching "${siteName}"`);
  console.log(`\n[Freshness] Processing: ${sites.map((s) => s.name).join(", ")}`);

  const results = [];

  for (const site of sites) {
    console.log(`\n── Freshness sweep: ${site.name} (${site.url}) ──────────────────────`);

    let stalePosts = [];
    try {
      stalePosts = (await findStalePosts(site)).slice(0, POSTS_PER_SITE);
    } catch (err) {
      console.error(`[Freshness:${site.name}] Failed to scan posts: ${err.message}`);
      results.push({ site: site.name, type: "freshness", success: false, error: err.message });
      continue;
    }

    if (stalePosts.length === 0) {
      console.log(`[Freshness:${site.name}] No stale-year posts found.`);
      results.push({ site: site.name, type: "freshness", success: true, refreshed: [] });
      continue;
    }

    console.log(`[Freshness:${site.name}] Refreshing ${stalePosts.length} stale post(s)...`);

    const refreshed = [];

    for (const stalePost of stalePosts) {
      try {
        const newContent = await refreshPost(stalePost, site.name);
        const { html, brokenExternalLinks } = await validateAndFixLinks(newContent.htmlContent, site);
        newContent.htmlContent = injectFaqSchema(html);
        const wpResult = await updateWordPress(stalePost.id, newContent, site);
        await pingSitemap(site);

        refreshed.push({
          postId:   stalePost.id,
          oldTitle: stalePost.title,
          newTitle: newContent.title,
          newSlug:  newContent.slug,
          postUrl:  wpResult.link,
          brokenExternalLinks,
          success:  true,
        });
      } catch (err) {
        console.error(`[Freshness:${site.name}] ❌ Post ${stalePost.id} failed: ${err.message}`);
        refreshed.push({ postId: stalePost.id, oldTitle: stalePost.title, success: false, error: err.message });
      }
    }

    results.push({ site: site.name, type: "freshness", success: true, refreshed });
  }

  return results;
}

module.exports = { runFreshnessSweep };
