// Shared AI provider config for Today's News functions.
// Keys come from the user's browser (x-provider-key header) or from env vars the
// site owner sets in Netlify. Netlify AI Gateway also injects some of these env
// vars together with a *_BASE_URL; those gateway keys bill Netlify credits, so
// they are deliberately ignored.

export type ProviderId = "gemini" | "anthropic" | "openai" | "openrouter" | "groq" | "deepseek" | "mistral";

export const PROVIDERS: Record<ProviderId, {
  label: string; env: string; gatewayEnv?: string; kind: "gemini" | "anthropic" | "openai";
  chatUrl?: string; modelsUrl: string; defaultModel: string; json: boolean;
}> = {
  gemini: { label: "Gemini", env: "GEMINI_API_KEY", gatewayEnv: "GOOGLE_GEMINI_BASE_URL", kind: "gemini",
    modelsUrl: "https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", defaultModel: "gemini-3.8-flash", json: true },
  anthropic: { label: "Claude", env: "ANTHROPIC_API_KEY", gatewayEnv: "ANTHROPIC_BASE_URL", kind: "anthropic",
    chatUrl: "https://api.anthropic.com/v1/messages", modelsUrl: "https://api.anthropic.com/v1/models?limit=100", defaultModel: "claude-sonnet-5-5", json: false },
  openai: { label: "ChatGPT", env: "OPENAI_API_KEY", gatewayEnv: "OPENAI_BASE_URL", kind: "openai",
    chatUrl: "https://api.openai.com/v1/chat/completions", modelsUrl: "https://api.openai.com/v1/models", defaultModel: "gpt-5-mini", json: true },
  openrouter: { label: "OpenRouter", env: "OPENROUTER_API_KEY", gatewayEnv: "OPENROUTER_BASE_URL", kind: "openai",
    chatUrl: "https://openrouter.ai/api/v1/chat/completions", modelsUrl: "https://openrouter.ai/api/v1/models", defaultModel: "openrouter/auto", json: false },
  groq: { label: "Groq", env: "GROQ_API_KEY", kind: "openai",
    chatUrl: "https://api.groq.com/openai/v1/chat/completions", modelsUrl: "https://api.groq.com/openai/v1/models", defaultModel: "llama-3.3-70b-versatile", json: true },
  deepseek: { label: "DeepSeek", env: "DEEPSEEK_API_KEY", kind: "openai",
    chatUrl: "https://api.deepseek.com/chat/completions", modelsUrl: "https://api.deepseek.com/models", defaultModel: "deepseek-chat", json: true },
  mistral: { label: "Mistral", env: "MISTRAL_API_KEY", kind: "openai",
    chatUrl: "https://api.mistral.ai/v1/chat/completions", modelsUrl: "https://api.mistral.ai/v1/models", defaultModel: "mistral-large-latest", json: true },
};

export const isProvider = (p: string): p is ProviderId => Object.prototype.hasOwnProperty.call(PROVIDERS, p);

// Server-side key for a provider, ignoring Netlify AI Gateway keys.
export function serverKey(p: ProviderId): string {
  const cfg = PROVIDERS[p];
  if (cfg.gatewayEnv && Netlify.env.get(cfg.gatewayEnv)) return "";
  return Netlify.env.get(cfg.env) || "";
}

export function resolveKey(req: Request, p: ProviderId): string {
  return req.headers.get("x-provider-key") || (p === "gemini" ? req.headers.get("x-user-gemini-key") || "" : "") || serverKey(p);
}

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

export function checkAccess(req: Request): Response | null {
  const accessCode = Netlify.env.get("ACCESS_CODE");
  if (accessCode && req.headers.get("x-access-code") !== accessCode) {
    return json(401, { error: "Access code missing or wrong. Add it in Settings." });
  }
  return null;
}
