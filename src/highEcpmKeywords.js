/**
 * High eCPM / high CPC keyword bank — grouped by niche.
 * Naturally embedding these in content attracts premium advertisers
 * and significantly increases AdSense eCPM.
 */

const HIGH_ECPM_KEYWORDS = {

  immigration: [
    "immigration lawyer",
    "immigration attorney",
    "citizenship by investment",
    "investor visa",
    "permanent residency application",
    "green card application",
    "work permit application",
    "skilled worker visa",
    "express entry Canada",
    "provincial nominee program",
    "UK Skilled Worker visa requirements",
    "visa sponsorship jobs",
    "immigration consultant",
    "spousal visa application",
    "student visa application",
    "O-1 visa extraordinary ability",
    "EB-2 NIW self-petition",
    "Australia skilled migration",
    "Germany Opportunity Card",
    "DV Lottery registration",
  ],

  insurance: [
    "travel insurance quotes",
    "international health insurance",
    "travel medical insurance",
    "Schengen visa insurance",
    "overseas health insurance",
    "best travel insurance plan",
    "cancel for any reason travel insurance",
    "expat health insurance",
    "travel insurance with pre-existing conditions",
  ],

  finance: [
    "international money transfer",
    "best remittance service",
    "send money abroad cheaply",
    "foreign exchange rate today",
    "open bank account abroad",
  ],

  education: [
    "fully funded scholarship",
    "scholarship application guide",
    "study abroad programs",
    "international student loan",
  ],

  // ── Tech / Smartwatch niche ──────────────────────────────────────────────
  smartwatch: [
    "best smartwatch 2026",
    "smartwatch comparison",
    "Apple Watch alternative",
    "Samsung Galaxy Watch review",
    "Garmin vs Apple Watch",
    "smartwatch with GPS tracking",
    "health monitoring smartwatch",
    "smartwatch for Android",
    "best budget smartwatch",
    "smartwatch fitness tracker",
    "ECG smartwatch",
    "blood oxygen smartwatch",
    "smartwatch battery life",
    "waterproof smartwatch",
    "smartwatch deals",
  ],

  tech: [
    "best wearable tech",
    "fitness tracker review",
    "smartwatch buying guide",
    "wearable health monitor",
    "best tech gifts",
    "tech deals today",
    "wireless earbuds comparison",
    "smart home devices",
    "best budget gadgets",
  ],

  travel: [
    "cheap flights booking",
    "best travel credit card",
    "travel rewards program",
    "budget travel tips",
    "best hotels deals",
    "vacation packages",
    "travel hacks save money",
  ],

  // ── Jobs / Immigration hybrid (for career + visa content sites) ─────────
  jobs_immigration: [
    "visa sponsorship jobs",
    "jobs with relocation package",
    "employer sponsored visa",
    "salary negotiation tips",
    "high paying jobs abroad",
    "jobs in Germany with visa",
    "jobs in Canada for foreigners",
    "green card sponsorship employer",
    "skilled worker visa application",
    "permanent residency through work",
    "immigration lawyer consultation",
    "remote jobs that pay well",
    "work permit application guide",
    "jobs for immigrants abroad",
    "career opportunities in Europe",
  ],
};

/**
 * Detects the primary niche from a topic string.
 */
function detectNiche(topic) {
  const t = topic.toLowerCase();

  if (/smartwatch|galaxy watch|apple watch|garmin|fitbit|wear os|watchos|wearable|fitness band|health watch/i.test(t)) return "smartwatch";
  if (/tech|gadget|earbuds|speaker|phone|laptop|tablet|router|drone|camera/i.test(t)) return "tech";
  if (/job|career|salary|recruit|employ|hiring|pay rise|signing bonus|overtime|hourly pay|equity|relocation package|work abroad/i.test(t)) return "jobs_immigration";
  if (/visa|immigr|citizen|resident|permit|entry|passport|lottery|express entry|skilled|nominee|sponsor|petition|green card/i.test(t)) return "immigration";
  if (/scholarship|study|student|university|school|fund/i.test(t)) return "education";
  if (/insurance|cover|health|medical|schengen|protect/i.test(t)) return "insurance";
  if (/money|transfer|remit|bank|forex|exchange|finance/i.test(t)) return "finance";
  if (/travel|hotel|flight|trip|destination|holiday|vacation/i.test(t)) return "travel";

  return "immigration"; // default for this platform
}

/**
 * Returns relevant high-eCPM keywords for a topic.
 */
function getRelevantKeywords(topic) {
  const niche = detectNiche(topic);
  const primary = HIGH_ECPM_KEYWORDS[niche] ?? [];

  // Always add a couple of related cross-niche keywords for density
  const secondary = niche === "smartwatch"       ? HIGH_ECPM_KEYWORDS.tech.slice(0, 4)
    : niche === "immigration"                    ? HIGH_ECPM_KEYWORDS.jobs_immigration.slice(0, 4)
    : niche === "jobs_immigration"               ? HIGH_ECPM_KEYWORDS.immigration.slice(0, 4)
    : niche === "travel"                         ? HIGH_ECPM_KEYWORDS.insurance.slice(0, 3)
    : [];

  return [...new Set([...primary.slice(0, 10), ...secondary])];
}

module.exports = { HIGH_ECPM_KEYWORDS, detectNiche, getRelevantKeywords };
