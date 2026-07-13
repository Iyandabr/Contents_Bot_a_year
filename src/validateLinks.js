/**
 * Validates internal links only.
 *
 * External links (to government sites, official sources, etc.) are left
 * exactly as Claude wrote them — replacing them with unrelated internal
 * posts damages credibility.
 *
 * Internal broken links → search own site for a relevant post and replace.
 *                         If no match found, strip the anchor, keep visible text.
 * Internal working links → left as-is.
 * External links → always left as-is.
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

    const href       = hrefMatch[1];
    const fullHref   = href.startsWith("http") ? href : `${base}${href.startsWith("/") ? "" : "/"}${href}`;
    const isInternal = fullHref.startsWith(base);

    // Skip external links entirely — they link to authoritative sources and should not be touched
    if (!isInternal) {
      console.log(`[LinkCheck] ⏭️  External link kept as-is: ${fullHref}`);
      continue;
    }

    found.push({ full: match[0], href: fullHref, text: match[2], innerText });
  }

  if (found.length === 0) return htmlContent;

  // Check internal links in parallel
  const checked = await Promise.all(
    found.map(async (link) => {
      try {
        const res = await fetch(link.href, {
          method:   "HEAD",
          headers:  { "User-Agent": "Mozilla/5.0 (compatible; ContentBot/1.0)" },
          signal:   AbortSignal.timeout(4000),
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
      console.log(`[LinkCheck] ✅ Internal OK (${link.status}): ${link.href}`);
      continue;
    }

    console.log(`[LinkCheck] ❌ Broken internal link (${link.status}): ${link.href} — finding replacement...`);

    const replacement = await findReplacementPost(link.innerText, base, credentials);

    if (replacement) {
      const fixed = link.full.replace(link.href, replacement.url);
      cleaned = cleaned.replace(link.full, fixed);
      console.log(`[LinkCheck] 🔁 Replaced with: ${replacement.url} ("${replacement.title}")`);
    } else {
      cleaned = cleaned.replace(link.full, link.text);
      console.log(`[LinkCheck] 🗑️  Stripped (no replacement found): ${link.href}`);
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
