module.exports = (req, res) => {
  res.json({
    hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
    keyPrefix:       process.env.ANTHROPIC_API_KEY?.slice(0, 12) ?? "NOT SET",
    hasWpSites:      !!process.env.WP_SITES,
    hasPexels:       !!process.env.PEXELS_API_KEY,
  });
};
