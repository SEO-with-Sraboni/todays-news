// Today's News — page import endpoint for the QC checker.
// Fetches a public web page server-side (browsers block cross-site reads) and
// returns its HTML so the QC engine can extract title, meta and body text.
import type { Config, Context } from "@netlify/functions";

const MAX_BYTES = 2_000_000;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

// Blocks obvious internal targets (SSRF guard). Only public http(s) pages are allowed.
function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")) return true;
  if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.)/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) return true;
  if (!h.includes(".")) return true;
  return false;
}

export default async (req: Request, _context: Context) => {
  const accessCode = Netlify.env.get("ACCESS_CODE");
  if (accessCode && req.headers.get("x-access-code") !== accessCode) {
    return json(401, { error: "Access code missing or wrong. Add it in Settings." });
  }

  const target = new URL(req.url).searchParams.get("url") || "";
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return json(400, { error: "Enter a full URL, starting with https://" });
  }
  if (!/^https?:$/.test(url.protocol)) return json(400, { error: "Only http and https URLs are supported." });
  if (isBlockedHost(url.hostname)) return json(400, { error: "That host is not allowed." });

  let res: Response;
  try {
    res = await fetch(url, {
      redirect: "follow",
      headers: { "user-agent": "TodaysNewsQC/1.0 (+content quality checker)", accept: "text/html,*/*;q=0.5", "accept-language": "en-US,en;q=0.9" },
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    return json(504, { error: "The page took too long to respond or could not be reached." });
  }

  const finalUrl = new URL(res.url || url.href);
  if (isBlockedHost(finalUrl.hostname)) return json(400, { error: "That page redirected to a blocked host." });
  if (res.status === 401 || res.status === 403 || res.status === 429) {
    return json(502, { error: `This site blocks automated reads (HTTP ${res.status}). Open the page, copy its source and use Paste HTML instead.` });
  }
  if (!res.ok) return json(502, { error: `The page returned HTTP ${res.status}.` });

  const type = res.headers.get("content-type") || "";
  if (!/text\/html|application\/xhtml|text\/plain/.test(type)) {
    return json(415, { error: `Not an HTML page (${type || "unknown type"}).` });
  }

  const reader = res.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        break;
      }
      chunks.push(value);
    }
  }
  const html = new TextDecoder().decode(Buffer.concat(chunks));
  return json(200, { html, finalUrl: finalUrl.href, truncated: size > MAX_BYTES });
};

export const config: Config = {
  path: "/api/page",
  method: "GET",
};
