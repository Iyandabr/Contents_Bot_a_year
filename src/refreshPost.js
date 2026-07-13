const Anthropic = require("@anthropic-ai/sdk");
const { getRelevantKeywords, detectNiche } = require("./highEcpmKeywords");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SITE_PERSONAS = {
  "Fulloaded": {
    site:     "Fulloaded (fulloaded.co.za)",
    audience: "globally-minded readers from any country seeking travel guides, immigration pathways, visa-sponsored jobs, scholarships, and remote work opportunities worldwide",
    tone:     "clear, practical, and universally accessible — avoid continent-specific framing, write for readers from any country, include visa fees, processing times, salary ranges, and step-by-step guidance anyone can follow",
    cta:      "Visit the official government or programme website to apply, and consult a licensed immigration adviser if you need personalised help.",
    disclaimer: "Visa rules, fees, and scholarship deadlines change frequently. Always verify current requirements on official government or institution websites before applying.",
  },
};

const DEFAULT_PERSONA = {
  site:     "an immigration and travel publication",
  audience: "people seeking overseas opportunities, visas, and scholarships",
  tone:     "factual, actionable, and encouraging — include current requirements, fees, and application steps",
  cta:      "Visit the official portal to apply and consult a qualified immigration adviser if needed.",
  disclaimer: "Requirements change frequently. Always verify details on official government websites before applying.",
};

/**
 * Rewrites an old post to be fully current using two API calls:
 * Call 1 — metadata only (clean JSON, no HTML).
 * Call 2 — HTML body only (no JSON wrapping, no parse risk).
 */
async function refreshPost(oldPost, siteName = null) {
  const niche    = detectNiche(oldPost.title);
  const persona  = SITE_PERSONAS[siteName] ?? DEFAULT_PERSONA;
  const keywords = getRelevantKeywords(oldPost.title);
  const year     = new Date().getFullYear();

  console.log(`[Refresh] Rewriting: "${oldPost.title}" (published: ${oldPost.date?.split("T")[0]})`);

  const disclaimerLine = `<p><em>Disclaimer: ${persona.disclaimer}</em></p>`;

  const plainContent = oldPost.content
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2000);

  const context = `You are a senior SEO content editor refreshing an outdated article for ${persona.site}.
TARGET AUDIENCE: ${persona.audience}
TONE: ${persona.tone}
CURRENT YEAR: ${year}
ORIGINAL TITLE: "${oldPost.title}"
ORIGINAL CONTENT SUMMARY: ${plainContent}
HIGH eCPM KEYWORDS: ${keywords.join(", ")}`;

  // ── Call 1: metadata only ─────────────────────────────────────────────────
  const metaMsg = await client.messages.create({
    model:      "claude-haiku-4-5-20251001",
    max_tokens: 400,
    messages:   [{
      role:    "user",
      content: `${context}

Refresh this article for ${year}. Return ONLY this JSON object (single line, no extra text):
{"title":"Updated SEO title 55-65 chars with ${year}","slug":"updated-slug-${year}","focusKeyphrase":"2-4 word phrase","excerpt":"under 160 chars","seoDescription":"145-155 chars with CTA","tags":["tag1","tag2","tag3","tag4","tag5","tag6"],"estimatedReadTime":"X min read"}`,
    }],
  });

  const metaRaw = metaMsg.content[0].text.trim()
    .replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  let post;
  try {
    post = JSON.parse(metaRaw.match(/\{[\s\S]*\}/)?.[0] ?? metaRaw);
  } catch {
    throw new Error("Refresh metadata JSON parse failed:\n" + metaRaw.slice(0, 200));
  }

  // ── Call 2: HTML body only ────────────────────────────────────────────────
  const htmlMsg = await client.messages.create({
    model:      "claude-haiku-4-5-20251001",
    max_tokens: 7000,
    messages:   [{
      role:    "user",
      content: `${context}
New title: "${post.title}"
Focus keyphrase: "${post.focusKeyphrase}"

Rewrite this article to be fully current for ${year}:
1. Update ALL statistics, figures, salary ranges, fees, and processing times to ${year} data
2. Replace any outdated policy information with current requirements
3. Remove references to old years (2020–2024) and replace with ${year} equivalents
4. Keep the same general topic but make it feel freshly written today

HTML STRUCTURE:
- <h2> for 3–4 main sections, <h3> for subsections
- <p> for paragraphs, <ul><li> or <ol><li> for lists, <strong> for key terms
- <blockquote> for one key stat or quote
- <div class="faq-section"> with 2–3 FAQs:
    <h3 class="faq-question">Q: ...</h3>
    <p class="faq-answer">A: ...</p>
- End with: ${disclaimerLine}

CONTENT RULES:
- 600–800 words
- Open with a compelling ${year} hook
- Include 2 hyperlinks to real official/authoritative external sources only — do NOT invent internal site links
- End with: "${persona.cta}"

Return ONLY the HTML — no JSON, no markdown fences, no explanation.`,
    }],
  });

  post.htmlContent = htmlMsg.content[0].text.trim()
    .replace(/^```(?:html|HTML)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  console.log(`[Refresh] New title: "${post.title}" | slug: "${post.slug}"`);
  return { ...post, niche };
}

module.exports = { refreshPost };
