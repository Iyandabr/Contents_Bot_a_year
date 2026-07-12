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
 * Rewrites an old post to be fully current.
 * Returns the same shape as generatePost: { title, slug, focusKeyphrase, excerpt, seoDescription, tags, htmlContent, niche }
 */
async function refreshPost(oldPost, siteName = null) {
  const niche   = detectNiche(oldPost.title);
  const persona = SITE_PERSONAS[siteName] ?? DEFAULT_PERSONA;
  const keywords = getRelevantKeywords(oldPost.title);
  const year    = new Date().getFullYear();

  console.log(`[Refresh] Rewriting: "${oldPost.title}" (published: ${oldPost.date?.split("T")[0]})`);

  const disclaimerLine = `<p><em>Disclaimer: ${persona.disclaimer}</em></p>`;

  const prompt = `You are a senior SEO content editor refreshing an outdated article for ${persona.site}.

TARGET AUDIENCE: ${persona.audience}
TONE: ${persona.tone}
CURRENT YEAR: ${year}

ORIGINAL TITLE: "${oldPost.title}"

ORIGINAL CONTENT (HTML):
${oldPost.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 3000)}

YOUR TASK — rewrite this article to be fully current for ${year}:
1. Update ALL statistics, figures, salary ranges, fees, and processing times to ${year} data
2. Replace any outdated policy information with current requirements
3. Remove any references to old years (2020–2024) and replace with ${year} equivalents
4. Keep the same general topic but make it feel freshly written today
5. Update the title to include "${year}" if it improves SEO

HIGH eCPM KEYWORDS TO NATURALLY WEAVE IN:
${keywords.join(", ")}

SEO REQUIREMENTS:
- Title: 55–65 characters, include ${year} where natural
- New SEO-friendly URL slug: short, keyword-rich, include year if helpful
- Meta description: 145–155 characters with a soft call to action
- Focus keyphrase: the single most important 2–4 word phrase
- Content: 600–800 words

HTML STRUCTURE:
- <h2> for 3–4 main sections
- <h3> for subsections
- <p> for paragraphs
- <ul><li> or <ol><li> for lists
- <strong> for key terms
- <blockquote> for one key stat or quote
- <div class="faq-section"> with 2–3 FAQs using:
    <h3 class="faq-question">Q: ...</h3>
    <p class="faq-answer">A: ...</p>
- End with: ${disclaimerLine}

CONTENT RULES:
- Open with a compelling ${year} hook
- Include at least 2 hyperlinks to official/authoritative sources
- Be specific with current data points
- End with: "${persona.cta}"

Return ONLY a valid JSON object (no markdown fences, no extra text):
{
  "title": "Updated SEO title with ${year}",
  "slug": "updated-url-slug-${year}",
  "focusKeyphrase": "2-4 word phrase",
  "excerpt": "Updated excerpt under 160 chars",
  "seoDescription": "Updated meta description 145-155 chars",
  "tags": ["tag1","tag2","tag3","tag4","tag5","tag6"],
  "estimatedReadTime": "X min read",
  "htmlContent": "<full refreshed HTML post body>"
}`;

  const message = await client.messages.create({
    model:      "claude-haiku-4-5-20251001",
    max_tokens: 6000,
    messages:   [{ role: "user", content: prompt }],
  });

  const raw      = message.content[0].text.trim();
  const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  let post;
  try {
    post = JSON.parse(stripped);
  } catch {
    const match = stripped.match(/\{[\s\S]*\}/);
    if (match) {
      try { post = JSON.parse(match[0]); }
      catch { throw new Error("Claude returned invalid JSON:\n" + stripped.slice(0, 400)); }
    } else {
      throw new Error("Claude returned invalid JSON:\n" + stripped.slice(0, 400));
    }
  }

  console.log(`[Refresh] New title: "${post.title}" | slug: "${post.slug}"`);
  return { ...post, niche };
}

module.exports = { refreshPost };
