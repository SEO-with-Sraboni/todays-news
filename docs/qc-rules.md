# QC rules

Every check in `public/js/qc.js`, why it exists, and the Google guidance behind it. Severity drives the score: each **error** costs 12 points and each **warning** 4 points, starting from 100.

| Severity | Meaning |
|---|---|
| Error | Likely to hurt trust or rankings — fix before publishing |
| Warning | Worth fixing; weakens quality or click-through |
| Info | Optional improvement |
| Pass | Check succeeded |

## Title & meta
| Check | Rule | Why | Source |
|---|---|---|---|
| Title length | 30–60 characters | Longer titles get truncated or rewritten in results | [Title links](https://developers.google.com/search/docs/appearance/title-link) |
| Keyword in title | Present, within the first ~40 characters | The start of a title carries the most weight for users scanning results | Title links |
| Clickbait | Flags "shocking", "you won't believe", etc. and exclamation marks | Google advises against exaggerated, sensational titles | [Helpful content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content) |
| Meta length | 120–160 characters | Shorter wastes the snippet, longer is cut off | [Snippets](https://developers.google.com/search/docs/appearance/snippet) |
| Keyword in meta / not a copy of the title | — | Matching terms are bolded; the meta should add detail | Snippets |

## Structure
| Check | Rule | Source |
|---|---|---|
| One H1 | Exactly one `#` headline containing the keyword | [SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide) |
| Subheadings | At least two H2s for articles over 350 words | SEO Starter Guide |
| Hierarchy | No skipped levels (H2 → H4) | SEO Starter Guide |
| Heading length | Under ~90 characters | Scannability |

## Content
| Check | Rule | Source |
|---|---|---|
| Thin content | Error under 60% of target length (400 words for news, 150 for briefs); warning under target | Helpful content |
| Placeholders | `[insert …]`, TODO, TBD, lorem ipsum, `{{…}}` | Helpful content |
| Duplicate sentences | Same sentence twice | Helpful content |

## Keywords
| Check | Rule | Source |
|---|---|---|
| Keyword in opening | Within the first 100 words | SEO Starter Guide |
| Density | Error above 3%, warning above 2.2% | [Spam policies — keyword stuffing](https://developers.google.com/search/docs/essentials/spam-policies#keyword-stuffing) |
| Repeated phrases | Any 3-word phrase repeated ≥5 times (scales with length) | Spam policies |
| Secondary keywords | Reports unused ones (info only — never force them) | — |

## Readability
| Check | Rule |
|---|---|
| Average sentence length | Warning above 25 words (news target 15–20) |
| Flesch reading ease | Warning below 30 |
| Long sentence | Any sentence over 40 words |
| Long paragraph | Any paragraph over 120 words |

## Helpful content & tone
| Check | Rule | Source |
|---|---|---|
| AI filler | Stock phrases such as "in today's fast-paced world", "delve", "game-changer" | [AI-generated content guidance](https://developers.google.com/search/docs/fundamentals/using-gen-ai-content) |
| Shouting | 3+ ALL-CAPS words (tickers like USD, FOMC, CPI are allowed) | Helpful content |
| Exclamation marks | 3+ in the body | Helpful content |

## Trust (YMYL)
Finance is a "Your Money or Your Life" topic, held to the highest E-E-A-T standard in the [Search Quality Rater Guidelines](https://services.google.com/fh/files/misc/hsw-sqrg.pdf).

| Check | Rule |
|---|---|
| Risky promises | Error for "guaranteed profit", "risk-free", "100% win", "can't lose", "double your money" |
| Risk disclaimer | Warning when market content has no risk/not-financial-advice line |
| Author byline | Info when no author is set |

## Sources & freshness
| Check | Rule | Source |
|---|---|---|
| Unsourced figures | 3+ prices/percentages with no sources, links or `[n]` citations | [Google News transparency](https://support.google.com/news/publisher-center/answer/9606710) |
| Unsourced quotes | Direct quotes with no source attached | E-E-A-T |
| Date reference | News must say when events happened | Google News |

## URL
| Check | Rule | Source |
|---|---|---|
| Slug format | Lowercase, hyphen-separated, no spaces/underscores/symbols, under 75 characters | [URL structure](https://developers.google.com/search/docs/crawling-indexing/url-structure) |
| Keyword in slug | Info only | URL structure |

## Adding a rule
Rules live in `run()` in `public/js/qc.js`. Call `add(severity, category, id, message, fix, refKey, match)` — pass `match` (exact text) to make the finding clickable in the editor — then add a case to `tests/qc.test.cjs`.
