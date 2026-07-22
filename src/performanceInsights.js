const crypto = require("crypto");

/**
 * Google Search Console top-query lookup — signs its own service-account
 * JWT via Node's built-in crypto module rather than pulling in the (large)
 * googleapis package, matching the rest of this codebase's plain-fetch style.
 *
 * Never throws: this is a nice-to-have signal for topic selection, not a
 * hard dependency, so any failure (unset, misconfigured, API error) just
 * returns [] and topic generation falls back to its non-performance-aware prompt.
 */

let cachedToken = null;
let cachedTokenExpiry = 0;

function base64url(input) {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getAccessToken() {
  const keyJson = process.env.GSC_SERVICE_ACCOUNT_JSON;
  if (!keyJson) return null;

  if (cachedToken && Date.now() < cachedTokenExpiry) return cachedToken;

  const { client_email, private_key } = JSON.parse(keyJson);
  const now = Math.floor(Date.now() / 1000);

  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(JSON.stringify({
    iss:   client_email,
    scope: "https://www.googleapis.com/auth/webmasters.readonly",
    aud:   "https://oauth2.googleapis.com/token",
    exp:   now + 3600,
    iat:   now,
  }));

  const signInput  = `${header}.${claims}`;
  const signature  = crypto.createSign("RSA-SHA256").update(signInput).sign(private_key);
  const jwt        = `${signInput}.${base64url(signature)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion:  jwt,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token exchange failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  cachedTokenExpiry = Date.now() + 55 * 60 * 1000; // refresh a bit ahead of the 1hr expiry
  return cachedToken;
}

/**
 * Returns top search queries (by clicks) for a site over the last N days.
 * site.gscSiteUrl should be set explicitly when it doesn't match site.url
 * exactly — Search Console properties are picky: URL-prefix properties
 * usually need a trailing slash, domain properties use "sc-domain:example.com".
 */
async function getTopQueries(site, { days = 28, limit = 15 } = {}) {
  if (!process.env.GSC_SERVICE_ACCOUNT_JSON) return [];

  try {
    const token = await getAccessToken();
    if (!token) return [];

    const siteUrl = site.gscSiteUrl ?? `${site.url}/`;
    const end   = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    const fmt = (d) => d.toISOString().split("T")[0];

    const res = await fetch(
      `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
      {
        method:  "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body:    JSON.stringify({
          startDate:  fmt(start),
          endDate:    fmt(end),
          dimensions: ["query"],
          rowLimit:   limit,
        }),
      }
    );

    if (!res.ok) {
      console.warn(`[Performance:${site.name}] Search Console API ${res.status} for ${siteUrl}`);
      return [];
    }

    const data = await res.json();
    return (data.rows ?? []).map((r) => ({
      query:       r.keys[0],
      clicks:      r.clicks,
      impressions: r.impressions,
    }));
  } catch (err) {
    console.warn(`[Performance:${site.name}] Search Console fetch failed: ${err.message}`);
    return [];
  }
}

module.exports = { getTopQueries };
