// Today's News — health check used by the sidebar status.
// Reports which providers have a server-side key the owner set (never the values).
// Netlify AI Gateway keys, which spend Netlify credits, are not counted.
import type { Config } from "@netlify/functions";
import { PROVIDERS, serverKey, type ProviderId } from "../lib/providers.mts";

export default async () => {
  const providers = Object.fromEntries((Object.keys(PROVIDERS) as ProviderId[]).map((p) => [p, Boolean(serverKey(p))]));
  return Response.json(
    {
      providers,
      gemini: providers.gemini,
      accessCodeRequired: Boolean(Netlify.env.get("ACCESS_CODE")),
      cloudSync: Boolean(Netlify.env.get("ACCESS_CODE")),
    },
    { headers: { "cache-control": "no-store" } },
  );
};

export const config: Config = { path: "/api/status", method: "GET" };
