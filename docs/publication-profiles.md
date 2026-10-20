# Publication profiles

Each publication you write for has a profile. Writing and QC follow the profile selected in the top bar.

## How rules get in
1. **Import with AI.** Paste the publication's contributor-guidelines URL and click *Import rules with AI*. The page is fetched server-side, Gemini extracts the rules into the fields below, and you review them before saving. AI can misread guidelines, so always check each field against the source.
2. **Paste text.** If a site blocks automated reads, copy the guidelines text and paste it in the dialog that appears.
3. **Edit by hand.** Every field is editable at any time.

Seeded publications (FXStreet, FX Empire, Seeking Alpha, Benzinga, Cointelegraph) start with only their public guideline links. Their rules are never pre-filled, so nothing is invented.

## Fields → checks
| Field | Checked how |
|---|---|
| AI-content policy | Banner in the writer; error in QC when *Not allowed*, warning when disclosure is required |
| Min / max words | Exact word count |
| Title max chars | Title tag length |
| Min source links / max links | Markdown links in the body |
| No affiliate links | Links with `ref=`, `aff=`, `utm_source=`, `/go/`, `/out/` etc. |
| Sources required | Links, `[n]` citations or grounding sources present |
| Required sections | Matching headings |
| Banned / required phrases | Exact phrase match |
| Disclaimer required + text | Disclaimer present in the body |
| No promotional content | Phrases such as "buy now", "best broker", "open an account" |
| Spelling (US / UK) | Common spelling pairs (color/colour, analyze/analyse…) |
| Heading case | Flags Title Case headings when sentence case is required |
| First person | Flags repeated I / my / me when it should be avoided |
| Author bio | Reminder when a bio is required |
| Other rules | Passed to the AI review, which quotes violations and suggests rewrites |

## Storage
Profiles, the library and settings live in your browser. With `ACCESS_CODE` set in Netlify and entered in Settings, the workspace also syncs to Netlify Blobs so it follows you across devices. *Export workspace* downloads a JSON backup at any time.
