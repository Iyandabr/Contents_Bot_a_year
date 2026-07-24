const { runRefresh } = require("../src/refreshRunner");
const { notifyRun }  = require("../src/notify");

module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.authorization ?? "";
    if (auth !== `Bearer ${secret}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  const siteName = req.query?.site ?? null;
  console.log(`[/api/refresh] Starting refresh | site: ${siteName ?? "all"}`);
  const start = Date.now();

  try {
    const results = await runRefresh(siteName);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    const summary = results.map((r) => ({
      site:      r.site,
      success:   r.success,
      refreshed: (r.refreshed ?? []).map((p) => ({
        id:                  p.postId,
        oldTitle:            p.oldTitle,
        newTitle:            p.newTitle,
        newUrl:              p.postUrl,
        brokenExternalLinks: p.brokenExternalLinks ?? [],
        success:             p.success,
        error:               p.error ?? undefined,
      })),
    }));

    await notifyRun("Refresh", results, { onlyOnFailure: false });

    console.log(`[/api/refresh] Done in ${elapsed}s`);
    return res.status(200).json({ ok: true, elapsed: `${elapsed}s`, results: summary });
  } catch (err) {
    console.error("[/api/refresh] Fatal:", err.message);
    await notifyRun("Refresh", [{ site: siteName ?? "all", success: false, error: err.message }], { onlyOnFailure: false });
    return res.status(500).json({ ok: false, error: err.message });
  }
};
