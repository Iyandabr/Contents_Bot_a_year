const { fetchFeaturedImage } = require("./fetchFeaturedImage");

/**
 * Updates an existing WordPress post with refreshed content.
 * Resets the date to today so it appears as a new post on the homepage.
 * Also updates the slug (URL) to the refreshed SEO-friendly version.
 */
async function updateWordPress(postId, refreshedPost, site) {
  const { url, username, password, status, authorId } = site;
  const credentials = Buffer.from(`${username}:${password.replace(/\s/g, "")}`).toString("base64");

  const [tagIds, image] = await Promise.all([
    resolveTagIds(refreshedPost.tags ?? [], credentials, url),
    fetchFeaturedImage(refreshedPost.focusKeyphrase ?? refreshedPost.title, refreshedPost.niche),
  ]);

  const featuredMediaId = image
    ? await uploadImageToWP(image, refreshedPost.title, credentials, url)
    : null;

  // Reset date to now so the post pops to the top of the homepage as new
  const now = new Date().toISOString();

  const payload = {
    title:   refreshedPost.title,
    content: refreshedPost.htmlContent,
    excerpt: refreshedPost.excerpt,
    status:  status ?? "publish",
    date:    now,
    slug:    refreshedPost.slug ?? undefined,
    tags:    tagIds,
    meta: {
      _yoast_wpseo_metadesc:   refreshedPost.seoDescription ?? refreshedPost.excerpt,
      _yoast_wpseo_focuskw:    refreshedPost.focusKeyphrase ?? "",
      _yoast_wpseo_title:      refreshedPost.title,
      rank_math_description:   refreshedPost.seoDescription ?? refreshedPost.excerpt,
      rank_math_focus_keyword: refreshedPost.focusKeyphrase ?? "",
    },
  };

  if (featuredMediaId) payload.featured_media = featuredMediaId;
  if (authorId) payload.author = Number(authorId);

  console.log(`[WordPress:${site.name}] Updating post ID ${postId}: "${refreshedPost.title}" ...`);

  const res = await fetch(`${url}/wp-json/wp/v2/posts/${postId}`, {
    method: "POST",
    headers: {
      Authorization:  `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const resText = await res.text();
  if (!res.ok || resText.trimStart().startsWith("<")) {
    const preview = resText.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
    throw new Error(`[${site.name}] WP API ${res.status}: ${preview}`);
  }

  const updated = JSON.parse(resText);
  console.log(`[WordPress:${site.name}] ✅ Refreshed! ID: ${updated.id} | ${updated.link}`);
  return updated;
}

async function uploadImageToWP(image, postTitle, credentials, baseUrl) {
  try {
    const imgRes = await fetch(image.url);
    if (!imgRes.ok) throw new Error(`Image download failed: ${imgRes.status}`);

    const imgBuffer  = await imgRes.arrayBuffer();
    const contentType = imgRes.headers.get("content-type") || "image/jpeg";
    const ext = contentType.includes("png") ? "png" : "jpg";

    const slug = postTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60);

    const uploadRes = await fetch(`${baseUrl}/wp-json/wp/v2/media`, {
      method: "POST",
      headers: {
        Authorization:         `Basic ${credentials}`,
        "Content-Disposition": `attachment; filename="${slug}.${ext}"`,
        "Content-Type":        contentType,
      },
      body: imgBuffer,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      console.warn(`[WordPress] Image upload failed (${uploadRes.status}): ${errText.slice(0, 150)}`);
      return null;
    }

    const media = await uploadRes.json();
    console.log(`[WordPress] Featured image uploaded: ID ${media.id}`);
    return media.id;
  } catch (err) {
    console.warn(`[WordPress] Image upload error: ${err.message}`);
    return null;
  }
}

async function resolveTagIds(tagNames, credentials, baseUrl) {
  const results = await Promise.all(
    tagNames.map(async (name) => {
      const searchRes = await fetch(
        `${baseUrl}/wp-json/wp/v2/tags?search=${encodeURIComponent(name)}&per_page=5`,
        { headers: { Authorization: `Basic ${credentials}` } }
      );
      const searchText = await searchRes.text();
      const existing = searchText.trimStart().startsWith("[") || searchText.trimStart().startsWith("{")
        ? JSON.parse(searchText) : [];
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

module.exports = { updateWordPress };
