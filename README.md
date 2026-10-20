# Today's News

**An AI market-news writer with a built-in content quality checker.** One click researches today's biggest market story with live Google Search, writes a publish-ready article, and instantly audits it against Google Search guidance — so mistakes are caught before anything goes live.

**Live demo:** https://todays-news-desk.netlify.app

> Built by **Sraboni Sarker**, SEO & GEO Strategist — [LinkedIn](https://www.linkedin.com/in/srabonisarker)

---

## The problem

Financial contributors write for several publications, and each one has its own rules: word limits, sourcing, disclaimers, promotional bans, AI-content policies. On top of that, every article must satisfy Google's helpful-content, spam and YMYL standards. Tracking all of that by hand is slow and error-prone.

## The solution

Today's News is an **all-in-one financial news desk**:

1. **Publications** — a profile per site. Paste a contributor-guidelines URL and AI extracts the rules into an editable checklist (word limits, links, disclaimers, banned phrases, AI policy and more).
2. **Write** — Gemini researches today's story with live Google Search and writes it to the selected publication's rules, with cited sources.
3. **QC** — 40+ checks run as you type: Google guidance (title/meta, keyword stuffing, structure, readability, YMYL trust, sourcing) plus the publication's own rules. Click an issue to jump to it.
4. **Audit published work** — import any article URL, file (.docx, .md, .html, .txt) or raw HTML; page-SEO checks cover canonical, noindex, NewsArticle schema, Open Graph, image alt text and dates. Batch-check up to 10 URLs.
5. **Report** — export any report to CSV or copy it straight into Google Sheets. Save drafts and audits to the Library.
6. **Stay current** — Google Pulse collects Google Search ranking updates and documentation changes; the Policy Library explains the guidance behind every check.

## Features

| Area | What it does |
|---|---|
| Desk | Today's brief, KPIs, recent work, latest Google updates |
| Write & QC | Eight market desks, live search grounding, house format, editor/preview, copy to Google Docs |
| Publications | Per-site rule profiles, AI rule import from guideline pages, AI-policy warnings |
| Content QC | Google checks + site rules + optional AI editor review |
| Page SEO | Canonical, robots, schema, Open Graph, viewport, alt text, publish dates, HTTPS |
| Batch QC | Up to 10 URLs, CSV / Google Sheets export |
| Library | Saved drafts and published audits per publication |
| Sync | Optional cloud sync via Netlify Blobs behind an access code; JSON export/import |
| AI providers | Gemini, Claude, ChatGPT, OpenRouter, Groq, DeepSeek, Mistral; live model lists per key |
| Security | AI key server-side, access code, SSRF-guarded page fetcher |

See **[docs/qc-rules.md](docs/qc-rules.md)** and **[docs/publication-profiles.md](docs/publication-profiles.md)**.

## Tech stack

- **Frontend:** vanilla HTML, CSS and JavaScript — no framework, no build step
- **Backend:** Netlify Functions (TypeScript): Gemini proxy, page fetcher, Google Pulse feed reader, workspace sync
- **Storage:** browser storage + Netlify Blobs
- **AI:** choose Gemini (live Google Search grounding), Claude, ChatGPT, OpenRouter, Groq, DeepSeek or Mistral; bring your own key; Netlify AI Gateway credits are never used
- **Libraries:** marked, DOMPurify, mammoth (Word import, loaded on demand)

Architecture notes: **[docs/architecture.md](docs/architecture.md)**

## Run it yourself (free)

1. Fork this repo and import it into [Netlify](https://app.netlify.com) (**Add new site → Import from Git**). No build command is needed; the publish folder is `public`.
2. Get a free API key from [Google AI Studio](https://aistudio.google.com/app/apikey).
3. In Netlify go to **Site configuration → Environment variables** and add `GEMINI_API_KEY` (scope: Functions). Optionally add `ACCESS_CODE` so only people with the code can generate — it also turns on cloud sync.
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
public/            static site (index.html, css/, js/qc.js, js/prompt.js, js/data.js, js/app.js)
netlify/functions/ generate.mts (Gemini), page.mts (URL import), pulse.mts (Google news), sync.mts (cloud sync), status.mts
docs/              QC rules and architecture
tests/             QC engine tests
```

## Roadmap

- [x] Custom QC rule sets per publication
- [x] Saved history with cloud sync
- [ ] Claude as a second provider (paid, bring-your-own-key)
- [ ] NewsArticle JSON-LD generator from the front matter
- [ ] Export to WordPress drafts
- [ ] Plagiarism check via a paid API

## Disclaimer

Generated articles are drafts for human review. QC findings are guidance based on public Google documentation, not a guarantee of rankings. Nothing produced by this tool is financial advice.

## License

[MIT](LICENSE) © 2026 Sraboni Sarker
