const { fetchFeaturedImage } = require("./fetchFeaturedImage");

async function publishToWordPress(post, site) {
  const { url, username, password, categoryIds, status, authorId } = site;
  const credentials = Buffer.from(`${username}:${password.replace(/\s/g, "")}`).toString("base64");

  // Resolve tags and fetch featured image in parallel
  const [tagIds, image] = await Promise.all([
    resolveTagIds(post.tags ?? [], credentials, url),
    fetchFeaturedImage(post.focusKeyphrase ?? post.title, post.niche),
  ]);

  // Upload the image to WP media library if we got one
  const featuredMediaId = image
    ? await uploadImageToWP(image, post.title, credentials, url)
    : null;

  const payload = {
    title:      post.title,
    content:    post.htmlContent,
    excerpt:    post.excerpt,
    status:     status ?? "publish",
    categories: categoryIds ?? [],
    tags:       tagIds,
    meta: {
      _yoast_wpseo_metadesc:   post.seoDescription ?? post.excerpt,
      _yoast_wpseo_focuskw:    post.focusKeyphrase ?? "",
      _yoast_wpseo_title:      post.title,
      rank_math_description:   post.seoDescription ?? post.excerpt,
      rank_math_focus_keyword: post.focusKeyphrase ?? "",
    },
  };

  if (featuredMediaId) payload.featured_media = featuredMediaId;
  if (authorId) payload.author = Number(authorId);

  console.log(`[WordPress:${site.name}] Publishing "${post.title}" ...`);

  const res = await fetch(`${url}/wp-json/wp/v2/posts`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const resText = await res.text();
  if (!res.ok || resText.trimStart().startsWith("<")) {
    const preview = resText.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
    throw new Error(`[${site.name}] WP API ${res.status}: ${preview}`);
  }

  const created = JSON.parse(resText);
  console.log(`[WordPress:${site.name}] ✅ Published! ID: ${created.id} | ${created.link}`);
  return created;
}

async function uploadImageToWP(image, postTitle, credentials, baseUrl) {
  try {
    console.log(`[WordPress] Uploading featured image from Pexels...`);

    // Download the image from Pexels
    const imgRes = await fetch(image.url);
    if (!imgRes.ok) throw new Error(`Image download failed: ${imgRes.status}`);

    const imgBuffer = await imgRes.arrayBuffer();
    const contentType = imgRes.headers.get("content-type") || "image/jpeg";
    const ext = contentType.includes("png") ? "png" : "jpg";

    // Slug the post title to use as the filename (good for SEO)
    const slug = postTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60);

    const uploadRes = await fetch(`${baseUrl}/wp-json/wp/v2/media`, {
      method: "POST",
      headers: {
        Authorization:       `Basic ${credentials}`,
        "Content-Disposition": `attachment; filename="${slug}.${ext}"`,
        "Content-Type":      contentType,
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
  // Search all tags in parallel
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

      // Create missing tag
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

module.exports = { publishToWordPress };
