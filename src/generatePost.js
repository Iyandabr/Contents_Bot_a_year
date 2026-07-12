const Anthropic = require("@anthropic-ai/sdk");
const { getRelevantKeywords, detectNiche } = require("./highEcpmKeywords");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SITE_PERSONAS = {
  "Fulloaded": {
    site:     "Fulloaded (fulloaded.co.za)",
    audience: "globally-minded readers from any country seeking travel guides, immigration pathways, visa-sponsored jobs, fully funded scholarships, and remote work opportunities worldwide",
    tone:     "clear, practical, and universally accessible — write for readers from any country, avoid continent-specific framing, include visa fees, processing times, salary ranges, and step-by-step application guidance anyone can follow",
    cta:      "Visit the official government or programme website to apply, and consult a licensed immigration adviser if you need personalised help.",
    disclaimer: "Visa rules, fees, and scholarship deadlines change frequently. Always verify current requirements on official government or institution websites before applying.",
  },
};

const NICHE_PERSONAS = {
  jobs_immigration: {
    site:     "a jobs and immigration guide",
    audience: "job seekers and migrants looking for overseas employment and visa-sponsored roles",
    tone:     "factual and actionable — include salary ranges, requirements, and step-by-step application guidance",
    cta:      "Apply through the official portal and consult a licensed immigration adviser if needed.",
    disclaimer: "Requirements change frequently. Always verify details on official government or employer websites before applying.",
  },
  immigration: {
    site:     "an immigration information platform",
    audience: "people aged 20–45 seeking real immigration opportunities abroad",
    tone:     "factual, hopeful, and actionable — be specific about fees, timelines, and requirements",
    cta:      "Consult a licensed immigration lawyer or accredited migration agent for your specific case.",
    disclaimer: "This article is for informational purposes only and does not constitute immigration or legal advice.",
  },
  education: {
    site:     "a scholarships and study-abroad guide",
    audience: "African students and graduates seeking funded study opportunities abroad",
    tone:     "encouraging and detailed — include eligibility, deadlines, and application steps",
    cta:      "Apply directly through the official scholarship portal.",
    disclaimer: "Scholarship details change. Always verify deadlines and requirements on the official programme website.",
  },
  travel: {
    site:     "a travel and immigration publication",
    audience: "budget-conscious travellers and digital nomads looking for practical trip planning advice",
    tone:     "inspiring yet practical — include real tips, costs, and honest trade-offs",
    cta:      "Book early and compare prices across multiple platforms.",
    disclaimer: "Travel conditions change frequently. Always verify entry requirements with official government sources.",
  },
};

async function generatePost(topic, siteName = null, siteNiche = null) {
  const niche   = siteNiche ?? detectNiche(topic);
  const persona = SITE_PERSONAS[siteName] ?? NICHE_PERSONAS[niche] ?? NICHE_PERSONAS.jobs_immigration;
  const keywords = getRelevantKeywords(topic);

  console.log(`[Claude] Niche: ${niche} | Topic: "${topic}"`);

  const disclaimerLine = persona.disclaimer
    ? `<p><em>Disclaimer: ${persona.disclaimer}</em></p>`
    : "";

  const prompt = `You are a senior SEO content strategist writing for ${persona.site}.

TARGET AUDIENCE: ${persona.audience}
TONE: ${persona.tone}

TOPIC: "${topic}"

HIGH eCPM KEYWORDS TO NATURALLY INTEGRATE (weave in contextually — no keyword stuffing):
${keywords.join(", ")}

TARGET YEAR: 2027 — write all content, statistics, fees, requirements, and deadlines for 2027. Include "2027" in the title naturally.

SEO REQUIREMENTS:
- Title: 55–65 characters, include 2027, primary keyword near the start
- Meta description: 145–155 characters, include a soft call to action
- Focus keyphrase: the single most important 2–4 word phrase from the topic
- Use focus keyphrase in: first 100 words, at least one H2, the conclusion
- Content: 500–700 words

HTML STRUCTURE:
- <h2> for 3–4 main sections
- <h3> for subsections where needed
- <p> for body paragraphs
- <ul><li> or <ol><li> for lists
- <strong> for key terms
- <blockquote> for one key quote or stat
- <div class="faq-section"> wrapping an FAQ of 2–3 questions, each with:
    <h3 class="faq-question">Q: ...</h3>
    <p class="faq-answer">A: ...</p>
- End with: ${disclaimerLine || `<p><em>Always do your own research before making a decision.</em></p>`}

CONTENT RULES:
- Open with a compelling hook (stat, surprising fact, or relatable scenario)
- Include at least 2 hyperlinks to authoritative external sources (official sites, major publications)
- Be specific: real prices, dates, requirements, or data points
- End with a strong conclusion that includes: "${persona.cta}"
- Write every paragraph to add genuine value — no filler

Return ONLY a valid JSON object (no markdown fences, no extra text):
{
  "title": "SEO title string",
  "slug": "url-friendly-slug-no-year-unless-needed",
  "focusKeyphrase": "2-4 word phrase",
  "excerpt": "Post excerpt under 160 chars",
  "seoDescription": "Yoast/RankMath meta description 145-155 chars",
  "tags": ["tag1","tag2","tag3","tag4","tag5","tag6"],
  "estimatedReadTime": "X min read",
  "htmlContent": "<full HTML post body — 600+ words>"
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

  console.log(`[Claude] "${post.title}" | kw: "${post.focusKeyphrase}"`);
  return { ...post, niche };
}

module.exports = { generatePost };
