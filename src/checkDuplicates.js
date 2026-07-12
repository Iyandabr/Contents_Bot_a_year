const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function getRecentWPTitles(site, count = 100) {
  const credentials = Buffer.from(`${site.username}:${site.password.replace(/\s/g, "")}`).toString("base64");

  console.log(`[DuplicateCheck:${site.name}] Fetching last ${count} post titles...`);

  const res = await fetch(
    `${site.url}/wp-json/wp/v2/posts?per_page=${count}&orderby=date&order=desc&_fields=title,slug`,
    { headers: { Authorization: `Basic ${credentials}` } }
  );

  if (!res.ok) {
    console.warn(`[DuplicateCheck:${site.name}] Could not fetch posts (${res.status}). Skipping.`);
    return [];
  }

  const posts = await res.json();
  return posts.map((p) =>
    (p.title?.rendered ?? "")
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
  );
}

async function checkSimilarity(newTopic, existingTitles) {
  if (existingTitles.length === 0) return { isDuplicate: false, reason: "No existing posts." };

  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 256,
    messages: [{
      role: "user",
      content: `You are a content deduplication assistant.

Proposed topic: "${newTopic}"

Existing post titles (most recent first):
${existingTitles.slice(0, 60).map((t, i) => `${i + 1}. ${t}`).join("\n")}

Is the proposed topic substantially similar to any existing post — meaning a reader would learn nothing new?

Respond with JSON only:
{
  "isDuplicate": true | false,
  "matchedTitle": "the matched title or null",
  "reason": "one sentence",
  "suggestedAlternative": "a fresh angle on the same theme, or null"
}`,
    }],
  });

  try {
    const raw = msg.content[0].text.trim();
    return JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? raw);
  } catch {
    return { isDuplicate: false, reason: "Parse error — proceeding." };
  }
}

/**
 * Checks a topic against a specific site's existing posts.
 * Returns { topic, wasDuplicate }
 */
async function deduplicateTopicForSite(proposedTopic, site) {
  let topic = proposedTopic;
  let wasDuplicate = false;

  try {
    const existingTitles = await getRecentWPTitles(site);
    const result = await checkSimilarity(topic, existingTitles);

    console.log(`[DuplicateCheck:${site.name}] isDuplicate=${result.isDuplicate} | ${result.reason}`);

    if (result.isDuplicate) {
      wasDuplicate = true;
      topic = result.suggestedAlternative
        ? result.suggestedAlternative
        : `${topic} — Complete ${new Date().getFullYear()} Guide`;
      console.log(`[DuplicateCheck:${site.name}] New topic: "${topic}"`);
    }
  } catch (err) {
    console.warn(`[DuplicateCheck:${site.name}] Failed (${err.message}). Proceeding.`);
  }

  return { topic, wasDuplicate };
}

module.exports = { deduplicateTopicForSite, getRecentWPTitles };
