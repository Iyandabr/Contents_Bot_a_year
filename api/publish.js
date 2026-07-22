const { runAll }    = require("../src/runner");
const { notifyRun } = require("../src/notify");

module.exports = async (req, res) => {
  // Optional auth check
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.authorization ?? "";
    if (auth !== `Bearer ${secret}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  console.log("[/api/publish] Starting daily new-post run...");
  const start = Date.now();

  try {
    const siteName = req.query?.site ?? null;
    console.log(`[API /publish] site: ${siteName ?? "all"}`);
    const results = await runAll(siteName);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    const summary = results.map((r) => ({
      site:    r.site,
      success: r.success,
      title:   r.title ?? r.error,
      url:     r.postUrl ?? null,
      brokenExternalLinks: r.brokenExternalLinks ?? [],
    }));

    await notifyRun("Publish", results);

    console.log(`[/api/publish] Done in ${elapsed}s`);
    return res.status(200).json({ ok: true, elapsed: `${elapsed}s`, results: summary });
  } catch (err) {
    console.error("[/api/publish] Fatal:", err.message);
    await notifyRun("Publish", [{ site: req.query?.site ?? "all", success: false, error: err.message }], { onlyOnFailure: false });
    return res.status(500).json({ ok: false, error: err.message });
  }
};
