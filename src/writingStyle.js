/**
 * Writing style rules injected into every content generation prompt.
 * Applied to HTML body calls only (not metadata JSON calls).
 */
const WRITING_STYLE = `
WRITING STYLE — follow these rules exactly:
DO:
- Use clear, simple language anyone can understand.
- Keep sentences short and direct.
- Use active voice. Write "You can apply online" not "Applications can be submitted online."
- Address the reader as "you" and "your" throughout.
- Back up every claim with a specific number, example, or source.
- Focus on practical steps the reader can take right now.
- Use bullet lists to break down steps or options.

DO NOT:
- Use em dashes (—) anywhere. Use a comma or period instead.
- Use semicolons.
- Use asterisks or markdown formatting. Use HTML tags only.
- Write metaphors or clichés (e.g. "game-changer", "at the end of the day").
- Make broad generalizations (e.g. "everyone wants a better life").
- Use closing phrases like "in conclusion", "to summarise", "final thoughts".
- Add unnecessary adjectives or adverbs (e.g. "incredibly easy", "highly competitive").
- Use constructions like "not only... but also..." or "not just... but...".
- Use hashtags.
- Add warnings, notes, or disclaimers outside of the designated disclaimer block.

Before finishing, review the content and fix any grammar or factual errors.`.trim();

module.exports = { WRITING_STYLE };
