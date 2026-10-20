// Today's News — cloud sync for the workspace (publications, history, settings).
// Stored in Netlify Blobs. Requires ACCESS_CODE so the data stays private.
import type { Config, Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

const MAX_BYTES = 4_000_000;
const KEY = "workspace-v1";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

export default async (req: Request, _context: Context) => {
  const accessCode = Netlify.env.get("ACCESS_CODE");
  if (!accessCode) {
    return json(403, { error: "Cloud sync is off. Set an ACCESS_CODE environment variable in Netlify to turn it on." });
  }
  if (req.headers.get("x-access-code") !== accessCode) {
    return json(401, { error: "Access code missing or wrong. Add it in Settings." });
  }

  const store = getStore({ name: "todays-news", consistency: "strong" });

  if (req.method === "GET") {
    const data = await store.get(KEY, { type: "json" });
    return json(200, { workspace: data || null });
  }

  if (req.method === "PUT") {
    const text = await req.text();
    if (text.length > MAX_BYTES) return json(413, { error: "Workspace is too large to sync (4 MB limit). Delete old history items." });
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      return json(400, { error: "Workspace must be JSON." });
    }
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.profiles)) {
      return json(400, { error: "That doesn't look like a Today's News workspace." });
    }
    parsed.syncedAt = new Date().toISOString();
    await store.setJSON(KEY, parsed);
    return json(200, { ok: true, syncedAt: parsed.syncedAt });
  }

  return json(405, { error: "Use GET or PUT." });
};

export const config: Config = { path: "/api/sync", method: ["GET", "PUT"] };
