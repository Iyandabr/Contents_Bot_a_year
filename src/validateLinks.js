/**
 * Scans HTML content for all <a href> links.
 * Internal links are verified — broken ones are replaced with the closest
 * matching real post found via the WP search API.
 * If no match is found, the link is stripped (text kept, anchor removed).
 * External links are logged as warnings but left untouched.
 */
async function validateAndFixLinks(htmlContent, site) {
  const base        = site.url.replace(/\/$/, "");
  const credentials = Buffer.from(`${site.username}:${site.password.replace(/\s/g, "")}`).toString("base64");

  const linkRegex = /<a\s+([^>]*?)>([\s\S]*?)<\/a>/gi;
  const found = [];
  let match;

  while ((match = linkRegex.exec(htmlContent)) !== null) {
    const attrsStr  = match[1];
    const innerText = match[2].replace(/<[^>]+>/g, "").trim();
    const hrefMatch = /href=["']([^"']+)["']/i.exec(attrsStr);
    if (!hrefMatch) continue;

    const href     = hrefMatch[1];
    const fullHref = href.startsWith("http") ? href : `${base}${href.startsWith("/") ? "" : "/"}${href}`;
    const isInternal = fullHref.startsWith(base);

    found.push({ full: match[0], href: fullHref, text: match[2], innerText, isInternal });
  }

  if (found.length === 0) return htmlContent;

  // Check all links in parallel
  const checked = await Promise.all(
    found.map(async (link) => {
      try {
        const res = await fetch(link.href, {
          method:  "HEAD",
          headers: { "User-Agent": "Mozilla/5.0 (compatible; ContentBot/1.0)" },
          signal:  AbortSignal.timeout(8000),
          redirect: "follow",
        });
        return { ...link, status: res.status, ok: res.status < 400 };
      } catch {
        return { ...link, status: 0, ok: false };
      }
    })
  );

  let cleaned = htmlContent;

  for (const link of checked) {
    if (link.ok) {
      console.log(`[LinkCheck] ✅ ${link.isInternal ? "Internal" : "External"} OK (${link.status}): ${link.href}`);
      continue;
    }

    if (!link.isInternal) {
      console.warn(`[LinkCheck] ⚠️  External may be broken (${link.status}): ${link.href}`);
      continue;
    }

    // Broken internal link — try to find a real replacement post
    console.log(`[LinkCheck] ❌ Broken internal link: ${link.href} — searching for replacement...`);
    const replacement = await findReplacementPost(link.innerText, base, credentials);

    if (replacement) {
      // Swap the broken href with the real post URL
      const fixed = link.full.replace(link.href, replacement.url);
      cleaned = cleaned.replace(link.full, fixed);
      console.log(`[LinkCheck] 🔁 Replaced with: ${replacement.url} ("${replacement.title}")`);
    } else {
      // No match found — strip the anchor, keep visible text
      cleaned = cleaned.replace(link.full, link.text);
      console.log(`[LinkCheck] 🗑️  Stripped (no replacement found): ${link.href}`);
    }
  }

  return cleaned;
}

/**
 * Searches the WP site for a post matching the given anchor text.
 * Returns { url, title } of the best match, or null if nothing found.
 */
async function findReplacementPost(query, baseUrl, credentials) {
  if (!query || query.length < 3) return null;

  try {
    const searchUrl = `${baseUrl}/wp-json/wp/v2/posts?search=${encodeURIComponent(query)}&per_page=5&status=publish&_fields=link,title`;
    const res = await fetch(searchUrl, {
      headers: { Authorization: `Basic ${credentials}` },
      signal:  AbortSignal.timeout(8000),
    });

    if (!res.ok) return null;

    const posts = await res.json();
    if (!Array.isArray(posts) || posts.length === 0) return null;

    const best = posts[0];
    return {
      url:   best.link,
      title: best.title?.rendered ?? query,
    };
  } catch {
    return null;
  }
}

module.exports = { validateAndFixLinks };
