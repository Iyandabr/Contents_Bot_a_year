const { getTopQueries } = require("../src/performanceInsights");

module.exports = async (req, res) => {
  const hasGsc = !!process.env.GSC_SERVICE_ACCOUNT_JSON;

  let gscTest = null;
  if (hasGsc) {
    try {
      const rows = await getTopQueries({ name: "Fulloaded", url: "https://fulloaded.co.za" });
      gscTest = { ok: true, rowCount: rows.length, sample: rows.slice(0, 3) };
    } catch (err) {
      gscTest = { ok: false, error: err.message };
    }
  }

  res.json({
    hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
    keyPrefix:       process.env.ANTHROPIC_API_KEY?.slice(0, 12) ?? "NOT SET",
    hasWpSites:      !!process.env.WP_SITES,
    hasPexels:       !!process.env.PEXELS_API_KEY,
    hasTelegram:     !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
    hasGsc,
    gscTest,
  });
};
