/* Today's News — seed data: starter publications, Google policy library, sample article.
 * Seeded publications only carry their public guideline links. Their rules are
 * imported from those pages inside the app (Publications → Import rules), so
 * nothing here invents a publication's policy.
 */
(function (root) {
  "use strict";

  const emptyRules = () => ({
    minWords: null, maxWords: null, titleMaxChars: null, minLinks: null, maxLinks: null,
    requireSources: false, noAffiliateLinks: false, noPromotional: false, disclaimerRequired: false,
    disclaimerText: "", spelling: "any", headingCase: "any", firstPerson: "any",
    bioRequired: false, bioMaxWords: null, requiredSections: [], bannedPhrases: [], requiredPhrases: [],
    otherRules: [],
  });

  const PROFILES = [
    {
      id: "house", name: "Today's News (house style)", domain: "", category: "Multi-asset",
      guidelinesUrl: "", aiPolicy: "allowed", aiPolicyNote: "", imported: true, color: "#c9a24a",
      notes: "Default profile for your own drafts. Edit freely.",
      rules: Object.assign(emptyRules(), {
        minWords: 400, maxWords: 1200, titleMaxChars: 70, minLinks: 1, requireSources: true,
        noPromotional: true, disclaimerRequired: true,
        disclaimerText: "This article is for information only and is not financial advice.",
        spelling: "US", firstPerson: "avoid", requiredSections: ["Key takeaways", "What to watch"],
        otherRules: ["Neutral, factual tone with no trading signals or price targets presented as certain."],
      }),
    },
    {
      id: "fxstreet", name: "FXStreet", domain: "fxstreet.com", category: "Forex",
      guidelinesUrl: "https://about.fxstreet.com/become-contributor/editorial-guidelines/",
      extraUrls: ["https://about.fxstreet.com/become-contributor/"],
      aiPolicy: "unknown", aiPolicyNote: "", imported: false, color: "#e8692c", notes: "", rules: emptyRules(),
    },
    {
      id: "fxempire", name: "FX Empire", domain: "fxempire.com", category: "Forex · Commodities · Crypto",
      guidelinesUrl: "https://www.fxempire.com/editorial-guidelines",
      extraUrls: ["https://fxempire.com/become-a-contributor"],
      aiPolicy: "unknown", aiPolicyNote: "", imported: false, color: "#2d6cdf", notes: "", rules: emptyRules(),
    },
    {
      id: "seekingalpha", name: "Seeking Alpha", domain: "seekingalpha.com", category: "Stocks · ETFs · Indices",
      guidelinesUrl: "https://about.seekingalpha.com/article-submission-guidelines",
      extraUrls: ["https://about.seekingalpha.com/summary-editorial-policies"],
      aiPolicy: "unknown", aiPolicyNote: "", imported: false, color: "#f5a623", notes: "", rules: emptyRules(),
    },
    {
      id: "benzinga", name: "Benzinga", domain: "benzinga.com", category: "Stocks · Markets",
      guidelinesUrl: "https://www.benzinga.com/contribute/guidelines",
      aiPolicy: "unknown", aiPolicyNote: "", imported: false, color: "#1f8ef1", notes: "", rules: emptyRules(),
    },
    {
      id: "cointelegraph", name: "Cointelegraph", domain: "cointelegraph.com", category: "Crypto",
      guidelinesUrl: "https://cointelegraph.com/news/we-want-you",
      aiPolicy: "unknown", aiPolicyNote: "", imported: false, color: "#3a3a3a", notes: "", rules: emptyRules(),
    },
  ];

  const POLICIES = [
    { group: "Quality", title: "Creating helpful, reliable, people-first content", url: "https://developers.google.com/search/docs/fundamentals/creating-helpful-content",
      summary: "Content should be written for readers first, show first-hand expertise, and add original value rather than summarizing others.",
      checks: ["Thin content", "Clickbait titles", "Filler phrases", "Readability"] },
    { group: "Quality", title: "Using generative AI content", url: "https://developers.google.com/search/docs/fundamentals/using-gen-ai-content",
      summary: "AI-assisted content is fine when it is accurate, original and useful; mass-produced content made mainly to rank is spam.",
      checks: ["AI filler phrases", "Duplicate sentences"] },
    { group: "Spam", title: "Spam policies — keyword stuffing", url: "https://developers.google.com/search/docs/essentials/spam-policies#keyword-stuffing",
      summary: "Repeating keywords or phrases unnaturally to manipulate rankings can lead to demotion or removal.",
      checks: ["Keyword density", "Repeated phrases"] },
    { group: "Spam", title: "Spam policies — scaled content abuse", url: "https://developers.google.com/search/docs/essentials/spam-policies#scaled-content",
      summary: "Publishing many pages with little value, by any method, primarily to rank is treated as spam.",
      checks: ["Thin content", "Site AI policy"] },
    { group: "Trust", title: "Search Quality Rater Guidelines (E-E-A-T, YMYL)", url: "https://services.google.com/fh/files/misc/hsw-sqrg.pdf",
      summary: "Finance is a Your Money or Your Life topic held to the highest standard of experience, expertise, authority and trust.",
      checks: ["Risky promises", "Risk disclaimer", "Author byline", "Unsourced quotes"] },
    { group: "Appearance", title: "Influencing title links", url: "https://developers.google.com/search/docs/appearance/title-link",
      summary: "Write unique, descriptive, concise titles; avoid keyword stuffing and boilerplate.",
      checks: ["Title length", "Keyword in title"] },
    { group: "Appearance", title: "Control your snippets", url: "https://developers.google.com/search/docs/appearance/snippet",
      summary: "A meta description should summarize the page accurately; Google may use it in results.",
      checks: ["Meta length", "Keyword in meta"] },
    { group: "News", title: "Google News — transparency", url: "https://support.google.com/news/publisher-center/answer/9606710",
      summary: "News sources should show clear dates, bylines, author information and contact details.",
      checks: ["Date reference", "Sources", "Author byline"] },
    { group: "News", title: "Article structured data", url: "https://developers.google.com/search/docs/appearance/structured-data/article",
      summary: "NewsArticle markup with headline, image, dates and author helps Google understand and display the story.",
      checks: ["Article schema", "datePublished / dateModified", "Author URL"] },
    { group: "Technical", title: "URL structure best practices", url: "https://developers.google.com/search/docs/crawling-indexing/url-structure",
      summary: "Use simple, readable, lowercase URLs with hyphens between words.",
      checks: ["Slug format", "Canonical URL"] },
    { group: "Technical", title: "Image SEO best practices", url: "https://developers.google.com/search/docs/appearance/google-images",
      summary: "Use descriptive alt text and high-quality images close to relevant text.",
      checks: ["Image alt text", "Open Graph image"] },
  ];

  const SAMPLE = `---
title: Gold Price Climbs as Dollar Eases Ahead of US Inflation Data
meta_description: The gold price edged higher on Tuesday as the US dollar softened and traders waited for inflation data that could shape the Fed's next move.
focus_keyword: gold price
secondary_keywords: XAU/USD, US dollar, Fed rate cut
slug: gold-price-dollar-inflation-data
author: Today's News Desk
---
# Gold Price Climbs as Dollar Eases Ahead of US Inflation Data

The gold price rose on Tuesday as the US dollar slipped against major currencies. Traders are positioning ahead of Thursday's US inflation report, which could shape expectations for the Federal Reserve's next decision [1].

## Key takeaways
- Spot gold gained during the London session as the dollar index eased [1].
- Treasury yields edged lower, reducing the cost of holding non-yielding bullion [2].
- Thursday's consumer price data is the next major catalyst.

## What happened
Bullion extended its gains through the European morning. The move followed softer US data late last week, which nudged traders toward pricing in further rate cuts. Volumes were moderate, with many desks waiting for the inflation release.

## Why it matters
A weaker dollar makes gold cheaper for buyers using other currencies, which tends to support demand. Lower yields also reduce the opportunity cost of holding the metal. Central bank buying has added steady support this year.

## Market reaction
Silver followed gold higher, while major stock indices traded mixed. The dollar was softer against the euro and the yen.

## What to watch next
Investors will focus on Thursday's inflation figures and on comments from Fed officials. A hotter-than-expected reading could lift the dollar and weigh on gold.

_This article is for information only and is not financial advice. Trading involves risk._
`;

  root.SeedData = { PROFILES, POLICIES, SAMPLE, emptyRules };
})(window);
