const { runSeo }    = require("../src/seoRunner");
const { notifyRun } = require("../src/notify");

module.exports = async (req, res) => {
  const siteName = req.query?.site ?? null;

  try {
    const results = await runSeo(siteName);
    await notifyRun("SEO Audit", results, { onlyOnFailure: false });
    res.status(200).json({ ok: true, results });
  } catch (err) {
    console.error("[SEO] Fatal:", err);
    await notifyRun("SEO Audit", [{ site: siteName ?? "all", success: false, error: err.message }], { onlyOnFailure: false });
    res.status(500).json({ ok: false, error: err.message });
  }
};
