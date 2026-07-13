const Anthropic = require("@anthropic-ai/sdk");
const { getTargetYear } = require("./targetYear");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SITE_PROFILES = {
  "Fulloaded": {
    description: "travel guides, immigration pathways, work abroad opportunities, visa tips, fully funded scholarships, and remote work — covering destinations and opportunities that attract readers from any country worldwide",
    audience:    "globally-minded people aged 20–45 from any country seeking to travel, migrate, study abroad, find visa-sponsored jobs, or work remotely with better pay",
    examples:    "US Visa Lottery Application Guide, Canada Express Entry Requirements, Australia Skilled Migration Points, UK Skilled Worker Visa 2026, Germany Opportunity Card, fully funded scholarships open worldwide, remote jobs that pay in USD",
  },
};

const DEFAULT_PROFILE = {
  description: "immigration, work visas, jobs abroad, scholarships, and travel opportunities",
  audience:    "people seeking overseas employment, migration pathways, and better opportunities",
  examples:    "skilled worker visa guides, fully funded scholarships, work abroad opportunities",
};

async function generateTopic(site, recentTitles = []) {
  const profile    = SITE_PROFILES[site.name] ?? DEFAULT_PROFILE;
  const today      = new Date().toISOString().split("T")[0];
  const targetYear = getTargetYear();

  const avoidSection = recentTitles.length > 0
    ? `\nRecently published posts (do NOT repeat or closely overlap any of these):\n${
        recentTitles.slice(0, 40).map((t, i) => `${i + 1}. ${t}`).join("\n")
      }`
    : "";

  const msg = await client.messages.create({
    model:      "claude-haiku-4-5-20251001",
    max_tokens: 120,
    messages:   [{
      role:    "user",
      content: `You are a content strategist for "${site.name}", a website covering: ${profile.description}.

TARGET AUDIENCE: ${profile.audience}
TODAY'S DATE: ${today}${avoidSection}

Pick ONE specific, high-search-traffic article topic to publish today. Requirements:
- Directly relevant to the site's audience
- Specific and actionable (e.g. "Germany Blue Card Salary Requirements", not just "Work in Germany")
- TARGET YEAR: ${targetYear} — frame topics around ${targetYear} updates, requirements, deadlines, and opportunities
- Include ${targetYear} in the topic title only if it naturally fits (e.g. "Canada Express Entry Draw ${targetYear}" yes; "How to Write a CV ${targetYear}" no)
- Fresh — must NOT overlap with any of the recently published posts above
- Examples of good topics for this site: ${profile.examples}

Return ONLY the topic title. No explanation, no numbering, no quotes, no punctuation at the end.`,
    }],
  });

  const topic = msg.content[0].text.trim().replace(/^["'\d.\s]+|["']+$/g, "").trim();
  console.log(`[TopicGen:${site.name}] Today's topic: "${topic}"`);
  return topic;
}

module.exports = { generateTopic };
