const { runRefresh } = require("../src/refreshRunner");

module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.authorization ?? "";
    if (auth !== `Bearer ${secret}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  console.log("[/api/refresh] Starting 12-hour content refresh run...");
  const start = Date.now();

  try {
    const results = await runRefresh();
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    const summary = results.map((r) => ({
      site:      r.site,
      success:   r.success,
      refreshed: (r.refreshed ?? []).map((p) => ({
        id:       p.postId,
        oldTitle: p.oldTitle,
        newTitle: p.newTitle,
        newUrl:   p.postUrl,
        success:  p.success,
        error:    p.error ?? undefined,
      })),
    }));

    console.log(`[/api/refresh] Done in ${elapsed}s`);
    return res.status(200).json({ ok: true, elapsed: `${elapsed}s`, results: summary });
  } catch (err) {
    console.error("[/api/refresh] Fatal:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
