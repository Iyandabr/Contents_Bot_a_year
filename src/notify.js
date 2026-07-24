/**
 * Sends a Telegram (and/or Slack) alert when a run has failures — broken
 * external source links count as a failure too, since a dead .gov citation
 * is a trust problem even if the post itself published fine.
 * Each channel no-ops silently if its env vars aren't set.
 */

function summarizeSiteResult(r) {
  if (r.success === false) {
    return `❌ ${r.site}: ${r.error}`;
  }

  if (Array.isArray(r.refreshed)) {
    const failed = r.refreshed.filter((p) => !p.success);
    const brokenLinks = r.refreshed.reduce((sum, p) => sum + (p.brokenExternalLinks?.length ?? 0), 0);
    const parts = [`${r.refreshed.length - failed.length} ok`, `${failed.length} failed`];
    if (brokenLinks > 0) parts.push(`${brokenLinks} broken source link(s) stripped`);
    return `${failed.length > 0 || brokenLinks > 0 ? "⚠️" : "✅"} ${r.site}: ${parts.join(", ")}`;
  }

  if (Array.isArray(r.audited)) {
    const failed = r.audited.filter((p) => p.error);
    return `${failed.length > 0 ? "⚠️" : "✅"} ${r.site}: ${r.audited.length} audited, ${failed.length} failed`;
  }

  if (r.checks) {
    const failedChecks = Object.entries(r.checks)
      .filter(([, v]) => v && v.ok === false)
      .map(([key, v]) => `${key} (${v.error ?? v.status ?? "failed"})`);
    return failedChecks.length > 0
      ? `⚠️ ${r.site}: MOT FAILED — ${failedChecks.join("; ")}`
      : `✅ ${r.site}: MOT passed — WordPress, sitemap, SEO pipeline, and topic generation all working`;
  }

  // publish-style single-post result
  const brokenLinks = r.brokenExternalLinks?.length ?? 0;
  const suffix = brokenLinks > 0 ? ` (⚠️ ${brokenLinks} broken source link(s) stripped)` : "";
  return `✅ ${r.site}: ${r.postUrl ?? "done"}${suffix}`;
}

function hasFailure(r) {
  if (r.success === false) return true;
  if (Array.isArray(r.refreshed)) {
    return r.refreshed.some((p) => !p.success || (p.brokenExternalLinks?.length ?? 0) > 0);
  }
  if (Array.isArray(r.audited)) return r.audited.some((p) => p.error);
  if (r.checks) return Object.values(r.checks).some((v) => v && v.ok === false);
  return (r.brokenExternalLinks?.length ?? 0) > 0;
}

function formatRunSummary(jobName, results) {
  const lines = [`*${jobName}* — ${new Date().toISOString()}`, ...results.map(summarizeSiteResult)];
  return { text: lines.join("\n"), anyFailure: results.some(hasFailure) };
}

async function sendSlackAlert(text) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    const res = await fetch(webhookUrl, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ text }),
    });
    if (!res.ok) console.warn(`[Notify] Slack webhook returned ${res.status}`);
  } catch (err) {
    console.warn(`[Notify] Slack alert failed: ${err.message}`);
  }
}

async function sendTelegramAlert(text) {
  const token   = process.env.TELEGRAM_BOT_TOKEN;
  const chatIds = (process.env.TELEGRAM_CHAT_ID ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  if (!token || chatIds.length === 0) return;

  // No parse_mode — the "*text*" markers are just literal asterisks here.
  // Telegram's Markdown mode 400s on unescaped special chars in URLs/titles,
  // and reliability matters more than bold styling for a failure alert.
  await Promise.all(chatIds.map(async (chatId) => {
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ chat_id: chatId, text }),
      });
      if (!res.ok) console.warn(`[Notify] Telegram API returned ${res.status} for chat ${chatId}`);
    } catch (err) {
      console.warn(`[Notify] Telegram alert failed for chat ${chatId}: ${err.message}`);
    }
  }));
}

/**
 * @param {string} jobName - e.g. "Publish", "Refresh", "SEO Audit", "Freshness Sweep"
 * @param {object[]} results - per-site result objects from the runner
 * @param {{onlyOnFailure?: boolean}} opts - set false to always send a summary
 */
async function notifyRun(jobName, results, { onlyOnFailure = true } = {}) {
  const { text, anyFailure } = formatRunSummary(jobName, results);
  if (onlyOnFailure && !anyFailure) return;
  await Promise.all([sendSlackAlert(text), sendTelegramAlert(text)]);
}

module.exports = { sendSlackAlert, sendTelegramAlert, notifyRun };
