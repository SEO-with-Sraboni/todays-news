// Today's News — AI writer endpoint. One request shape, many providers:
// Gemini, Claude (Anthropic), ChatGPT (OpenAI), OpenRouter, Groq, DeepSeek, Mistral.
import type { Config, Context } from "@netlify/functions";
import { PROVIDERS, isProvider, resolveKey, json, checkAccess, type ProviderId } from "../lib/providers.mts";

const MAX_PROMPT_CHARS = 60_000;
const MODEL_RE = /^[\w.\-:/@]{1,120}$/;

type Body = { provider?: string; model?: string; prompt?: string; system?: string; grounding?: boolean; temperature?: number; json?: boolean };

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") return json(405, { error: "Use POST." });
  const denied = checkAccess(req);
  if (denied) return denied;

  let body: Body;
  try { body = await req.json(); } catch { return json(400, { error: "Request body must be JSON." }); }

  const provider: ProviderId = isProvider(body.provider || "") ? (body.provider as ProviderId) : "gemini";
  const cfg = PROVIDERS[provider];
  const prompt = (body.prompt || "").toString();
  if (!prompt.trim()) return json(400, { error: "Prompt is empty." });
  if (prompt.length > MAX_PROMPT_CHARS) return json(413, { error: "Prompt is too long." });
  const model = MODEL_RE.test(body.model || "") ? body.model! : cfg.defaultModel;
  const system = body.system ? body.system.toString().slice(0, 20_000) : "";
  const temperature = typeof body.temperature === "number" ? body.temperature : 0.6;

  const key = resolveKey(req, provider);
  if (!key) {
    return json(400, { error: `No ${cfg.label} API key. Paste one in Settings, or add ${cfg.env} in Netlify environment variables and redeploy.` });
  }

  try {
    if (cfg.kind === "gemini") return await gemini(key, model, prompt, system, temperature, body);
    if (cfg.kind === "anthropic") return await anthropic(key, model, prompt, system, temperature, body);
    return await openaiCompatible(provider, key, model, prompt, system, temperature, body);
  } catch (err: any) {
    if (err?.name === "TimeoutError" || err?.name === "AbortError") {
      return json(504, { error: `${cfg.label} did not respond in time. Try a faster model.` });
    }
    return json(502, { error: `${cfg.label} request failed: ${err?.message || err}` });
  }
};

function fail(label: string, status: number, data: any) {
  const msg = data?.error?.message || data?.error?.type || data?.message || (typeof data?.error === "string" ? data.error : "") || `HTTP ${status}`;
  const hint = status === 401 || status === 403 ? " — check the API key." : status === 429 ? " — rate limit or quota reached; wait or check your plan." : status === 404 ? " — this model may not exist for your key." : "";
  return json(status >= 400 && status < 600 ? status : 502, { error: `${label}: ${msg}${hint}` });
}

async function gemini(key: string, model: string, prompt: string, system: string, temperature: number, body: Body) {
  const payload: Record<string, any> = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature },
  };
  if (system) payload.systemInstruction = { parts: [{ text: system }] };
  // JSON mode can't be combined with search grounding.
  if (body.json) payload.generationConfig.responseMimeType = "application/json";
  else if (body.grounding !== false) payload.tools = [{ google_search: {} }];

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(55_000),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) return fail("Gemini", res.status, data);
  const cand = data?.candidates?.[0];
  const text = (cand?.content?.parts || []).map((p: any) => p.text || "").join("").trim();
  if (!text) return json(502, { error: `Gemini returned no text (finish reason: ${cand?.finishReason || "unknown"}).` });
  const seen = new Set<string>();
  const sources = (cand?.groundingMetadata?.groundingChunks || [])
    .map((c: any) => c.web)
    .filter((w: any) => w?.uri && !seen.has(w.uri) && seen.add(w.uri))
    .map((w: any) => ({ title: w.title || w.uri, uri: w.uri }));
  return json(200, { text, provider: "gemini", model, sources, grounded: Boolean(payload.tools) });
}

async function anthropic(key: string, model: string, prompt: string, system: string, temperature: number, body: Body) {
  const payload: Record<string, any> = {
    model,
    max_tokens: 8000,
    temperature,
    messages: [{ role: "user", content: body.json ? prompt + "\n\nRespond with only the JSON object, no other text." : prompt }],
  };
  if (system) payload.system = system;
  const res = await fetch(PROVIDERS.anthropic.chatUrl!, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(58_000),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) return fail("Claude", res.status, data);
  let text = (data?.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("").trim();
  if (body.json) text = extractJson(text);
  if (!text) return json(502, { error: `Claude returned no text (stop reason: ${data?.stop_reason || "unknown"}).` });
  return json(200, { text, provider: "anthropic", model: data.model || model, sources: [], grounded: false });
}

async function openaiCompatible(provider: ProviderId, key: string, model: string, prompt: string, system: string, temperature: number, body: Body) {
  const cfg = PROVIDERS[provider];
  const messages = [] as { role: string; content: string }[];
  if (system) messages.push({ role: provider === "openai" ? "developer" : "system", content: system });
  messages.push({ role: "user", content: prompt });
  const payload: Record<string, any> = { model, messages };
  // OpenAI's reasoning models only accept the default temperature, so leave it unset there.
  if (provider !== "openai") payload.temperature = temperature;
  if (body.json && cfg.json) payload.response_format = { type: "json_object" };
  const headers: Record<string, string> = { "content-type": "application/json", authorization: `Bearer ${key}` };
  if (provider === "openrouter") { headers["http-referer"] = "https://github.com/SEO-with-Sraboni/todays-news"; headers["x-title"] = "Today's News"; }

  const res = await fetch(cfg.chatUrl!, { method: "POST", headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(58_000) });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) return fail(cfg.label, res.status, data);
  let text = (data?.choices?.[0]?.message?.content || "").toString().trim();
  if (body.json) text = extractJson(text);
  if (!text) return json(502, { error: `${cfg.label} returned no text.` });
  return json(200, { text, provider, model: data.model || model, sources: [], grounded: false });
}

function extractJson(t: string) {
  const s = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  return a >= 0 && b > a ? s.slice(a, b + 1) : s;
}

export const config: Config = { path: "/api/generate", method: "POST" };
