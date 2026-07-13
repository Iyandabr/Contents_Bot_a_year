const Anthropic = require("@anthropic-ai/sdk");
const { getRelevantKeywords, detectNiche } = require("./highEcpmKeywords");
const { getTargetYear } = require("./targetYear");
const { WRITING_STYLE } = require("./writingStyle");

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

  const targetYear = getTargetYear();

  const context = `Site: ${persona.site}
Audience: ${persona.audience}
Tone: ${persona.tone}
Topic: "${topic}"
Target year: ${targetYear}
Keywords to weave in naturally: ${keywords.join(", ")}`;

  // ── Call 1: metadata only (no HTML — clean JSON every time) ──────────────
  const metaMsg = await client.messages.create({
    model:      "claude-haiku-4-5-20251001",
    max_tokens: 400,
    messages:   [{
      role:    "user",
      content: `${context}

Return ONLY this JSON object (single line, no extra text):
{"title":"55-65 char title — include ${targetYear} only if it naturally improves the title","slug":"url-slug","focusKeyphrase":"2-4 word phrase","excerpt":"under 160 chars","seoDescription":"145-155 chars with CTA","tags":["tag1","tag2","tag3","tag4","tag5","tag6"],"estimatedReadTime":"X min read"}`,
    }],
  });

  const metaRaw = metaMsg.content[0].text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  let post;
  try {
    post = JSON.parse(metaRaw.match(/\{[\s\S]*\}/)?.[0] ?? metaRaw);
  } catch {
    throw new Error("Metadata JSON parse failed:\n" + metaRaw.slice(0, 200));
  }

  // ── Call 2: HTML content only (no JSON — no parsing needed) ──────────────
  const htmlMsg = await client.messages.create({
    model:      "claude-sonnet-4-6",
    max_tokens: 7000,
    messages:   [{
      role:    "user",
      content: `${context}
Title: "${post.title}"
Focus keyphrase: "${post.focusKeyphrase}"

Write the full HTML article body for this post. Requirements:
- 600–800 words
- Use focus keyphrase in first 100 words, at least one H2, and conclusion
- Structure: <h2> sections, <h3> subsections, <p>, <ul><li>, <strong>, <blockquote>
- Include a <div class="faq-section"> with 2–3 FAQs using <h3 class="faq-question"> and <p class="faq-answer">
- Include 2 hyperlinks to real official/authoritative external sources only — do NOT invent internal site links
- All stats, fees, and requirements should reflect ${targetYear} data
- End with: ${disclaimerLine || `<p><em>Always do your own research before making a decision.</em></p>`}
- Final paragraph must include: "${persona.cta}"

${WRITING_STYLE}

Return ONLY the HTML — no JSON, no markdown fences, no explanation.`,
    }],
  });

  post.htmlContent = htmlMsg.content[0].text.trim()
    .replace(/^```(?:html|HTML)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  console.log(`[Claude] "${post.title}" | kw: "${post.focusKeyphrase}"`);
  return { ...post, niche };
}

module.exports = { generatePost };
