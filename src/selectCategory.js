/**
 * Fetches the names of the configured categories from WordPress,
 * then picks the most relevant one based on the post topic/title.
 * Falls back to a random category if no keyword match is found.
 */
async function selectCategory(topic, site) {
  const cats = site.allCategoryIds ?? site.categoryIds;
  if (!cats || cats.length === 0) return 1;
  if (cats.length === 1) return cats[0];

  const credentials = Buffer.from(`${site.username}:${site.password.replace(/\s/g, "")}`).toString("base64");

  // Fetch category names for the configured IDs
  let categories = [];
  try {
    const ids = cats.join(",");
    const res = await fetch(
      `${site.url}/wp-json/wp/v2/categories?include=${ids}&per_page=100&_fields=id,name`,
      { headers: { Authorization: `Basic ${credentials}` } }
    );
    if (res.ok) categories = await res.json();
  } catch {
    // If fetch fails, fall through to random
  }

  if (categories.length === 0) {
    return cats[Math.floor(Math.random() * cats.length)];
  }

  // Match topic keywords against category names (case-insensitive)
  const topicLower = topic.toLowerCase();

  for (const cat of categories) {
    const catName = cat.name.toLowerCase().replace(/[^a-z0-9 ]/g, "");
    // Skip generic catch-all categories
    if (["uncategorized", "featured", "more", "general"].includes(catName)) continue;
    if (topicLower.includes(catName) || catName.split(" ").some((w) => w.length > 3 && topicLower.includes(w))) {
      console.log(`[Category:${site.name}] Matched "${cat.name}" (ID ${cat.id}) for topic: "${topic}"`);
      return cat.id;
    }
  }

  // No keyword match — pick randomly from non-generic categories
  const usable = categories.filter((c) => {
    const n = c.name.toLowerCase();
    return !["uncategorized", "featured", "more", "general"].includes(n);
  });

  const pool = usable.length > 0 ? usable : categories;
  const picked = pool[Math.floor(Math.random() * pool.length)];
  console.log(`[Category:${site.name}] No keyword match — using "${picked.name}" (ID ${picked.id})`);
  return picked.id;
}

module.exports = { selectCategory };
