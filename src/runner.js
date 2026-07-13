const { getSites }            = require("./siteManager");
const { generateTopic }       = require("./topicGenerator");
const { getRecentWPTitles }   = require("./checkDuplicates");
const { generatePost }        = require("./generatePost");
const { publishToWordPress }  = require("./publishToWordPress");
const { validateAndFixLinks } = require("./validateLinks");
const { selectCategory }      = require("./selectCategory");

/**
 * Publishes one fresh new post per site per day.
 */
async function runAll() {
  const sites = getSites();
  console.log(`\n[Runner] ${sites.length} site(s): ${sites.map((s) => s.name).join(", ")}`);

  const results = [];

  for (const site of sites) {
    console.log(`\n── New Post: ${site.name} (${site.url}) ──────────────────────`);

    let recentTitles = [];
    try {
      recentTitles = await getRecentWPTitles(site, 50);
    } catch (err) {
      console.warn(`[Runner:${site.name}] Could not fetch recent titles: ${err.message}`);
    }

    const topic = await generateTopic(site, recentTitles);
    const post  = await generatePost(topic, site.name, site.niche ?? null);
    post.htmlContent = await validateAndFixLinks(post.htmlContent, site);

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
