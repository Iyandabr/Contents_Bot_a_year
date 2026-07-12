function getSites() {
  const raw = process.env.WP_SITES;

  if (raw) {
    let sites;
    try {
      const cleaned = raw.replace(/[\x00-\x1F\x7F]/g, (ch) =>
        (ch === "\n" || ch === "\r" || ch === "\t") ? " " : ""
      );
      sites = JSON.parse(cleaned);
    } catch (e) {
      throw new Error(
        `WP_SITES is not valid JSON: ${e.message}\n` +
        `First 100 chars received: ${raw.slice(0, 100)}`
      );
    }

    if (!Array.isArray(sites) || sites.length === 0) {
      throw new Error("WP_SITES must be a non-empty JSON array.");
    }

    return sites.map((s, i) => {
      if (!s.url)      throw new Error(`WP_SITES[${i}] is missing "url"`);
      if (!s.username) throw new Error(`WP_SITES[${i}] is missing "username"`);
      if (!s.password) throw new Error(`WP_SITES[${i}] is missing "password"`);

      const allCats = Array.isArray(s.allCategoryIds) && s.allCategoryIds.length > 0
        ? s.allCategoryIds
        : Array.isArray(s.categoryIds) ? s.categoryIds : [Number(s.categoryIds ?? 1)];

      return {
        name:           s.name ?? s.url,
        url:            s.url.replace(/\/$/, ""),
        username:       s.username,
        password:       s.password,
        allCategoryIds: allCats,
        categoryIds:    allCats,
        status:         s.status ?? "publish",
        authorId:       s.authorId ?? null,
        niche:          s.niche ?? null,
        uniqueContent:  s.uniqueContent ?? true,
      };
    });
  }

  const { WP_SITE_URL, WP_USERNAME, WP_APP_PASSWORD } = process.env;
  if (!WP_SITE_URL || !WP_USERNAME || !WP_APP_PASSWORD) {
    throw new Error(
      "No WordPress site configured. Set WP_SITES (JSON array) or " +
      "WP_SITE_URL + WP_USERNAME + WP_APP_PASSWORD."
    );
  }

  return [{
    name:           WP_SITE_URL,
    url:            WP_SITE_URL.replace(/\/$/, ""),
    username:       WP_USERNAME,
    password:       WP_APP_PASSWORD,
    allCategoryIds: (process.env.WP_CATEGORY_IDS ?? "1").split(",").map(Number).filter(Boolean),
    categoryIds:    (process.env.WP_CATEGORY_IDS ?? "1").split(",").map(Number).filter(Boolean),
    status:         process.env.WP_POST_STATUS ?? "publish",
    authorId:       process.env.WP_AUTHOR_ID ?? null,
    niche:          null,
    uniqueContent:  true,
  }];
}

module.exports = { getSites };
