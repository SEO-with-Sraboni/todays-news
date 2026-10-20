/* Today's News — Content QC engine.
 * Pure functions, no network. Takes an article (markdown) plus SEO fields and
 * returns findings mapped to Google Search guidance. Works in the browser
 * (window.QC) and in Node (module.exports) so it can be unit-tested.
 */
(function (root) {
  "use strict";

  const REFS = {
    spam: { label: "Google spam policies — keyword stuffing", url: "https://developers.google.com/search/docs/essentials/spam-policies#keyword-stuffing" },
    helpful: { label: "Creating helpful, reliable, people-first content", url: "https://developers.google.com/search/docs/fundamentals/creating-helpful-content" },
    title: { label: "Influencing title links", url: "https://developers.google.com/search/docs/appearance/title-link" },
    snippet: { label: "Control your snippets (meta description)", url: "https://developers.google.com/search/docs/appearance/snippet" },
    headings: { label: "SEO Starter Guide — headings & structure", url: "https://developers.google.com/search/docs/fundamentals/seo-starter-guide" },
    url: { label: "URL structure best practices", url: "https://developers.google.com/search/docs/crawling-indexing/url-structure" },
    eeat: { label: "Search Quality Rater Guidelines — E-E-A-T & YMYL", url: "https://services.google.com/fh/files/misc/hsw-sqrg.pdf" },
    ai: { label: "Google guidance on AI-generated content", url: "https://developers.google.com/search/docs/fundamentals/using-gen-ai-content" },
    news: { label: "Google News — transparency & dates", url: "https://support.google.com/news/publisher-center/answer/9606710" },
    links: { label: "Link best practices", url: "https://developers.google.com/search/docs/crawling-indexing/links-crawlable" },
  };

  const STOP = new Set("a an the and or but of to in on at for by with from as is are was were be been it its this that these those than then so if into over under about after before up down out not no".split(" "));

  const HYPE_TITLE = [/you won'?t believe/i, /\bshocking\b/i, /\bunbelievable\b/i, /\bjaw[- ]dropping\b/i, /\bmind[- ]blowing\b/i, /\bsecret\b/i, /\bthis one trick\b/i, /\bgoes viral\b/i, /\binsane\b/i, /\bmust[- ]see\b/i];

  const YMYL_RED_FLAGS = [
    /guaranteed (profit|returns?|gains?|win)/i, /\brisk[- ]free\b/i, /\b100% (win|accurate|accuracy|profit)/i,
    /\bcan'?t lose\b/i, /\bsure[- ]?shot\b/i, /\bget rich\b/i, /\bdouble your (money|account)\b/i,
    /\bno[- ]risk\b/i, /\bfree money\b/i, /\bguaranteed\b/i,
  ];

  const AI_BOILERPLATE = [
    /in today'?s fast[- ]paced/i, /\bdelve\b/i, /it'?s (important|worth) (to note|noting)/i, /\bin conclusion\b/i,
    /\bas an ai\b/i, /\bever[- ]evolving\b/i, /\bnavigat(e|ing) the (complex|intricate)/i, /\btapestry\b/i,
    /\bin the realm of\b/i, /\bunlock the (power|potential)\b/i, /\bgame[- ]changer\b/i, /\bembark on\b/i,
    /\bin summary\b/i, /\blet'?s dive in\b/i, /\bseamless(ly)?\b/i,
  ];

  const PLACEHOLDERS = [/\[insert[^\]]*\]/i, /\bTODO\b/, /\bTBD\b/, /lorem ipsum/i, /\[(source|citation) needed\]/i, /\bXX+\b/, /\{\{[^}]+\}\}/];

  // ---------- helpers ----------
  const norm = (s) => (s || "").toLowerCase().replace(/[’']/g, "'").trim();

  function stripMarkdown(md) {
    return (md || "")
      .replace(/^---[\s\S]*?\n---\s*/m, "")
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/^\s*[-*+]\s+/gm, "")
      .replace(/^\s*\d+\.\s+/gm, "")
      .replace(/^\s*>\s?/gm, "")
      .replace(/[*_`~]/g, "")
      .replace(/\[\d+\]/g, "");
  }

  function words(text) {
    return (text.match(/[A-Za-z0-9][A-Za-z0-9'’.%$-]*/g) || []).map((w) => w.replace(/[.]+$/, ""));
  }

  function sentences(text) {
    return text
      .replace(/\n+/g, " ")
      .split(/(?<=[.!?])\s+(?=[A-Z0-9"“])/)
      .map((s) => s.trim())
      .filter((s) => words(s).length >= 3);
  }

  function syllables(word) {
    let w = word.toLowerCase().replace(/[^a-z]/g, "");
    if (!w) return 0;
    if (w.length <= 3) return 1;
    w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
    const m = w.match(/[aeiouy]{1,2}/g);
    return Math.max(1, m ? m.length : 1);
  }

  function countPhrase(text, phrase) {
    if (!phrase) return 0;
    const esc = norm(phrase).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    const re = new RegExp("(^|[^a-z0-9])" + esc + "(?=$|[^a-z0-9])", "gi");
    return (norm(text).match(re) || []).length;
  }

  function parseFrontMatter(md) {
    const m = (md || "").match(/^\s*---\s*\n([\s\S]*?)\n---\s*\n?/);
    const fields = {};
    if (!m) return { fields, body: md || "" };
    m[1].split("\n").forEach((line) => {
      const kv = line.match(/^\s*([a-zA-Z_ ]+?)\s*:\s*(.*)$/);
      if (kv) fields[kv[1].trim().toLowerCase().replace(/\s+/g, "_")] = kv[2].trim().replace(/^["']|["']$/g, "");
    });
    return { fields, body: md.slice(m[0].length) };
  }

  function headings(md) {
    const out = [];
    let inCode = false;
    (md || "").split("\n").forEach((line, i) => {
      if (/^```/.test(line)) inCode = !inCode;
      if (inCode) return;
      const h = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
      if (h) out.push({ level: h[1].length, text: h[2].replace(/[*_`]/g, ""), line: i });
    });
    return out;
  }

  function paragraphs(md) {
    return (md || "")
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p && !/^#{1,6}\s/.test(p) && !/^\s*([-*+]|\d+\.)\s/.test(p) && !/^```/.test(p) && !/^\|/.test(p));
  }

  function ngrams(ws, n) {
    const counts = new Map();
    for (let i = 0; i + n <= ws.length; i++) {
      const g = ws.slice(i, i + n);
      if (g.every((w) => STOP.has(w))) continue;
      if (STOP.has(g[0]) || STOP.has(g[n - 1])) continue;
      const k = g.join(" ");
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    return counts;
  }

  // ---------- main ----------
  function run(input) {
    const md = input.markdown || "";
    const fm = parseFrontMatter(md);
    const body = fm.body;
    const title = (input.title || fm.fields.title || "").trim();
    const meta = (input.meta || fm.fields.meta_description || fm.fields.description || "").trim();
    const kw = norm(input.keyword || fm.fields.focus_keyword || fm.fields.keyword || "");
    const secondary = (input.secondary || fm.fields.secondary_keywords || "")
      .split(",").map((s) => norm(s)).filter(Boolean);
    const slug = (input.slug || fm.fields.slug || "").trim();
    const author = (input.author || fm.fields.author || "").trim();
    const sources = input.sources || [];
    const contentType = input.contentType || "news";

    const plain = stripMarkdown(body);
    const ws = words(plain);
    const lw = ws.map((w) => w.toLowerCase());
    const wc = ws.length;
    const sents = sentences(plain);
    const hs = headings(body);
    const paras = paragraphs(body);
    const F = [];
    const add = (severity, category, id, message, fix, ref, match) =>
      F.push({ severity, category, id, message, fix: fix || "", ref: ref ? REFS[ref] : null, match: match || null });

    // ----- Empty state -----
    if (wc < 30) {
      add("error", "Content", "empty", "There is almost no article text to check yet.", "Generate an article or paste your draft into the editor, then run QC again.", "helpful");
      return summarize(F, { wc, sents: sents.length, title, meta, kw });
    }

    // ----- Placeholders -----
    PLACEHOLDERS.forEach((re) => {
      const m = body.match(re);
      if (m) add("error", "Content", "placeholder", `Unfinished placeholder found: “${m[0]}”.`, "Replace it with real, verified information or delete it before publishing.", "helpful", m[0]);
    });

    // ----- Title -----
    if (!title) add("error", "Title & meta", "title-missing", "No SEO title set.", "Add a title (30–60 characters) in the Title field or the front matter.", "title");
    else {
      const tl = title.length;
      if (tl < 30) add("warn", "Title & meta", "title-short", `Title is short (${tl} chars).`, "Aim for 30–60 characters so it describes the story fully.", "title");
      else if (tl > 60) add("warn", "Title & meta", "title-long", `Title is ${tl} chars and may be cut off in search results.`, "Trim to about 60 characters; put the key fact first.", "title");
      else add("pass", "Title & meta", "title-len", `Title length is good (${tl} chars).`);
      if (kw) {
        const pos = norm(title).indexOf(kw);
        if (pos < 0) add("warn", "Title & meta", "title-kw", "Focus keyword is not in the title.", `Work “${kw}” into the title naturally.`, "title");
        else if (pos > 40) add("warn", "Title & meta", "title-kw-late", "Focus keyword appears late in the title.", "Move it closer to the start — the front of the title carries the most weight.", "title");
        else add("pass", "Title & meta", "title-kw-ok", "Focus keyword is near the start of the title.");
      }
      HYPE_TITLE.forEach((re) => {
        const m = title.match(re);
        if (m) add("warn", "Helpful content", "clickbait", `Clickbait wording in title: “${m[0]}”.`, "Google advises against exaggerated or shocking titles. State the actual news instead.", "helpful", m[0]);
      });
      if (/!{1,}/.test(title)) add("warn", "Helpful content", "title-exclaim", "Title uses an exclamation mark.", "News titles read as more trustworthy without exclamation marks.", "helpful");
    }

    // ----- Meta description -----
    if (!meta) add("warn", "Title & meta", "meta-missing", "No meta description.", "Write a 120–160 character summary of the story with the focus keyword.", "snippet");
    else {
      const ml = meta.length;
      if (ml < 120) add("warn", "Title & meta", "meta-short", `Meta description is short (${ml} chars).`, "Expand to 120–160 characters with the key fact and why it matters.", "snippet");
      else if (ml > 160) add("warn", "Title & meta", "meta-long", `Meta description is ${ml} chars and will likely be truncated.`, "Trim to 160 characters or fewer.", "snippet");
      else add("pass", "Title & meta", "meta-len", `Meta description length is good (${ml} chars).`);
      if (kw && norm(meta).indexOf(kw) < 0) add("warn", "Title & meta", "meta-kw", "Focus keyword is not in the meta description.", "Include it once — Google bolds matching terms in snippets.", "snippet");
      if (title && norm(meta) === norm(title)) add("warn", "Title & meta", "meta-dup", "Meta description just repeats the title.", "Use it to add detail the title can't fit.", "snippet");
    }

    // ----- Headings -----
    const h1s = hs.filter((h) => h.level === 1);
    if (h1s.length === 0) add("error", "Structure", "h1-missing", "No H1 heading.", "Start the article with one `# Headline`.", "headings");
    else if (h1s.length > 1) add("warn", "Structure", "h1-multi", `There are ${h1s.length} H1 headings.`, "Keep one H1 (the headline); turn the others into `##` sections.", "headings", "# " + h1s[1].text);
    else {
      add("pass", "Structure", "h1-ok", "One H1 headline.");
      if (kw && norm(h1s[0].text).indexOf(kw) < 0) add("warn", "Structure", "h1-kw", "Focus keyword is not in the H1.", "Include the keyword (or a close variant) in the headline.", "headings");
    }
    const h2s = hs.filter((h) => h.level === 2);
    if (wc > 350 && h2s.length < 2) add("warn", "Structure", "h2-few", "Few subheadings for an article this long.", "Break the story into sections such as What happened, Why it matters, What to watch.", "headings");
    for (let i = 1; i < hs.length; i++) {
      if (hs[i].level > hs[i - 1].level + 1) {
        add("warn", "Structure", "h-skip", `Heading level jumps from H${hs[i - 1].level} to H${hs[i].level}: “${hs[i].text}”.`, "Don't skip levels — use H2 under H1, H3 under H2.", "headings", hs[i].text);
        break;
      }
    }
    const longH = hs.find((h) => h.text.length > 90);
    if (longH) add("warn", "Structure", "h-long", "A heading is very long.", "Keep headings short and scannable (under ~70 characters).", "headings", longH.text);

    // ----- Length -----
    const minWords = contentType === "brief" ? 150 : 400;
    if (wc < minWords * 0.6) add("error", "Content", "thin", `Only ${wc} words — this is likely too thin to be useful.`, `Add context: background, market reaction, what to watch. Target ${minWords}+ words.`, "helpful");
    else if (wc < minWords) add("warn", "Content", "short", `${wc} words — a little short for a full news piece.`, `Aim for at least ${minWords} words of substance (not padding).`, "helpful");
    else add("pass", "Content", "length", `Length is solid (${wc} words).`);

    // ----- Keyword usage -----
    if (!kw) add("info", "Keywords", "kw-none", "No focus keyword set — keyword checks skipped.", "Add the main search phrase readers would use to find this story.");
    else {
      const occ = countPhrase(plain, kw);
      const kwWords = kw.split(/\s+/).length;
      const density = (occ * kwWords * 100) / Math.max(wc, 1);
      const first100 = ws.slice(0, 100).join(" ");
      if (occ === 0) add("warn", "Keywords", "kw-missing", "Focus keyword never appears in the body.", `Use “${kw}” naturally in the opening and once or twice later.`, "helpful");
      else {
        if (countPhrase(first100, kw) === 0) add("warn", "Keywords", "kw-intro", "Focus keyword is not in the first 100 words.", "Mention the main topic in the lede so readers (and Google) know what the story is about.", "headings");
        else add("pass", "Keywords", "kw-intro-ok", "Focus keyword appears in the opening.");
        if (density > 3) add("error", "Keywords", "kw-stuffing", `Keyword density is ${density.toFixed(1)}% (${occ} uses) — this looks like keyword stuffing.`, "Google's spam policies penalize repeating keywords unnaturally. Use synonyms and pronouns; aim for roughly 0.5–2%.", "spam", kw);
        else if (density > 2.2) add("warn", "Keywords", "kw-high", `Keyword density is a little high (${density.toFixed(1)}%).`, "Swap some uses for natural variations.", "spam", kw);
        else add("pass", "Keywords", "kw-density", `Keyword density looks natural (${density.toFixed(1)}%, ${occ} uses).`);
      }
      const missingSec = secondary.filter((s) => countPhrase(plain, s) === 0);
      if (secondary.length && missingSec.length) add("info", "Keywords", "sec-missing", `Secondary keywords not used: ${missingSec.join(", ")}.`, "Cover them only where they fit the story naturally.");
      else if (secondary.length) add("pass", "Keywords", "sec-ok", "All secondary keywords are covered.");
    }

    // Repeated phrases (stuffing beyond the focus keyword)
    const grams = ngrams(lw, 3);
    let worst = null;
    grams.forEach((c, g) => {
      if (kw && g === kw) return;
      if (!worst || c > worst[1]) worst = [g, c];
    });
    if (worst && worst[1] >= Math.max(5, Math.round(wc / 150))) add("warn", "Keywords", "phrase-repeat", `The phrase “${worst[0]}” repeats ${worst[1]} times.`, "Vary your wording — heavy repetition reads as stuffing.", "spam", worst[0]);

    // ----- Readability -----
    if (sents.length) {
      const avg = wc / sents.length;
      const syl = ws.reduce((a, w) => a + syllables(w), 0);
      const flesch = 206.835 - 1.015 * avg - 84.6 * (syl / Math.max(wc, 1));
      if (avg > 25) add("warn", "Readability", "sent-avg", `Average sentence length is ${avg.toFixed(0)} words.`, "News reads best around 15–20 words per sentence. Split long sentences.", "helpful");
      else add("pass", "Readability", "sent-avg-ok", `Average sentence length is ${avg.toFixed(0)} words.`);
      if (flesch < 30) add("warn", "Readability", "flesch", `Reading ease score is low (${flesch.toFixed(0)}/100).`, "Use shorter words and sentences; explain jargon.", "helpful");
      else add("pass", "Readability", "flesch-ok", `Reading ease score: ${flesch.toFixed(0)}/100.`);
      const longS = sents.find((s) => words(s).length > 40);
      if (longS) add("warn", "Readability", "sent-long", `A sentence has ${words(longS).length} words.`, "Break it into two or three sentences.", "helpful", longS.slice(0, 80));
    }
    const longP = paras.find((p) => words(stripMarkdown(p)).length > 120);
    if (longP) add("warn", "Readability", "para-long", "A paragraph is over 120 words.", "Split it — short paragraphs are easier to scan on mobile.", "helpful", longP.slice(0, 80));

    // Duplicate sentences
    const seen = new Map();
    for (const s of sents) {
      const k = norm(s).replace(/[^a-z0-9 ]/g, "");
      if (k.length < 25) continue;
      if (seen.has(k)) { add("warn", "Content", "dup-sentence", "A sentence appears twice.", "Remove the repeat.", "helpful", s.slice(0, 80)); break; }
      seen.set(k, 1);
    }

    // ----- Helpful content & AI tone -----
    const boiler = [];
    AI_BOILERPLATE.forEach((re) => { const m = plain.match(re); if (m) boiler.push(m[0]); });
    if (boiler.length >= 3) add("warn", "Helpful content", "ai-tone", `Generic filler phrases: ${boiler.slice(0, 4).map((b) => "“" + b + "”").join(", ")}.`, "Replace stock phrases with specific facts. Google rewards original value, not template wording.", "ai", boiler[0]);
    else if (boiler.length) add("info", "Helpful content", "ai-tone-light", `Filler phrase spotted: “${boiler[0]}”.`, "Consider replacing it with something specific.", "ai", boiler[0]);
    else add("pass", "Helpful content", "ai-tone-ok", "No stock filler phrases found.");

    const caps = (body.match(/\b[A-Z]{5,}\b/g) || []).filter((w) => !/^(NASDAQ|NYSE|OPEC|FOMC|ECB|BOJ|USD|EUR|GBP|JPY|AUD|CAD|CHF|NZD|XAU|XAG|WTI|BRENT|NFP|CPI|PCE|GDP|HTTPS?)$/.test(w));
    if (caps.length >= 3) add("warn", "Helpful content", "caps", `Several ALL-CAPS words (${caps.slice(0, 3).join(", ")}).`, "Shouting reduces trust. Use normal case for emphasis.", "helpful", caps[0]);
    const exclaims = (plain.match(/!/g) || []).length;
    if (exclaims >= 3) add("warn", "Helpful content", "exclaims", `${exclaims} exclamation marks in the body.`, "Keep a calm, factual news tone.", "helpful", "!");

    // ----- YMYL / finance -----
    const flags = [];
    YMYL_RED_FLAGS.forEach((re) => { const m = plain.match(re); if (m) flags.push(m[0]); });
    if (flags.length) add("error", "Trust (YMYL)", "ymyl-promise", `Risky financial promise: “${flags[0]}”.`, "Financial content is “Your Money or Your Life”. Never promise profits or zero risk — describe probabilities and risks instead.", "eeat", flags[0]);
    const finance = /\b(forex|fx|trad(e|ing|er)|stocks?|crypto|bitcoin|gold|oil|market|invest(ing|ment|or)?|currency|yields?)\b/i.test(plain);
    if (finance) {
      if (!/\b(risk|not (financial|investment) advice|for (informational|educational) purposes|past performance)\b/i.test(plain)) add("warn", "Trust (YMYL)", "disclaimer", "No risk disclaimer found for market content.", "Add a short line such as: “This article is for information only and is not financial advice. Trading involves risk.”", "eeat");
      else add("pass", "Trust (YMYL)", "disclaimer-ok", "Risk disclaimer present.");
    }
    if (!author) add("info", "Trust (YMYL)", "author", "No author byline set.", "Add an author name (Settings → Byline). Clear authorship supports E-E-A-T.", "eeat");
    else add("pass", "Trust (YMYL)", "author-ok", `Byline: ${author}.`);

    // ----- Sourcing & freshness -----
    const numbers = (plain.match(/(\$|€|£)?\d[\d,.]*\s?(%|bps|basis points|pips?|billion|million|trillion)?/g) || []).filter((n) => /\d{2,}|%|\./.test(n));
    const mdLinks = (body.match(/\]\((https?:\/\/[^)]+)\)/g) || []).length;
    const refs = (body.match(/\[\d+\]/g) || []).length;
    if (numbers.length >= 3 && !sources.length && !mdLinks && !refs) add("warn", "Sources", "unsourced", `${numbers.length} figures with no sources attached.`, "Link or cite where prices and data come from — readers and Google look for verifiable facts.", "news");
    else if (sources.length || mdLinks || refs) add("pass", "Sources", "sourced", `Sources attached (${sources.length || mdLinks || refs}).`);
    if (contentType === "news") {
      const dated = /\b(today|yesterday|this week|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|20\d\d)\b/i.test(plain);
      if (!dated) add("warn", "Sources", "undated", "The story has no date or time reference.", "News should make clear when events happened (e.g. “on Tuesday” or the date).", "news");
    }
    const quotes = plain.match(/[“"][^”"]{20,}[”"]/g) || [];
    if (quotes.length && !sources.length && !mdLinks) add("warn", "Sources", "quote-unsourced", "Direct quotes without a source.", "Attribute every quote to a named person and link the original. Never invent quotes.", "eeat", quotes[0].slice(0, 40));

    // ----- URL slug -----
    if (slug) {
      if (/[A-Z]/.test(slug) || /[_\s]/.test(slug) || /[^a-z0-9\-/]/.test(slug)) add("warn", "URL", "slug-format", `Slug “${slug}” has capitals, spaces, underscores or symbols.`, "Use lowercase words joined by hyphens.", "url");
      else if (slug.length > 75) add("warn", "URL", "slug-long", `Slug is long (${slug.length} chars).`, "Shorten to the key words.", "url");
      else add("pass", "URL", "slug-ok", "Slug format is clean.");
      if (kw && slug.toLowerCase().indexOf(kw.replace(/\s+/g, "-")) < 0) add("info", "URL", "slug-kw", "Slug doesn't contain the focus keyword.", "Optional, but a descriptive slug helps users.", "url");
    }

    return summarize(F, { wc, sents: sents.length, title, meta, kw });
  }

  function summarize(findings, stats) {
    const errors = findings.filter((f) => f.severity === "error").length;
    const warns = findings.filter((f) => f.severity === "warn").length;
    const passes = findings.filter((f) => f.severity === "pass").length;
    const score = Math.max(0, Math.min(100, 100 - errors * 12 - warns * 4));
    const grade = errors ? (score >= 70 ? "Fix errors before publishing" : "Needs work") : score >= 85 ? "Ready to publish" : score >= 70 ? "Nearly there" : "Needs work";
    const order = { error: 0, warn: 1, info: 2, pass: 3 };
    findings.sort((a, b) => order[a.severity] - order[b.severity]);
    return { score, grade, errors, warns, passes, findings, stats };
  }

  // Extracts article fields from a fetched HTML page (used by URL import).
  function fromHtml(html) {
    const get = (re) => { const m = html.match(re); return m ? decode(m[1].trim()) : ""; };
    const decode = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ");
    const title = get(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const meta = get(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) || get(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
    let main = (html.match(/<article[\s\S]*?<\/article>/i) || html.match(/<main[\s\S]*?<\/main>/i) || html.match(/<body[\s\S]*?<\/body>/i) || [html])[0];
    main = main.replace(/<(script|style|nav|footer|header|aside|form|noscript|svg)[\s\S]*?<\/\1>/gi, " ");
    const md = main
      .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, l, t) => "\n\n" + "#".repeat(+l) + " " + t.replace(/<[^>]+>/g, "").trim() + "\n\n")
      .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, t) => "\n- " + t.replace(/<[^>]+>/g, "").trim())
      .replace(/<a [^>]*href=["'](https?:[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, h, t) => "[" + t.replace(/<[^>]+>/g, "").trim() + "](" + h + ")")
      .replace(/<\/(p|div|section|ul|ol|blockquote)>/gi, "\n\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ");
    const clean = decode(md).replace(/[ \t]+/g, " ").replace(/\n[ \t]+/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    return { title, meta, markdown: clean };
  }

  const QC = { run, parseFrontMatter, stripMarkdown, fromHtml, REFS };
  if (typeof module !== "undefined" && module.exports) module.exports = QC;
  else root.QC = QC;
})(typeof window !== "undefined" ? window : globalThis);
