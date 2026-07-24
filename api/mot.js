const { runMotCheck } = require("../src/motCheck");
const { notifyRun }   = require("../src/notify");

module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.authorization ?? "";
    if (auth !== `Bearer ${secret}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  const siteName = req.query?.site ?? null;
  console.log(`[/api/mot] Starting MOT check | site: ${siteName ?? "all"}`);
  const start = Date.now();

  try {
    const results = await runMotCheck(siteName);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    await notifyRun("Monthly MOT Check", results, { onlyOnFailure: false });

    console.log(`[/api/mot] Done in ${elapsed}s`);
    return res.status(200).json({ ok: true, elapsed: `${elapsed}s`, results });
  } catch (err) {
    console.error("[/api/mot] Fatal:", err.message);
    await notifyRun("Monthly MOT Check", [{ site: siteName ?? "all", success: false, error: err.message }], { onlyOnFailure: false });
    return res.status(500).json({ ok: false, error: err.message });
  }
};
