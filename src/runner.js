const { getSites }            = require("./siteManager");
const { generateTopic }       = require("./topicGenerator");
const { getRecentWPTitles }   = require("./checkDuplicates");
const { generatePost }        = require("./generatePost");
const { publishToWordPress }  = require("./publishToWordPress");
const { validateAndFixLinks } = require("./validateLinks");
const { selectCategory }      = require("./selectCategory");
const { getTopQueries }       = require("./performanceInsights");

/**
 * Publishes one fresh new post per site per day.
 */
async function runAll(siteName = null) {
  const allSites = getSites();
  const sites = siteName
    ? allSites.filter((s) => s.name.toLowerCase() === siteName.toLowerCase())
    : allSites;

  if (sites.length === 0) throw new Error(`No site found matching "${siteName}"`);
  console.log(`\n[Runner] Processing: ${sites.map((s) => s.name).join(", ")}`);

  const results = [];

  for (const site of sites) {
    console.log(`\n── New Post: ${site.name} (${site.url}) ──────────────────────`);

    const [titlesResult, queriesResult] = await Promise.allSettled([
      getRecentWPTitles(site, 50),
      getTopQueries(site),
    ]);
    const recentTitles = titlesResult.status === "fulfilled" ? titlesResult.value : [];
    const topQueries   = queriesResult.status === "fulfilled" ? queriesResult.value : [];
    if (titlesResult.status === "rejected") {
      console.warn(`[Runner:${site.name}] Could not fetch recent titles: ${titlesResult.reason.message}`);
    }

    const topic = await generateTopic(site, recentTitles, topQueries);
    const post  = await generatePost(topic, site.name, site.niche ?? null);
    const { html, brokenExternalLinks } = await validateAndFixLinks(post.htmlContent, site);
    post.htmlContent = html;

    const selectedCategoryId = await selectCategory(topic, site);
    const siteForPublish = { ...site, categoryIds: [selectedCategoryId] };
    console.log(`[Runner:${site.name}] Category → ${selectedCategoryId}`);

    let result;
    try {
      const wpResult = await publishToWordPress(post, siteForPublish);
      result = {
        site:     site.name,
        type:     "new_post",
        success:  true,
        postId:   wpResult.id,
        postUrl:  wpResult.link,
        title:    wpResult.title?.rendered ?? post.title,
        topic,
        brokenExternalLinks,
      };
    } catch (err) {
      console.error(`[Runner:${site.name}] ❌ Failed: ${err.message}`);
      result = { site: site.name, type: "new_post", success: false, error: err.message, topic };
    }

    results.push(result);
  }

  return results;
}

module.exports = { runAll };
