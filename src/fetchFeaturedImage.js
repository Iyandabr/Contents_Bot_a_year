/**
 * Fetches a relevant featured image from Pexels based on a search query.
 * Requires PEXELS_API_KEY env var (free at pexels.com/api).
 * Returns null gracefully if key is missing or search fails.
 */

async function fetchFeaturedImage(focusKeyphrase, niche) {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    console.warn("[Pexels] PEXELS_API_KEY not set — skipping featured image.");
    return null;
  }

  // Build a clean, visual search query from the focus keyphrase
  // Strip years and overly specific terms that return poor results
  const cleaned = focusKeyphrase
    .replace(/\b(20\d{2}|guide|explained|complete|step by step|how to)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  // Niche-aware fallback terms improve image relevance
  const nicheFallbacks = {
    jobs_immigration: "professional office career abroad",
    immigration:      "passport travel visa documents",
    education:        "students university scholarship",
    finance:          "money banking finance",
    travel:           "travel adventure destination",
    insurance:        "travel insurance protection",
    smartwatch:       "smartwatch wearable tech",
    tech:             "technology gadgets",
  };

  const query    = cleaned.length > 5 ? cleaned : (nicheFallbacks[niche] ?? cleaned);
  const fallback = nicheFallbacks[niche] ?? "professional career";

  const image = await searchPexels(query, apiKey)
    ?? await searchPexels(fallback, apiKey);

  return image;
}

async function searchPexels(query, apiKey) {
  try {
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=5&orientation=landscape&size=large`,
      { headers: { Authorization: apiKey } }
    );

    if (!res.ok) {
      console.warn(`[Pexels] Search failed (${res.status}) for: "${query}"`);
      return null;
    }

    const data = await res.json();
    const photo = data.photos?.[0];
    if (!photo) return null;

    console.log(`[Pexels] Found image for "${query}": ${photo.src.large2x}`);
    return {
      url:          photo.src.large2x,   // high-res (1280px wide)
      photographer: photo.photographer,
      pexelsUrl:    photo.url,
    };
  } catch (err) {
    console.warn(`[Pexels] Error: ${err.message}`);
    return null;
  }
}

module.exports = { fetchFeaturedImage };
