const { getSites }            = require("./siteManager");
const { fetchOldPosts }       = require("./fetchOldPosts");
const { refreshPost }         = require("./refreshPost");
const { updateWordPress }     = require("./updateWordPress");
const { validateAndFixLinks } = require("./validateLinks");
const { injectFaqSchema }     = require("./faqSchema");
const { pingSitemap }         = require("./pingSitemap");

const POSTS_PER_SITE = parseInt(process.env.REFRESH_LIMIT ?? "2", 10); // default 2 to stay within 120s

/**
 * Every 12 hours: picks the oldest-modified posts per site and refreshes them.
 * Updated posts get today's date so they pop to the top as new.
 */
async function runRefresh(siteName = null) {
  const allSites = getSites();
  const sites = siteName
    ? allSites.filter((s) => s.name.toLowerCase() === siteName.toLowerCase())
    : allSites;

  if (sites.length === 0) throw new Error(`No site found matching "${siteName}"`);
  console.log(`\n[Refresh] Processing: ${sites.map((s) => s.name).join(", ")}`);

  const results = [];

  for (const site of sites) {
    console.log(`\n── Refresh: ${site.name} (${site.url}) ──────────────────────`);

    let oldPosts = [];
    try {
      oldPosts = await fetchOldPosts(site, POSTS_PER_SITE);
    } catch (err) {
      console.error(`[Refresh:${site.name}] Failed to fetch old posts: ${err.message}`);
      results.push({ site: site.name, type: "refresh", success: false, error: err.message });
      continue;
    }

    if (oldPosts.length === 0) {
      console.log(`[Refresh:${site.name}] No posts older than 12 months found.`);
      results.push({ site: site.name, type: "refresh", success: true, refreshed: [] });
      continue;
    }

    console.log(`[Refresh:${site.name}] Refreshing ${oldPosts.length} post(s)...`);

    const refreshed = [];

    for (const oldPost of oldPosts) {
      try {
        const newContent = await refreshPost(oldPost, site.name);
        const { html, brokenExternalLinks } = await validateAndFixLinks(newContent.htmlContent, site);
        newContent.htmlContent = injectFaqSchema(html);
        const wpResult   = await updateWordPress(oldPost.id, newContent, site);
        await pingSitemap(site);

        refreshed.push({
          postId:   oldPost.id,
          oldTitle: oldPost.title,
          newTitle: newContent.title,
          newSlug:  newContent.slug,
          postUrl:  wpResult.link,
          brokenExternalLinks,
          success:  true,
        });
      } catch (err) {
        console.error(`[Refresh:${site.name}] ❌ Post ${oldPost.id} failed: ${err.message}`);
        refreshed.push({ postId: oldPost.id, oldTitle: oldPost.title, success: false, error: err.message });
      }
    }

    results.push({ site: site.name, type: "refresh", success: true, refreshed });
  }

  return results;
}

module.exports = { runRefresh };
