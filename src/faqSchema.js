/**
 * Extracts the FAQ section every generated post already includes
 * (<h3 class="faq-question">/<p class="faq-answer"> pairs, per the prompt
 * in generatePost.js/refreshPost.js) and appends a FAQPage JSON-LD block so
 * those posts are eligible for Google's expandable FAQ rich snippets.
 * No-ops (returns htmlContent unchanged) if no FAQ section is found.
 */
function injectFaqSchema(htmlContent) {
  const faqRegex = /<h3\s+class=["']faq-question["'][^>]*>([\s\S]*?)<\/h3>\s*<p\s+class=["']faq-answer["'][^>]*>([\s\S]*?)<\/p>/gi;
  const faqs = [];
  let match;

  while ((match = faqRegex.exec(htmlContent)) !== null) {
    const question = cleanText(match[1]).replace(/^Q:\s*/i, "");
    const answer   = cleanText(match[2]).replace(/^A:\s*/i, "");
    if (question && answer) faqs.push({ question, answer });
  }

  if (faqs.length === 0) return htmlContent;

  const schema = {
    "@context": "https://schema.org",
    "@type":    "FAQPage",
    "mainEntity": faqs.map((f) => ({
      "@type":         "Question",
      "name":          f.question,
      "acceptedAnswer": { "@type": "Answer", "text": f.answer },
    })),
  };

  console.log(`[FaqSchema] Injected FAQPage schema for ${faqs.length} question(s)`);

  return `${htmlContent}\n<script type="application/ld+json">${JSON.stringify(schema)}</script>`;
}

function cleanText(str) {
  return str.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

module.exports = { injectFaqSchema };
