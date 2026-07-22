/**
 * Validates both internal and external links.
 *
 * Internal broken links → search own site for a relevant post and replace.
 *                         If no match found, strip the anchor, keep visible text.
 * Internal working links → left as-is.
 *
 * External links → HEAD-checked too. A dead .gov/.org citation is a real
 * credibility risk in this niche (scam-confusion is the #1 trust issue),
 * so a broken one gets its anchor stripped (text kept) rather than trusted
 * blindly. Statuses like 401/403/405/429 are treated as "site blocks bots",
 * not proof the page is dead, so those are left alone.
 *
 * Returns { html, brokenExternalLinks } — brokenExternalLinks is the list of
 * URLs that were stripped, so callers can log/alert on it.
 */
async function validateAndFixLinks(htmlContent, site) {
  const base        = site.url.replace(/\/$/, "");
  const credentials = Buffer.from(`${site.username}:${site.password.replace(/\s/g, "")}`).toString("base64");

  const linkRegex = /<a\s+([^>]*?)>([\s\S]*?)<\/a>/gi;
  const internalLinks = [];
  const externalLinks = [];
  let match;

  while ((match = linkRegex.exec(htmlContent)) !== null) {
    const attrsStr  = match[1];
    const innerText = match[2].replace(/<[^>]+>/g, "").trim();
    const hrefMatch = /href=["']([^"']+)["']/i.exec(attrsStr);
    if (!hrefMatch) continue;

    const href       = hrefMatch[1];
    const fullHref   = href.startsWith("http") ? href : `${base}${href.startsWith("/") ? "" : "/"}${href}`;
    const isInternal = fullHref.startsWith(base);
    const link       = { full: match[0], href: fullHref, text: match[2], innerText };

    (isInternal ? internalLinks : externalLinks).push(link);
  }

  let cleaned = htmlContent;
  const brokenExternalLinks = [];

  // ── External links: verify, strip citation if clearly dead ────────────────
  if (externalLinks.length > 0) {
    const checkedExternal = await Promise.all(
      externalLinks.map(async (link) => {
        try {
          const res = await fetch(link.href, {
            method:   "HEAD",
            headers:  { "User-Agent": "Mozilla/5.0 (compatible; ContentBot/1.0)" },
            signal:   AbortSignal.timeout(8000),
            redirect: "follow",
          });
          // Bot-blocking statuses aren't proof the page is dead — trust the link.
          const inconclusive = [401, 403, 405, 429, 503].includes(res.status);
          return { ...link, status: res.status, ok: res.status < 400 || inconclusive };
        } catch {
          return { ...link, status: 0, ok: false };
        }
      })
    );

    for (const link of checkedExternal) {
      if (link.ok) {
        console.log(`[LinkCheck] ✅ External OK (${link.status || "unreachable, treated as blocked"}): ${link.href}`);
        continue;
      }
      console.log(`[LinkCheck] ⚠️  Broken external source link (${link.status}): ${link.href} — stripping citation, keeping text`);
      cleaned = cleaned.replace(link.full, link.text);
      brokenExternalLinks.push(link.href);
    }
  }

  // ── Internal links: verify, replace with a relevant post or strip ─────────
  if (internalLinks.length > 0) {
    const checkedInternal = await Promise.all(
      internalLinks.map(async (link) => {
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

    for (const link of checkedInternal) {
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
  }

  return { html: cleaned, brokenExternalLinks };
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
