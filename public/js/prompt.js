/* Today's News — prompt builder.
 * Builds the system + user prompt in the browser so writers can inspect it
 * ("Copy prompt") or paste it into any chat model by hand.
 */
(function (root) {
  "use strict";

  const DESKS = {
    auto: { label: "Top story", focus: "the single biggest market-moving story of the day across forex, commodities, stocks and crypto" },
    forex: { label: "Forex", focus: "the most important move or catalyst in major currency pairs (EUR/USD, GBP/USD, USD/JPY, AUD/USD, USD/CAD)" },
    gold: { label: "Gold & metals", focus: "gold (XAU/USD) and silver: today's price action and its drivers" },
    oil: { label: "Oil & energy", focus: "crude oil (WTI and Brent): today's price action, OPEC+ and supply news" },
    stocks: { label: "Stocks", focus: "major equity indices (S&P 500, Nasdaq, Dow, DAX, Nikkei) and the biggest single-stock movers" },
    crypto: { label: "Crypto", focus: "Bitcoin, Ether and the wider crypto market: today's moves and their drivers" },
    central: { label: "Central banks", focus: "central bank decisions, speeches and rate expectations (Fed, ECB, BoE, BoJ)" },
    calendar: { label: "Week ahead", focus: "the key economic calendar events coming up and what markets expect" },
  };

  function session(d) {
    const h = d.getUTCHours();
    if (h >= 13 && h < 21) return "US session";
    if (h >= 7 && h < 13) return "London session";
    if (h >= 0 && h < 7) return "Asia session";
    return "After hours";
  }

  function edition(d) {
    const h = d.getHours();
    return h < 12 ? "Morning edition" : h < 17 ? "Midday edition" : "Evening edition";
  }

  function suggestedAngle(d) {
    const day = d.getDay();
    const date = d.getDate();
    if (day === 5 && date <= 7) return "Jobs Friday — US non-farm payrolls and the dollar reaction";
    if (day === 1) return "Week-ahead outlook — key data and central bank events";
    if (day === 5) return "Week in review — biggest movers and what changed";
    if (day === 0 || day === 6) return "Weekend wrap — what moved markets and what's next";
    return "Today's top market mover and what traders are watching";
  }

  function build(opts) {
    const now = opts.now || new Date();
    const desk = DESKS[opts.desk] || DESKS.auto;
    const longDate = now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    const iso = now.toISOString().slice(0, 10);
    const minWords = opts.minWords || 600;
    const maxWords = opts.maxWords || 900;

    const system = [
      "You are a senior financial news writer for “Today's News”, an independent market news desk.",
      "You write accurate, neutral, people-first news that follows Google Search guidance on helpful content and the spam policies.",
      "Rules you never break:",
      "- Use only facts, prices and quotes you found in today's search results. If a figure can't be verified, leave it out.",
      "- Never invent quotes, names, numbers or sources.",
      "- Never promise profits, call anything risk-free or guaranteed, or give personal trading signals.",
      "- No hype, no clickbait, no exclamation marks, no generic filler (\"in today's fast-paced world\", \"delve\", \"game-changer\").",
      "- Use the focus keyword naturally: in the title, the H1, the first 100 words, and 2–4 more times. Never stuff it.",
      "- Short paragraphs (2–4 sentences), sentences around 15–20 words, plain US English.",
    ].join("\n");

    const extra = (opts.houseStyle || "").trim();
    const topic = (opts.topic || "").trim();

    const user = [
      `Today is ${longDate} (${iso}). Current trading window: ${session(now)}.`,
      topic
        ? `Write today's news article about: ${topic}. Research it live first.`
        : `Search the web for ${desk.focus}, pick the most newsworthy development from the last 24 hours, and write today's news article about it.`,
      "",
      `Length: ${minWords}–${maxWords} words of body text.`,
      "",
      "Return ONLY markdown in exactly this format:",
      "---",
      "title: <SEO title, 50–60 characters, focus keyword near the start>",
      "meta_description: <140–160 characters, includes the focus keyword>",
      "focus_keyword: <the main 2–4 word search phrase>",
      "secondary_keywords: <3–5 related phrases, comma-separated>",
      "slug: <lowercase-hyphenated-url-slug>",
      opts.author ? `author: ${opts.author}` : "author: Today's News Desk",
      "---",
      "# <Headline — clear, factual, includes the focus keyword>",
      "",
      "<Lede: 2–3 sentences answering what happened, when, and why it matters. Include the date or day.>",
      "",
      "## Key takeaways",
      "- <3–4 bullet points with the most important facts>",
      "",
      "## What happened",
      "## Why it matters",
      "## Market reaction",
      "<Include verified price levels and % moves with the time they were observed.>",
      "## What to watch next",
      "<Upcoming data, events or levels.>",
      "",
      "Cite facts inline with bracketed numbers like [1], [2] that match the order of your sources.",
      "",
      "_This article is for information only and is not financial advice. Trading involves risk._",
      extra ? `\nHouse style notes from the editor:\n${extra}` : "",
    ].join("\n");

    return { system, user, meta: { date: longDate, edition: edition(now), session: session(now), angle: suggestedAngle(now), desk: desk.label } };
  }

  root.Prompt = { build, DESKS, session, edition, suggestedAngle };
})(window);
