const { runSeo } = require("../src/seoRunner");

module.exports = async (req, res) => {
  const siteName = req.query?.site ?? null;

  try {
    const results = await runSeo(siteName);
    res.status(200).json({ ok: true, results });
  } catch (err) {
    console.error("[SEO] Fatal:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
};
