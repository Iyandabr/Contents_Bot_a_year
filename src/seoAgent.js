const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SITE_PROFILES = {
  "Fulloaded": {
    niche: "travel, immigration, work abroad, scholarships, and remote work for globally-minded readers",
    audience: "people from any country seeking to travel, migrate, study abroad, or work remotely",
  },
};

const DEFAULT_PROFILE = {
  niche: "immigration, work visas, jobs abroad, and scholarships",
  audience: "globally-minded people seeking overseas opportunities",
};

/**
 * Scores the current SEO of a post and returns improvements only if needed.
 * Returns { skip: true } if the SEO is already solid (score >= 7/10).
 * Returns { skip: false, title, focusKeyphrase, seoDescription, tags } if it needs work.
 */
async function auditPostSeo(post, siteName) {
  const profile = SITE_PROFILES[siteName] ?? DEFAULT_PROFILE;
  const year = new Date().getFullYear();

  const plainText = (post.content?.rendered ?? post.content ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1500);

  const currentTitle   = post.title?.rendered ?? post.title ?? "";
  const currentExcerpt = (post.excerpt?.rendered ?? "").replace(/<[^>]+>/g, "").trim().slice(0, 300);

  const prompt = `You are an SEO specialist auditing old content for a ${profile.niche} website.
AUDIENCE: ${profile.audience}
CURRENT YEAR: ${year}

OLD POST TO AUDIT:
Title: "${currentTitle}"
Current meta/excerpt: "${currentExcerpt}"
Content preview:
${plainText.slice(0, 800)}

STEP 1 — Score the current SEO quality from 1–10:
- Title: is it 55–65 chars, keyword-rich, includes current year?
- Meta description: does it exist, is it 145–155 chars with a CTA?
- Focus keyphrase: is there a clear 2–4 word target keyword?
- Tags: are there 6+ relevant, trending tags?

STEP 2 — Decide:
- If score >= 7: the SEO is already good — return {"skip":true,"score":<n>}
- If score < 7: return improvements in this exact format:
{"skip":false,"score":<n>,"title":"optimised title 55-65 chars","focusKeyphrase":"2-4 word phrase","seoDescription":"145-155 char meta description with CTA","tags":["tag1","tag2","tag3","tag4","tag5","tag6","tag7","tag8"]}

IMPORTANT: Return ONLY the JSON object (single line, no markdown, no explanation).`;

  const msg = await client.messages.create({
    model:      "claude-haiku-4-5-20251001",
    max_tokens: 450,
    messages:   [{ role: "user", content: prompt }],
  });

  const raw = msg.content[0].text.trim();
  const jsonStr = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  let result;
  try {
    result = JSON.parse(jsonStr);
  } catch {
    const match = jsonStr.match(/\{[\s\S]*?\}/);
    if (match) {
      try { result = JSON.parse(match[0]); }
      catch { throw new Error("SEO audit returned invalid JSON: " + jsonStr.slice(0, 200)); }
    } else {
      throw new Error("SEO audit returned invalid JSON: " + jsonStr.slice(0, 200));
    }
  }

  return result;
}

/**
 * Applies the SEO audit results to the WordPress post (metadata only — no content rewrite).
 */
async function applySeoUpdate(postId, seo, site) {
  const { url, username, password } = site;
  const credentials = Buffer.from(`${username}:${password.replace(/\s/g, "")}`).toString("base64");

  const tagIds = await resolveTagIds(seo.tags ?? [], credentials, url);

  const payload = {
    title:   seo.title,
    excerpt: seo.seoDescription,
    tags:    tagIds,
    meta: {
      _yoast_wpseo_metadesc:   seo.seoDescription,
      _yoast_wpseo_focuskw:    seo.focusKeyphrase,
      _yoast_wpseo_title:      seo.title,
      rank_math_description:   seo.seoDescription,
      rank_math_focus_keyword: seo.focusKeyphrase,
    },
  };

  const res = await fetch(`${url}/wp-json/wp/v2/posts/${postId}`, {
    method: "POST",
    headers: {
      Authorization:  `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`WP API ${res.status}: ${errText.slice(0, 200)}`);
  }

  return await res.json();
}

async function resolveTagIds(tagNames, credentials, baseUrl) {
  const results = await Promise.all(
    tagNames.map(async (name) => {
      const searchRes = await fetch(
        `${baseUrl}/wp-json/wp/v2/tags?search=${encodeURIComponent(name)}&per_page=5`,
        { headers: { Authorization: `Basic ${credentials}` } }
      );
      const text = await searchRes.text();
      const existing = (text.trimStart().startsWith("[") || text.trimStart().startsWith("{"))
        ? JSON.parse(text) : [];
      const match = Array.isArray(existing)
        ? existing.find((t) => t.name.toLowerCase() === name.toLowerCase())
        : null;

      if (match) return match.id;

      const createRes = await fetch(`${baseUrl}/wp-json/wp/v2/tags`, {
        method: "POST",
        headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (createRes.ok) return (await createRes.json()).id;
      return null;
    })
  );
  return results.filter(Boolean);
}

module.exports = { auditPostSeo, applySeoUpdate };
