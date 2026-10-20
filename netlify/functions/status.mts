// Today's News — health check used by the status pill in the header.
// Reports whether a server-side Gemini key and an access code are configured
// (never the values themselves).
import type { Config } from "@netlify/functions";

export default async () =>
  Response.json(
    {
      gemini: Boolean(Netlify.env.get("GEMINI_API_KEY")),
      accessCodeRequired: Boolean(Netlify.env.get("ACCESS_CODE")),
    },
    { headers: { "cache-control": "no-store" } },
  );

export const config: Config = { path: "/api/status", method: "GET" };
