// Today's News — article generator endpoint.
// Proxies requests to the Google Gemini API so the API key stays on the server
// (set GEMINI_API_KEY in Netlify → Site configuration → Environment variables).
import type { Config, Context } from "@netlify/functions";

const ALLOWED_MODELS = new Set([
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-pro",
  "gemini-2.0-flash",
]);

const MAX_PROMPT_CHARS = 60_000;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") return json(405, { error: "Use POST." });

  // Optional access code so strangers can't spend your free quota.
  const accessCode = Netlify.env.get("ACCESS_CODE");
  if (accessCode && req.headers.get("x-access-code") !== accessCode) {
    return json(401, { error: "Access code missing or wrong. Add it in Settings." });
  }

  let body: { prompt?: string; system?: string; model?: string; grounding?: boolean; temperature?: number };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Request body must be JSON." });
  }

  const prompt = (body.prompt || "").toString();
  if (!prompt.trim()) return json(400, { error: "Prompt is empty." });
  if (prompt.length > MAX_PROMPT_CHARS) return json(413, { error: "Prompt is too long." });

  const model = ALLOWED_MODELS.has(body.model || "") ? body.model! : "gemini-2.5-flash";
  // A personal key from the browser overrides the server key (useful when the shared key is rate-limited).
  const apiKey = req.headers.get("x-user-gemini-key") || Netlify.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    return json(500, {
      error: "No Gemini API key configured. Add GEMINI_API_KEY in Netlify environment variables, or a personal key in Settings.",
    });
  }

  const payload: Record<string, unknown> = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: typeof body.temperature === "number" ? body.temperature : 0.6 },
  };
  if (body.system) payload.systemInstruction = { parts: [{ text: body.system.toString().slice(0, 20_000) }] };
  if (body.grounding !== false) payload.tools = [{ google_search: {} }];

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(55_000),
    });
  } catch (err) {
    return json(504, { error: "Gemini did not respond in time. Try again or pick a faster model." });
  }

  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || `Gemini error ${res.status}`;
    const hint = res.status === 429 ? " (free-tier rate limit hit — wait a minute or use a personal key)" : "";
    return json(res.status, { error: msg + hint });
  }

  const cand = data?.candidates?.[0];
  const text = (cand?.content?.parts || []).map((p: any) => p.text || "").join("").trim();
  if (!text) {
    return json(502, { error: `Gemini returned no text (finish reason: ${cand?.finishReason || "unknown"}).` });
  }

  const gm = cand?.groundingMetadata || {};
  const seen = new Set<string>();
  const sources = (gm.groundingChunks || [])
    .map((c: any) => c.web)
    .filter((w: any) => w?.uri && !seen.has(w.uri) && seen.add(w.uri))
    .map((w: any) => ({ title: w.title || w.uri, uri: w.uri }));

  return json(200, {
    text,
    model,
    sources,
    queries: gm.webSearchQueries || [],
    usage: data?.usageMetadata || null,
  });
};

export const config: Config = {
  path: "/api/generate",
  method: "POST",
};
