# Today's News

**An AI market-news writer with a built-in content quality checker.** One click researches today's biggest market story with live Google Search, writes a publish-ready article, and instantly audits it against Google Search guidance — so mistakes are caught before anything goes live.

**Live demo:** https://todays-news.netlify.app

> Built by **Sraboni Sarker**, SEO & GEO Strategist — [LinkedIn](https://www.linkedin.com/in/srabonisarker)

---

## The problem

Daily market news is a speed game, but speed breeds SEO and trust mistakes: titles that get truncated, keyword stuffing, missing risk disclaimers, unsourced numbers, and AI-sounding filler. In finance — a "Your Money or Your Life" topic — those mistakes cost rankings and credibility.

## The solution

Today's News puts the **writer and the editor in one screen**:

1. **Generate** — Gemini searches the web live (Google Search grounding), picks the most newsworthy development of the day for the chosen desk, and writes it in a consistent house format with SEO front matter and cited sources.
2. **QC instantly** — 30+ rule-based checks run in the browser as you type, each mapped to a specific Google Search Central document.
3. **Fix fast** — click any issue to jump straight to the problem text in the editor. Re-check updates live.
4. **Second opinion** — an optional AI editor review quotes problem sentences and suggests rewrites.
5. **Publish** — copy formatted text straight into Google Docs, or copy the Markdown.

## Features

| Area | What it does |
|---|---|
| Desks | Top story, Forex, Gold & metals, Oil, Stocks, Crypto, Central banks, Week ahead |
| Live research | Gemini with Google Search grounding; sources listed and cited inline |
| House format | Front matter (title, meta, focus keyword, slug, author) → H1 → lede → key takeaways → sections → disclaimer |
| Content QC | Title & meta length, keyword placement & density, keyword stuffing, heading hierarchy, thin content, readability (Flesch), long sentences/paragraphs, duplicate sentences, clickbait, AI filler, YMYL red flags, disclaimers, sourcing, dates, slug format |
| URL import | QC any public article by URL via a server function (with SSRF protection) |
| Workflow | Edit/preview, autosave, Ctrl + Enter re-check, weekly wire log, copy-for-Docs |
| Security | API key kept server-side in a Netlify Function; optional access code; personal-key override |

See **[docs/qc-rules.md](docs/qc-rules.md)** for every check and the Google guidance behind it.

## Tech stack

- **Frontend:** vanilla HTML, CSS and JavaScript — no framework, no build step
- **Backend:** Netlify Functions (TypeScript) as a secure proxy to the Gemini API
- **AI:** Google Gemini 2.5 (free tier) with Google Search grounding
- **Libraries:** marked (Markdown), DOMPurify (sanitizing preview HTML)
- **Hosting:** Netlify free tier, continuous deployment from GitHub

Architecture notes: **[docs/architecture.md](docs/architecture.md)**

## Run it yourself (free)

1. Fork this repo and import it into [Netlify](https://app.netlify.com) (**Add new site → Import from Git**). No build command is needed; the publish folder is `public`.
2. Get a free API key from [Google AI Studio](https://aistudio.google.com/app/apikey).
3. In Netlify go to **Site configuration → Environment variables** and add `GEMINI_API_KEY` (scope: Functions). Optionally add `ACCESS_CODE` so only people with the code can generate.
4. Redeploy. The header pill should read **Gemini ready**.

Local development:

```bash
npm install
cp .env.example .env   # add your key
npx netlify dev        # http://localhost:8888
npm test               # QC engine tests
```

## Project structure

```
public/            static site (index.html, css/, js/qc.js, js/prompt.js, js/app.js)
netlify/functions/ generate.mts (Gemini proxy), page.mts (URL import), status.mts (health)
docs/              QC rules and architecture
tests/             QC engine tests
```

## Roadmap

- [ ] Claude as a second provider (paid, bring-your-own-key)
- [ ] NewsArticle JSON-LD schema generator from the front matter
- [ ] Export straight to Google Docs / WordPress drafts
- [ ] Saved article history with Netlify Blobs
- [ ] Custom QC rule sets per publication

## Disclaimer

Generated articles are drafts for human review. QC findings are guidance based on public Google documentation, not a guarantee of rankings. Nothing produced by this tool is financial advice.

## License

[MIT](LICENSE) © 2026 Sraboni Sarker
