// Minimal tests for the QC engine: run with `npm test`.
const assert = require("assert");
const QC = require("../public/js/qc.js");
const ids = (r) => r.findings.filter((f) => f.severity !== "pass").map((f) => f.id);

const good = `---
title: Gold Price Hits Record as Dollar Slides on Fed Rate Bets
meta_description: The gold price rose to a record on Tuesday as the dollar weakened and traders priced in Fed rate cuts. Here is what moved markets and what to watch next.
focus_keyword: gold price
slug: gold-price-record-dollar-fed
author: Jane Doe
---
# Gold Price Hits Record as Dollar Slides

The gold price climbed to a fresh record on Tuesday, October 20, as the US dollar weakened against major currencies. Traders added bets that the Federal Reserve will cut rates again in December [1].

## Key takeaways
- Spot gold rose 1.2% in the London session [1].
- The dollar index fell 0.4% [2].

## What happened
${"Bullion extended its rally through the European morning while Treasury yields eased. Analysts linked the move to softer US data released late last week. ".repeat(8)}

## Why it matters
${"A weaker dollar makes metal cheaper for overseas buyers, which tends to support demand. Central bank purchases have also stayed firm this year. ".repeat(8)}

## What to watch next
${"Investors now look to Thursday's inflation figures and comments from Fed officials for fresh direction on policy. ".repeat(6)}

_This article is for information only and is not financial advice. Trading involves risk._
`;
const r1 = QC.run({ markdown: good, sources: [{ uri: "https://a" }, { uri: "https://b" }] });
console.log("good:", r1.score, r1.grade, ids(r1));
assert.strictEqual(r1.errors, 0, "good article should have no errors");

const bad = `# Make money!!
# Second headline
#### skipped level
This is a GUARANTEED PROFIT strategy, risk-free. gold price gold price gold price gold price gold price gold price gold price. [insert chart here]. In today's fast-paced world we delve into the ever-evolving market. It's important to note this.`;
const r2 = QC.run({ markdown: bad, keyword: "gold price", title: "SHOCKING gold trick!", slug: "Gold_Price" });
console.log("bad:", r2.score, r2.grade, ids(r2));
["placeholder", "h1-multi", "h-skip", "kw-stuffing", "ymyl-promise", "clickbait", "slug-format", "thin"].forEach((id) =>
  assert.ok(ids(r2).includes(id), "expected finding " + id));

const page = QC.fromHtml('<html><head><title>T</title><meta name="description" content="D"></head><body><nav>x</nav><article><h1>Hello</h1><p>World <a href="https://x.com">link</a></p></article></body></html>');
assert.strictEqual(page.title, "T"); assert.strictEqual(page.meta, "D"); assert.ok(page.markdown.startsWith("# Hello"));
console.log("All QC tests passed.");
