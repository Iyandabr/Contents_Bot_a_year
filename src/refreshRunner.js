const { getSites }       = require("./siteManager");
const { fetchOldPosts }  = require("./fetchOldPosts");
const { refreshPost }    = require("./refreshPost");
const { updateWordPress } = require("./updateWordPress");

const POSTS_PER_SITE = parseInt(process.env.REFRESH_LIMIT ?? "3", 10); // 2–5, default 3

/**
 * Every 12 hours: picks the oldest-modified posts per site and refreshes them.
 * Updated posts get today's date so they pop to the top as new.
 */
async function runRefresh() {
  const sites = getSites();
  console.log(`\n[Refresh] ${sites.length} site(s): ${sites.map((s) => s.name).join(", ")}`);

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
        const wpResult   = await updateWordPress(oldPost.id, newContent, site);

        refreshed.push({
          postId:   oldPost.id,
          oldTitle: oldPost.title,
          newTitle: newContent.title,
          newSlug:  newContent.slug,
          postUrl:  wpResult.link,
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
