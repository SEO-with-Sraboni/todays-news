// Today's News — lists the models a provider offers for the given key,
// so the Settings model picker always shows what's actually available.
import type { Config } from "@netlify/functions";
import { PROVIDERS, isProvider, resolveKey, json, checkAccess } from "../lib/providers.mts";

export default async (req: Request) => {
  const denied = checkAccess(req);
  if (denied) return denied;
  const p = new URL(req.url).searchParams.get("provider") || "";
  if (!isProvider(p)) return json(400, { error: "Unknown provider." });
  const cfg = PROVIDERS[p];
  const key = resolveKey(req, p);
  if (!key && p !== "openrouter") return json(400, { error: `Add your ${cfg.label} API key first.` });

  const headers: Record<string, string> = {};
  if (cfg.kind === "gemini") headers["x-goog-api-key"] = key;
  else if (cfg.kind === "anthropic") { headers["x-api-key"] = key; headers["anthropic-version"] = "2023-06-01"; }
  else if (key) headers.authorization = `Bearer ${key}`;

  let res: Response;
  try {
    res = await fetch(cfg.modelsUrl, { headers, signal: AbortSignal.timeout(12_000) });
  } catch {
    return json(504, { error: `${cfg.label} did not respond.` });
  }
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) return json(res.status, { error: `${cfg.label}: ${data?.error?.message || data?.message || "HTTP " + res.status}` });

  let models: { id: string; label: string }[] = [];
  if (cfg.kind === "gemini") {
    models = (data.models || [])
      .filter((m: any) => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map((m: any) => ({ id: String(m.name).replace(/^models\//, ""), label: m.displayName || m.name }));
  } else if (cfg.kind === "anthropic") {
    models = (data.data || []).map((m: any) => ({ id: m.id, label: m.display_name || m.id }));
  } else {
    models = (data.data || data.models || [])
      .filter((m: any) => !/embed|whisper|tts|dall-e|image|audio|moderation|transcribe|realtime|search-preview/i.test(m.id))
      .map((m: any) => ({ id: m.id, label: m.name || m.id }));
  }
  models.sort((a, b) => a.id.localeCompare(b.id));
  return json(200, { provider: p, models: models.slice(0, 400) });
};

export const config: Config = { path: "/api/models", method: "GET" };
