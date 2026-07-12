/**
 * Scans HTML content for all <a href> links and validates them.
 *
 * Internal broken links → search own site for a relevant post and replace.
 * External broken links → search own site for a relevant post and replace
 *                         (taking ownership). If no match found, strip the
 *                         anchor entirely and keep the visible text.
 * Working links (internal or external) → left as-is.
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

    const href      = hrefMatch[1];
    const fullHref  = href.startsWith("http") ? href : `${base}${href.startsWith("/") ? "" : "/"}${href}`;
    const isInternal = fullHref.startsWith(base);

    found.push({ full: match[0], href: fullHref, text: match[2], innerText, isInternal });
  }

  if (found.length === 0) return htmlContent;

  // Check all links in parallel
  const checked = await Promise.all(
    found.map(async (link) => {
      try {
        const res = await fetch(link.href, {
          method:   "HEAD",
          headers:  { "User-Agent": "Mozilla/5.0 (compatible; ContentBot/1.0)" },
          signal:   AbortSignal.timeout(8000),
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

    // Broken — whether internal or external, try to replace with an own-site post
    const type = link.isInternal ? "internal" : "external";
    console.log(`[LinkCheck] ❌ Broken ${type} link (${link.status}): ${link.href} — finding replacement...`);

    const replacement = await findReplacementPost(link.innerText, base, credentials);

    if (replacement) {
      const fixed = link.full.replace(link.href, replacement.url);
      cleaned = cleaned.replace(link.full, fixed);
      console.log(`[LinkCheck] 🔁 Replaced with own post: ${replacement.url} ("${replacement.title}")`);
    } else {
      // Nothing relevant found — strip the anchor, keep visible text
      cleaned = cleaned.replace(link.full, link.text);
      console.log(`[LinkCheck] 🗑️  Stripped (no replacement): ${link.href}`);
    }
  }

  return cleaned;
}

/**
 * Searches the WordPress site for a post matching the anchor text.
 * Returns { url, title } of the best match, or null.
 */
async function findReplacementPost(query, baseUrl, credentials) {
  if (!query || query.length < 3) return null;

  try {
    const url = `${baseUrl}/wp-json/wp/v2/posts?search=${encodeURIComponent(query)}&per_page=5&status=publish&_fields=link,title`;
    const res = await fetch(url, {
      headers: { Authorization: `Basic ${credentials}` },
      signal:  AbortSignal.timeout(8000),
    });

    if (!res.ok) return null;

    const posts = await res.json();
    if (!Array.isArray(posts) || posts.length === 0) return null;

    return {
      url:   posts[0].link,
      title: posts[0].title?.rendered ?? query,
    };
  } catch {
    return null;
  }
}

module.exports = { validateAndFixLinks };
