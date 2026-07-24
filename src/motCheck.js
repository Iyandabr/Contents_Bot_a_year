const { getSites }       = require("./siteManager");
const { auditPostSeo }   = require("./seoAgent");
const { generateTopic }  = require("./topicGenerator");
const { getTopQueries }  = require("./performanceInsights");

/**
 * Monthly health check — deliberately exercises real functionality
 * (not just "is the API reachable") in a read-only, non-destructive way.
 * A pure connectivity check would never have caught the seoAgent.js bug
 * where post.content.replace() crashed on every single run — only
 * actually running the pipeline against real data catches that class of bug.
 * Nothing here writes to WordPress or spends more than a couple of cheap
 * Haiku calls per site.
 */
async function runMotCheck(siteName = null) {
  const allSites = getSites();
  const sites = siteName
    ? allSites.filter((s) => s.name.toLowerCase() === siteName.toLowerCase())
    : allSites;

  if (sites.length === 0) throw new Error(`No site found matching "${siteName}"`);
  console.log(`\n[MOT] Processing: ${sites.map((s) => s.name).join(", ")}`);

  const results = [];

  for (const site of sites) {
    console.log(`\n── MOT check: ${site.name} (${site.url}) ──────────────────────`);
    const checks = {};
    let samplePost = null;

    // 1. WordPress connectivity (read-only)
    try {
      const credentials = Buffer.from(`${site.username}:${site.password.replace(/\s/g, "")}`).toString("base64");
      const res = await fetch(`${site.url}/wp-json/wp/v2/posts?per_page=1&status=publish&_fields=id,title,content,excerpt,tags`, {
        headers: { Authorization: `Basic ${credentials}` },
        signal:  AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error(`WP API ${res.status}`);
      const posts = await res.json();
      samplePost = posts[0] ?? null;
      checks.wordpress = { ok: true };
      console.log(`[MOT:${site.name}] ✅ WordPress connectivity OK`);
    } catch (err) {
      checks.wordpress = { ok: false, error: err.message };
      console.log(`[MOT:${site.name}] ❌ WordPress connectivity failed: ${err.message}`);
    }

    // 2. Sitemap reachability
    try {
      const sitemapUrl = site.sitemapUrl ?? `${site.url}/sitemap_index.xml`;
      const res = await fetch(sitemapUrl, { method: "HEAD", signal: AbortSignal.timeout(8000) });
      checks.sitemap = { ok: res.ok, status: res.status };
      console.log(`[MOT:${site.name}] ${res.ok ? "✅" : "❌"} Sitemap (${res.status}): ${sitemapUrl}`);
    } catch (err) {
      checks.sitemap = { ok: false, error: err.message };
      console.log(`[MOT:${site.name}] ❌ Sitemap unreachable: ${err.message}`);
    }

    // 3. Google Search Console connectivity (no-ops to [] if not configured)
    if (process.env.GSC_SERVICE_ACCOUNT_JSON) {
      try {
        const rows = await getTopQueries(site);
        checks.gsc = { ok: true, rowCount: rows.length };
        console.log(`[MOT:${site.name}] ✅ GSC connectivity OK (${rows.length} rows)`);
      } catch (err) {
        checks.gsc = { ok: false, error: err.message };
        console.log(`[MOT:${site.name}] ❌ GSC check failed: ${err.message}`);
      }
    } else {
      checks.gsc = { ok: null, note: "not configured" };
    }

    // 4. Dry-run SEO audit — scores a real post via Claude but never calls
    //    applySeoUpdate, so nothing gets written. This is the exact code
    //    path that silently crashed on every run before the July 2026 fix.
    if (samplePost) {
      try {
        const audit = await auditPostSeo(samplePost, site.name);
        checks.seoAuditPipeline = { ok: true, score: audit.score ?? null };
        console.log(`[MOT:${site.name}] ✅ SEO audit pipeline OK (score ${audit.score})`);
      } catch (err) {
        checks.seoAuditPipeline = { ok: false, error: err.message };
        console.log(`[MOT:${site.name}] ❌ SEO audit pipeline failed: ${err.message}`);
      }
    } else {
      checks.seoAuditPipeline = { ok: false, error: "no sample post available to test against" };
    }

    // 5. Dry-run topic generation — exercises the Claude prompt/JSON pipeline
    //    without publishing anything.
    try {
      const topic = await generateTopic(site, [], []);
      checks.topicGeneration = { ok: !!topic, sample: topic };
      console.log(`[MOT:${site.name}] ✅ Topic generation OK: "${topic}"`);
    } catch (err) {
      checks.topicGeneration = { ok: false, error: err.message };
      console.log(`[MOT:${site.name}] ❌ Topic generation failed: ${err.message}`);
    }

    // 6. Required env vars present (booleans only — never logs values)
    checks.envVars = {
      ok:        !!(process.env.ANTHROPIC_API_KEY && process.env.PEXELS_API_KEY),
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      pexels:    !!process.env.PEXELS_API_KEY,
      telegram:  !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
      gsc:       !!process.env.GSC_SERVICE_ACCOUNT_JSON,
    };

    const success = [checks.wordpress.ok, checks.sitemap.ok, checks.seoAuditPipeline.ok, checks.topicGeneration.ok, checks.envVars.ok]
      .every((v) => v !== false);

    results.push({ site: site.name, type: "mot", success, checks });
  }

  return results;
}

module.exports = { runMotCheck };
