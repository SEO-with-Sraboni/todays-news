// Today's News — Google Pulse: latest Google Search news from public RSS/Atom feeds.
import type { Config } from "@netlify/functions";

const FEEDS = [
  { id: "google", label: "Google Search Central", url: "https://developers.google.com/search/blog/feed.xml" },
  { id: "industry", label: "Search Engine Land", url: "https://searchengineland.com/feed" },
  { id: "industry", label: "Search Engine Roundtable", url: "https://www.seroundtable.com/index.xml" },
  { id: "industry", label: "Search Engine Journal", url: "https://www.searchenginejournal.com/feed/" },
];

const decode = (s: string) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;|&#8217;/g, "'").replace(/&#8216;/g, "'")
    .replace(/&#8220;|&#8221;/g, '"').replace(/&#8211;|&#8212;/g, "–").replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .trim();

const tag = (xml: string, name: string) => {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decode(m[1]) : "";
};

function parse(xml: string, feed: (typeof FEEDS)[number]) {
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  return items.slice(0, 12).map((it) => {
    let link = tag(it, "link");
    if (!link) {
      const m = it.match(/<link[^>]+href=["']([^"']+)["']/i);
      link = m ? m[1] : "";
    }
    const date = tag(it, "pubDate") || tag(it, "updated") || tag(it, "published");
    const title = tag(it, "title");
    const lower = title.toLowerCase();
    const kind = /core update|spam update|ranking|algorithm|helpful content|reviews update/.test(lower)
      ? "ranking"
      : /documentation|docs|guideline|policy|structured data|search console/.test(lower)
        ? "docs"
        : /patent/.test(lower) ? "patents" : feed.id;
    return { title, link, date: date ? new Date(date).toISOString() : null, source: feed.label, kind };
  }).filter((i) => i.title && i.link);
}

export default async () => {
  const results = await Promise.allSettled(
    FEEDS.map(async (f) => {
      const r = await fetch(f.url, {
        headers: { "user-agent": "TodaysNewsPulse/1.0", accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" },
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) throw new Error(`${f.label}: HTTP ${r.status}`);
      return parse(await r.text(), f);
    }),
  );
  const items = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  const failed = results.map((r, i) => (r.status === "rejected" ? FEEDS[i].label : null)).filter(Boolean);
  items.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return Response.json(
    { items: items.slice(0, 60), failed, fetchedAt: new Date().toISOString() },
    { headers: { "cache-control": "public, max-age=900" } },
  );
};

export const config: Config = { path: "/api/pulse", method: "GET" };
