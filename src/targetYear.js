/**
 * Returns the SEO target year for new posts.
 * Jan–Jun  → current year  (e.g. early 2027 → 2027)
 * Jul–Dec  → next year     (e.g. July 2026 → 2027, July 2027 → 2028)
 *
 * This keeps content forward-looking without manual updates.
 */
function getTargetYear() {
  const now = new Date();
  return now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
}

module.exports = { getTargetYear };
