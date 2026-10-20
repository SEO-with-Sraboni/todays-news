// Today's News — health check used by the status pill in the header.
// Reports whether a server-side Gemini key and an access code are configured
// (never the values themselves).
import type { Config } from "@netlify/functions";

export default async () =>
  Response.json(
    {
      // Netlify AI Gateway keys (which spend Netlify credits) are not counted.
      gemini: Boolean(Netlify.env.get("GEMINI_API_KEY")) && !Netlify.env.get("GOOGLE_GEMINI_BASE_URL"),
      accessCodeRequired: Boolean(Netlify.env.get("ACCESS_CODE")),
      cloudSync: Boolean(Netlify.env.get("ACCESS_CODE")),
    },
    { headers: { "cache-control": "no-store" } },
  );

export const config: Config = { path: "/api/status", method: "GET" };
