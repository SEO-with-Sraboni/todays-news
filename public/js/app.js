/* Today's News — app controller.
 * Views: Desk, Write & QC, Batch QC, Publications, Library, Policy Library, Google Pulse, Settings.
 * Data lives in one "workspace" object in localStorage, optionally synced to Netlify Blobs.
 */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const qs = (sel, el = document) => el.querySelector(sel);
  const qsa = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const clone = (o) => JSON.parse(JSON.stringify(o));

  // ---------------- workspace ----------------
  const WS_KEY = "tn:ws";
  const DEFAULT_SETTINGS = { provider: "gemini", models: {}, keys: {}, grounding: true, access: "", author: "", min: 600, max: 900, style: "", autoQc: true, theme: "dark" };
  const PROVIDERS = {
    gemini: { label: "Gemini", model: "gemini-2.5-flash", key: "https://aistudio.google.com/app/apikey", env: "GEMINI_API_KEY", grounding: true,
      suggest: ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro"], hint: "Free tier with daily limits. The only provider here with live Google Search, so it can report today's prices." },
    anthropic: { label: "Claude", model: "claude-sonnet-5-5", key: "https://console.anthropic.com/settings/keys", env: "ANTHROPIC_API_KEY",
      suggest: ["claude-sonnet-5-5", "claude-haiku-5-5", "claude-opus-5-5"], hint: "Paid, pay-as-you-go. Excellent writing; no live search here, so it marks figures as [VERIFY] for you to fill in." },
    openai: { label: "ChatGPT", model: "gpt-5-mini", key: "https://platform.openai.com/api-keys", env: "OPENAI_API_KEY",
      suggest: ["gpt-5-mini", "gpt-5"], hint: "Paid, pay-as-you-go (separate from a ChatGPT Plus subscription). No live search here; figures are marked [VERIFY]." },
    openrouter: { label: "OpenRouter", model: "openrouter/auto", key: "https://openrouter.ai/keys", env: "OPENROUTER_API_KEY",
      suggest: ["openrouter/auto"], hint: "One key for hundreds of models, including some free ones (IDs ending in :free). Load models to browse." },
    groq: { label: "Groq", model: "llama-3.3-70b-versatile", key: "https://console.groq.com/keys", env: "GROQ_API_KEY",
      suggest: ["llama-3.3-70b-versatile"], hint: "Free tier, very fast open models. No live search; figures are marked [VERIFY]." },
    deepseek: { label: "DeepSeek", model: "deepseek-chat", key: "https://platform.deepseek.com/api_keys", env: "DEEPSEEK_API_KEY",
      suggest: ["deepseek-chat", "deepseek-reasoner"], hint: "Low-cost paid API. No live search; figures are marked [VERIFY]." },
    mistral: { label: "Mistral", model: "mistral-large-latest", key: "https://console.mistral.ai/api-keys", env: "MISTRAL_API_KEY",
      suggest: ["mistral-large-latest", "mistral-small-latest"], hint: "Free experiment tier available. No live search; figures are marked [VERIFY]." },
  };
  const curProvider = () => (PROVIDERS[S().provider] ? S().provider : "gemini");
  const curModel = () => (S().models || {})[curProvider()] || PROVIDERS[curProvider()].model;
  const curKey = () => (S().keys || {})[curProvider()] || "";
  const grounded = () => curProvider() === "gemini" && S().grounding;

  function readLS(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }
  function writeLS(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } }

  function freshWorkspace() {
    const old = readLS("tn:settings") || {};
    return {
      version: 1, updatedAt: 0,
      profiles: clone(SeedData.PROFILES),
      activeProfile: "house",
      history: [],
      desk: readLS("tn:desk") || "auto",
      settings: Object.assign({}, DEFAULT_SETTINGS, old),
      doc: { markdown: readLS("tn:draft") || "", fields: {}, sources: [], url: "", html: "", origin: "" },
    };
  }

  let ws = readLS(WS_KEY) || freshWorkspace();
  ws.settings = Object.assign({}, DEFAULT_SETTINGS, ws.settings);
  if (ws.settings.userKey) { ws.settings.keys = Object.assign({}, ws.settings.keys, { gemini: ws.settings.userKey }); delete ws.settings.userKey; }
  if (typeof ws.settings.model === "string") { ws.settings.models = Object.assign({ gemini: ws.settings.model }, ws.settings.models); delete ws.settings.model; }
  // Add any new seed publications introduced in later versions.
  SeedData.PROFILES.forEach((p) => { if (!ws.profiles.some((x) => x.id === p.id) && !(ws.deletedSeeds || []).includes(p.id)) ws.profiles.push(clone(p)); });

  let saveT, syncT;
  function save(opts = {}) {
    if (!opts.silent) ws.updatedAt = Date.now();
    clearTimeout(saveT);
    saveT = setTimeout(() => writeLS(WS_KEY, ws), 250);
    if (!opts.silent && canSync()) { clearTimeout(syncT); syncT = setTimeout(() => pushCloud(true), 4000); }
  }

  const S = () => ws.settings;
  const profile = (id) => ws.profiles.find((p) => p.id === (id || ws.activeProfile)) || ws.profiles[0];

  // ---------------- api ----------------
  function headers(extra) {
    const h = Object.assign({}, extra || {});
    if (curKey()) h["x-provider-key"] = curKey();
    if (S().access) h["x-access-code"] = S().access;
    return h;
  }
  async function api(path, opts = {}) {
    const r = await fetch(path, Object.assign({}, opts, { headers: headers(opts.headers) }));
    const data = await r.json().catch(() => ({ error: "Unexpected response from the server." }));
    if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`);
    return data;
  }
  const gemini = (body) => api("/api/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.assign({ provider: curProvider(), model: curModel() }, body)) });
  const fetchPage = (url) => api("/api/page?url=" + encodeURIComponent(url));

  // ---------------- ui helpers ----------------
  let toastT;
  function toast(msg, kind) {
    const t = $("toast");
    t.textContent = msg;
    t.className = "toast show " + (kind || "");
    clearTimeout(toastT);
    toastT = setTimeout(() => (t.className = "toast"), 3600);
  }
  function busy(btn, on, label) {
    if (!btn) return;
    btn.classList.toggle("is-busy", on);
    btn.disabled = on;
    const l = qs(".btn-label", btn);
    if (l) { if (on) { l.dataset.orig = l.dataset.orig || l.textContent; l.textContent = label || "Working…"; } else if (l.dataset.orig) l.textContent = l.dataset.orig; }
  }
  const relTime = (t) => {
    const d = (Date.now() - new Date(t).getTime()) / 1000;
    if (d < 60) return "just now";
    if (d < 3600) return Math.floor(d / 60) + "m ago";
    if (d < 86400) return Math.floor(d / 3600) + "h ago";
    if (d < 86400 * 7) return Math.floor(d / 86400) + "d ago";
    return new Date(t).toLocaleDateString([], { month: "short", day: "numeric" });
  };
  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: type || "text/plain" }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  async function copy(text, msg) {
    try { await navigator.clipboard.writeText(text); toast(msg || "Copied.", "ok"); }
    catch { toast("Copy blocked by the browser.", "err"); }
  }
  function applyTheme() {
    document.documentElement.dataset.theme = S().theme;
    qs("#themeBtn use").setAttribute("href", S().theme === "dark" ? "#i-sun" : "#i-moon");
    qs('meta[name="theme-color"]').content = S().theme === "dark" ? "#0b0d11" : "#f6f3ec";
  }

  // ---------------- router ----------------
  const TITLES = {
    desk: ["Desk", "Today at a glance"], write: ["Write & QC", "Draft, check and fix"], batch: ["Batch QC", "Audit published articles"],
    pubs: ["Publications", "Contributor rules per site"], library: ["Library", "Saved articles and reports"],
    policies: ["Policy Library", "The guidance behind each check"], pulse: ["Google Pulse", "Latest Google Search news"], settings: ["Settings", "AI, access and writing defaults"],
  };
  function route() {
    const r = (location.hash.replace(/^#\//, "") || "desk").split("?")[0];
    const view = TITLES[r] ? r : "desk";
    qsa(".view").forEach((v) => (v.hidden = v.dataset.view !== view));
    qsa(".nav a").forEach((a) => a.classList.toggle("is-on", a.dataset.route === view));
    $("viewTitle").textContent = TITLES[view][0];
    $("viewSub").textContent = TITLES[view][1];
    document.body.classList.remove("nav-open");
    ({ desk: renderDesk, write: renderWrite, batch: renderBatchHead, pubs: renderPubs, library: renderLibrary, policies: renderPolicies, pulse: () => loadPulse(false), settings: renderSettings })[view]();
    window.scrollTo(0, 0);
  }

  // ---------------- header ----------------
  function tick() {
    const now = new Date();
    $("clock").textContent = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    $("session").textContent = Prompt.session(now).toUpperCase();
  }
  let serverStatus = null;
  async function checkStatus() {
    const dot = $("status"), txt = $("statusText");
    try {
      serverStatus = await api("/api/status");
      if (serverStatus.accessCodeRequired && !S().access) { dot.className = "dot-status warn"; txt.textContent = "Access code needed"; }
      else if ((serverStatus.providers || {})[curProvider()] || curKey()) { dot.className = "dot-status ok"; txt.textContent = PROVIDERS[curProvider()].label + " ready"; }
      else { dot.className = "dot-status err"; txt.textContent = "No " + PROVIDERS[curProvider()].label + " key"; }
    } catch {
      serverStatus = null;
      dot.className = "dot-status warn"; txt.textContent = "Offline — QC only";
    }
    renderSyncText();
  }
  const canSync = () => Boolean(serverStatus && serverStatus.cloudSync && S().access);
  function renderSyncText() {
    $("syncText").textContent = canSync() ? (ws.syncedAt ? "Synced " + relTime(ws.syncedAt) : "Cloud sync on") : "Local only";
  }
  function renderPubSelect() {
    const sel = $("pubSelect");
    sel.innerHTML = ws.profiles.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("");
    sel.value = profile().id;
    $("pubDot").style.background = profile().color || "var(--gold)";
  }

  // ---------------- cloud sync ----------------
  async function pushCloud(quiet) {
    if (!canSync()) { if (!quiet) toast(serverStatus && !serverStatus.cloudSync ? "Set ACCESS_CODE in Netlify to turn on cloud sync." : "Enter your access code first.", "err"); return; }
    try {
      const body = clone(ws);
      body.settings.keys = {}; body.settings.access = "";
      const r = await api("/api/sync", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      ws.syncedAt = r.syncedAt; save({ silent: true }); renderSyncText();
      if (!quiet) toast("Workspace synced to the cloud.", "ok");
    } catch (e) { if (!quiet) toast(e.message, "err"); }
  }
  async function pullCloud(auto) {
    if (!canSync()) { if (!auto) toast("Cloud sync needs ACCESS_CODE in Netlify and your access code in Settings.", "err"); return; }
    try {
      const { workspace } = await api("/api/sync");
      if (!workspace) { if (!auto) toast("Nothing in the cloud yet — use Sync now first.", ""); return; }
      if (auto && (workspace.updatedAt || 0) <= (ws.updatedAt || 0)) return;
      const keep = { keys: S().keys, access: S().access, theme: S().theme };
      ws = Object.assign(freshWorkspace(), workspace);
      ws.settings = Object.assign({}, DEFAULT_SETTINGS, workspace.settings, keep);
      save({ silent: true }); renderPubSelect(); route(); renderSyncText();
      toast("Loaded your workspace from the cloud.", "ok");
    } catch (e) { if (!auto) toast(e.message, "err"); }
  }

  // ---------------- DESK ----------------
  function renderDesk() {
    const now = new Date();
    const h = now.getHours();
    const name = (S().author || "").split(" ")[0];
    $("deskHello").textContent = (h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening") + (name ? ", " + name : "") + ".";
    $("deskDate").textContent = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    $("deskAngle").textContent = Prompt.suggestedAngle(now);
    const weekAgo = Date.now() - 7 * 86400000;
    $("kWeek").textContent = ws.history.filter((x) => x.savedAt > weekAgo).length;
    const scored = ws.history.slice(0, 20).filter((x) => typeof x.score === "number");
    $("kAvg").textContent = scored.length ? Math.round(scored.reduce((a, x) => a + x.score, 0) / scored.length) : "—";
    const ready = ws.profiles.filter((p) => p.imported).length;
    $("kPubs").textContent = `${ready}/${ws.profiles.length}`;
    $("kPubsSub").textContent = ready < ws.profiles.length ? "import rules for the rest" : "all rules imported";
    $("kEdition").textContent = Prompt.edition(now).replace(" edition", "");
    $("kSession").textContent = Prompt.session(now);
    const rec = ws.history.slice(0, 6);
    $("deskRecent").innerHTML = rec.length
      ? rec.map((x) => `<li><button class="row-btn" data-open="${esc(x.id)}"><span class="badge-score ${band(x.score)}">${x.score ?? "—"}</span><span class="grow"><b>${esc(x.title || "Untitled")}</b><small class="muted">${esc(pubName(x.profileId))} · ${x.type === "published" ? "Published QC" : "Draft"} · ${relTime(x.savedAt)}</small></span></button></li>`).join("")
      : `<li class="muted">Nothing saved yet. Write or check an article and press <b>Save</b>.</li>`;
    loadPulse(true);
  }
  const band = (s) => (typeof s !== "number" ? "" : s >= 85 ? "good" : s >= 70 ? "ok" : "bad");
  const pubName = (id) => (ws.profiles.find((p) => p.id === id) || {}).name || "—";

  // ---------------- WRITE ----------------
  const FIELD_IDS = ["fTitle", "fMeta", "fKeyword", "fSecondary", "fSlug", "fType"];
  const FM_MAP = { title: "fTitle", meta_description: "fMeta", focus_keyword: "fKeyword", secondary_keywords: "fSecondary", slug: "fSlug" };
  let filter = "issues", lastReport = null, mode = "edit";

  function renderWrite() {
    const p = profile();
    $("genPubName").textContent = p.name;
    $("genModel").textContent = PROVIDERS[curProvider()].label + " · " + curModel() + (grounded() ? " + live search" : "");
    renderDesks();
    $("md").value = ws.doc.markdown || "";
    FIELD_IDS.forEach((id) => { $(id).value = (ws.doc.fields || {})[id] || (id === "fType" ? "news" : ""); });
    renderPolicyBanner();
    renderDocSource();
    renderSources();
    updateCounts(); wordCount(); runQc();
    if (mode === "preview") renderPreview();
  }
  function renderPolicyBanner() {
    const p = profile(), b = $("aiPolicyBanner");
    const msgs = {
      banned: `<b>${esc(p.name)} does not accept AI-generated articles.</b> Use Generate for research notes only, then write the piece in your own words. QC still checks your draft against their rules.`,
      disclose: `<b>${esc(p.name)} allows AI help with disclosure.</b> ${esc(p.aiPolicyNote || "Add the disclosure they require before submitting.")}`,
      unknown: `<b>${esc(p.name)}'s AI policy isn't confirmed.</b> Check their guidelines before submitting AI-assisted work.`,
    };
    if (p.id === "house" || !msgs[p.aiPolicy]) { b.hidden = true; return; }
    b.className = "banner " + (p.aiPolicy === "banned" ? "danger" : "warn");
    b.innerHTML = msgs[p.aiPolicy] + (p.imported ? "" : ` <a href="#/pubs" class="link">Import ${esc(p.name)}'s rules →</a>`);
    b.hidden = false;
  }
  function renderDesks() {
    $("desks").innerHTML = Object.entries(Prompt.DESKS).map(([k, d]) => `<button type="button" class="chip${k === ws.desk ? " is-on" : ""}" data-desk="${k}" role="radio" aria-checked="${k === ws.desk}">${esc(d.label)}</button>`).join("");
  }
  function renderDocSource() {
    const d = ws.doc, el = $("docSource");
    if (!d.origin) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = `<span class="tag">${esc(d.origin)}</span> ${d.url ? `<a href="${esc(d.url)}" target="_blank" rel="noopener" class="link">${esc(d.url)}</a>` : ""} ${d.html ? '<span class="muted small">· page SEO checks on</span>' : ""} <button class="link-btn" id="detachDoc">clear source</button>`;
    $("detachDoc").onclick = () => { ws.doc.url = ""; ws.doc.html = ""; ws.doc.origin = ""; save(); renderDocSource(); runQc(); };
  }
  function syncDocFromInputs() {
    ws.doc.markdown = $("md").value;
    ws.doc.fields = Object.fromEntries(FIELD_IDS.map((id) => [id, $(id).value]));
    save();
  }
  function applyFrontMatter(md, overwrite) {
    const { fields } = QC.parseFrontMatter(md);
    Object.entries(FM_MAP).forEach(([k, id]) => { if (fields[k] && (overwrite || !$(id).value)) $(id).value = fields[k]; });
    if (!$("fTitle").value) { const h = md.match(/^#\s+(.+)$/m); if (h) $("fTitle").value = h[1].trim(); }
    updateCounts(); syncDocFromInputs();
  }
  function updateCounts() {
    qsa(".count").forEach((el) => {
      const n = $(el.dataset.for).value.length;
      const [lo, hi] = el.dataset.for === "fTitle" ? [30, profile().rules?.titleMaxChars || 60] : [120, 160];
      el.textContent = n;
      el.className = "count " + (n === 0 ? "" : n < lo || n > hi ? "bad" : "good");
    });
  }
  function wordCount() {
    const n = (QC.stripMarkdown($("md").value).match(/[A-Za-z0-9][A-Za-z0-9'’.%$-]*/g) || []).length;
    $("wordCount").textContent = n.toLocaleString() + (n === 1 ? " word" : " words");
  }
  function bodyHtml() { return DOMPurify.sanitize(marked.parse(QC.parseFrontMatter($("md").value).body)); }
  function renderPreview() { $("preview").innerHTML = bodyHtml(); }
  function setMode(m) {
    mode = m;
    qsa(".seg-btn").forEach((b) => b.classList.toggle("is-on", b.dataset.mode === m));
    $("md").hidden = m !== "edit"; $("preview").hidden = m !== "preview";
    if (m === "preview") renderPreview();
  }
  function renderSources() {
    const s = ws.doc.sources || [];
    $("sources").innerHTML = s.length
      ? s.map((x) => `<li><a href="${esc(x.uri)}" target="_blank" rel="noopener">${esc(x.title || x.uri)}</a></li>`).join("")
      : `<li class="muted">Live sources used for a generated article appear here.</li>`;
  }

  async function generate() {
    const p = profile();
    if (p.aiPolicy === "banned" && !confirm(`${p.name} does not accept AI-generated articles.\n\nGenerate a research draft anyway? You'll need to rewrite it in your own words before submitting.`)) return;
    const pr = Prompt.build({ desk: ws.desk, topic: $("topic").value, author: S().author, minWords: +S().min, maxWords: +S().max, houseStyle: S().style, profile: p, grounded: grounded() });
    const btn = $("generate");
    busy(btn, true, "Researching…");
    try {
      const data = await gemini({ prompt: pr.user, system: pr.system, grounding: grounded() });
      const text = data.text.replace(/^```(?:markdown|md)?\s*\n/i, "").replace(/\n```\s*$/i, "").trim() + "\n";
      $("md").value = text;
      ws.doc.sources = data.sources || [];
      ws.doc.url = ""; ws.doc.html = ""; ws.doc.origin = "Generated";
      FIELD_IDS.slice(0, 5).forEach((id) => ($(id).value = ""));
      applyFrontMatter(text, true);
      renderSources(); renderDocSource(); wordCount(); runQc();
      if (mode === "preview") renderPreview();
      toast(data.grounded === false ? "Draft ready — fill in every [VERIFY] from a live source." : "Article ready — review the QC report.", "ok");
    } catch (e) { toast(e.message, "err"); }
    finally { busy(btn, false); }
  }

  // ---------------- QC ----------------
  function buildReport(md, fields, opts = {}) {
    const p = opts.profile === undefined ? profile() : opts.profile;
    const input = {
      markdown: md, title: fields.fTitle, meta: fields.fMeta, keyword: fields.fKeyword, secondary: fields.fSecondary,
      slug: fields.fSlug, contentType: fields.fType || "news", sources: opts.sources || [],
      author: S().author || QC.parseFrontMatter(md).fields.author || "",
    };
    let rep = QC.run(input);
    const extra = [];
    if (p) extra.push(...QC.siteRules(input, p));
    if (opts.html) extra.push(...QC.pageSeo(opts.html, opts.url));
    if (extra.length) rep = QC.merge(rep, extra);
    return rep;
  }
  function runQc() {
    lastReport = buildReport($("md").value, Object.fromEntries(FIELD_IDS.map((id) => [id, $(id).value])), { sources: ws.doc.sources, html: ws.doc.html, url: ws.doc.url });
    renderReport();
  }
  function renderReport() {
    const r = lastReport; if (!r) return;
    const empty = r.stats.wc < 30;
    const circ = 2 * Math.PI * 34;
    $("ringBar").style.strokeDasharray = circ;
    $("ringBar").style.strokeDashoffset = empty ? circ : circ * (1 - r.score / 100);
    $("ring").dataset.band = empty ? "" : r.errors ? "bad" : band(r.score);
    $("score").textContent = empty ? "—" : r.score;
    $("grade").textContent = empty ? "Waiting for an article" : r.grade;
    $("cErr").textContent = r.errors; $("cWarn").textContent = r.warns; $("cPass").textContent = r.passes;
    const shown = r.findings.filter((f) => filter === "all" ? true : filter === "pass" ? f.severity === "pass" : filter === "site" ? f.site : f.severity !== "pass");
    const list = $("findings");
    if (!shown.length) {
      list.innerHTML = `<li class="empty">${filter === "site" ? (profile().imported ? "No site-rule issues." : `No rules for ${esc(profile().name)} yet — import them in Publications.`) : filter === "pass" ? "Nothing passed yet." : "No issues found. Nice work."}</li>`;
      return;
    }
    let last = "", html = "";
    shown.forEach((f, i) => {
      if (f.category !== last) { html += `<li class="cat">${esc(f.category)}</li>`; last = f.category; }
      html += `<li class="finding sev-${f.severity}${f.match ? " jump" : ""}" data-i="${i}" ${f.match ? 'tabindex="0" title="Jump to this in the editor"' : ""}>
        <span class="sev" aria-label="${f.severity}"></span>
        <div><p class="msg">${esc(f.message)}</p>${f.fix ? `<p class="fix">${esc(f.fix)}</p>` : ""}${f.ref ? `<a class="ref" href="${esc(f.ref.url)}" target="_blank" rel="noopener">${esc(f.ref.label)} ↗</a>` : ""}</div></li>`;
    });
    list.innerHTML = html;
    qsa(".finding.jump", list).forEach((li) => {
      const f = shown[+li.dataset.i];
      const go = () => jumpTo(f.match);
      li.onclick = (e) => { if (!e.target.closest("a")) go(); };
      li.onkeydown = (e) => { if (e.key === "Enter") go(); };
    });
  }
  function jumpTo(needle) {
    const ta = $("md");
    setMode("edit");
    const hay = ta.value.toLowerCase();
    let i = hay.indexOf(needle.toLowerCase());
    if (i < 0) i = hay.indexOf(needle.toLowerCase().trim().slice(0, 30));
    if (i < 0) { toast("Couldn't find that text in the editor.", ""); return; }
    ta.focus();
    ta.setSelectionRange(i, i + needle.length);
    const lh = parseFloat(getComputedStyle(ta).lineHeight) || 22;
    ta.scrollTop = Math.max(0, (ta.value.slice(0, i).split("\n").length - 4) * lh);
    ta.scrollIntoView({ block: "center", behavior: "smooth" });
  }
  function reportRows(rep, url) {
    const rows = [["URL / Title", "Severity", "Category", "Finding", "How to fix", "Reference"]];
    const label = url || $("fTitle").value || "Draft";
    rep.findings.forEach((f) => rows.push([label, f.severity, f.category, f.message, f.fix, f.ref ? f.ref.url : ""]));
    return rows;
  }
  async function aiReview() {
    const md = $("md").value.trim();
    if (md.length < 200) { toast("Write or generate an article first.", ""); return; }
    const p = profile(), out = $("aiOut"), btn = $("aiReview");
    out.hidden = false; out.innerHTML = '<p class="muted">Asking Gemini for an editor\'s second opinion…</p>';
    const issues = (lastReport?.findings || []).filter((f) => f.severity !== "pass").map((f) => "- " + f.message).join("\n");
    const prompt = [
      "You are a strict financial news editor and SEO reviewer.",
      `Review the article for submission to ${p.name}. Check it against Google's helpful content guidance, spam policies and YMYL standards for financial content${p.id !== "house" ? ", and against these publication rules" : ""}:`,
      Prompt.profileBrief(p) || "- (no publication-specific rules)",
      p.aiPolicy && p.aiPolicy !== "unknown" ? `Publication AI policy: ${p.aiPolicy}. ${p.aiPolicyNote || ""}` : "",
      "Return markdown: a one-line verdict; up to 6 specific problems (quote the exact sentence, say which rule it breaks, give a rewrite); then factual claims that need verification.",
      "Skip issues an automated checker already flagged:", issues || "- none", "", "ARTICLE:", md.slice(0, 40000),
    ].join("\n");
    busy(btn, true, "Reviewing…");
    try {
      const data = await gemini({ prompt, grounding: false, temperature: 0.3 });
      out.innerHTML = "<h4>Editor's second opinion</h4>" + DOMPurify.sanitize(marked.parse(data.text));
    } catch (e) { out.hidden = true; toast(e.message, "err"); }
    finally { busy(btn, false); }
  }

  // ---------------- imports ----------------
  function loadPage(html, url, origin) {
    const page = QC.fromHtml(html);
    $("md").value = page.markdown;
    $("fTitle").value = page.title; $("fMeta").value = page.meta;
    $("fKeyword").value = ""; $("fSecondary").value = "";
    try { $("fSlug").value = url ? new URL(url).pathname.replace(/^\/|\/$/g, "") : ""; } catch { $("fSlug").value = ""; }
    ws.doc.sources = []; ws.doc.url = url || ""; ws.doc.html = html; ws.doc.origin = origin;
    syncDocFromInputs(); updateCounts(); renderSources(); renderDocSource(); wordCount(); runQc();
    if (mode === "preview") renderPreview();
    toast("Imported. Add a focus keyword for full keyword checks.", "ok");
  }
  async function importUrl(url) {
    try { const d = await fetchPage(url); loadPage(d.html, d.finalUrl, "Published URL"); }
    catch (e) { toast(e.message, "err"); }
  }
  let mammothP;
  function loadMammoth() {
    mammothP = mammothP || new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js";
      s.onload = () => res(window.mammoth); s.onerror = () => rej(new Error("Couldn't load the Word reader."));
      document.head.appendChild(s);
    });
    return mammothP;
  }
  async function importFile(file) {
    const name = file.name.toLowerCase();
    try {
      if (name.endsWith(".docx")) {
        const mammoth = await loadMammoth();
        const { value } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
        const page = QC.fromHtml("<article>" + value + "</article>");
        setDocText(page.markdown, "Word file: " + file.name);
      } else if (/\.html?$/.test(name)) {
        loadPage(await file.text(), "", "HTML file: " + file.name);
      } else {
        setDocText(await file.text(), "File: " + file.name);
      }
    } catch (e) { toast(e.message || "Couldn't read that file.", "err"); }
  }
  function setDocText(text, origin) {
    $("md").value = text;
    ws.doc.sources = []; ws.doc.url = ""; ws.doc.html = ""; ws.doc.origin = origin;
    FIELD_IDS.slice(0, 5).forEach((id) => ($(id).value = ""));
    applyFrontMatter(text, true);
    renderSources(); renderDocSource(); wordCount(); runQc();
    if (mode === "preview") renderPreview();
    toast("Loaded.", "ok");
  }
  async function copyForDocs() {
    try {
      if (window.ClipboardItem) {
        await navigator.clipboard.write([new ClipboardItem({
          "text/html": new Blob([`<meta charset="utf-8">${bodyHtml()}`], { type: "text/html" }),
          "text/plain": new Blob([QC.stripMarkdown($("md").value)], { type: "text/plain" }),
        })]);
      } else await navigator.clipboard.writeText(QC.stripMarkdown($("md").value));
      toast("Copied — paste into Google Docs to keep formatting.", "ok");
    } catch { toast("Copy blocked. Use Preview, select all, then copy.", "err"); }
  }
  function saveToLibrary() {
    const md = $("md").value.trim();
    if (!md) { toast("Nothing to save yet.", ""); return; }
    syncDocFromInputs();
    const item = {
      id: uid(), savedAt: Date.now(), profileId: profile().id,
      type: ws.doc.url ? "published" : "draft",
      title: $("fTitle").value || (md.match(/^#\s+(.+)$/m) || [])[1] || "Untitled",
      url: ws.doc.url, score: lastReport && lastReport.stats.wc >= 30 ? lastReport.score : null,
      errors: lastReport?.errors || 0, warns: lastReport?.warns || 0,
      doc: { markdown: md, fields: clone(ws.doc.fields), sources: clone(ws.doc.sources || []), url: ws.doc.url, origin: ws.doc.origin },
    };
    ws.history.unshift(item);
    ws.history = ws.history.slice(0, 200);
    save();
    toast("Saved to Library.", "ok");
  }
  function openItem(id) {
    const it = ws.history.find((x) => x.id === id);
    if (!it) return;
    ws.doc = Object.assign({ html: "" }, clone(it.doc));
    if (ws.profiles.some((p) => p.id === it.profileId)) ws.activeProfile = it.profileId;
    save(); renderPubSelect();
    location.hash = "#/write";
    if (it.url && !ws.doc.html) toast("Opened. Re-import the URL to re-run page SEO checks.", "");
  }

  // ---------------- BATCH ----------------
  let batchResults = [];
  function renderBatchHead() { $("batchPubName").textContent = profile().name; }
  async function runBatch() {
    const urls = $("batchUrls").value.split(/\s+/).map((u) => u.trim()).filter((u) => /^https?:\/\//i.test(u));
    const unique = [...new Set(urls)].slice(0, 10);
    if (!unique.length) { toast("Add at least one URL starting with https://", ""); return; }
    const btn = $("batchRun"), tbody = qs("#batchTable tbody");
    busy(btn, true, "Checking…");
    batchResults = unique.map((url) => ({ url, status: "pending" }));
    drawBatch();
    const useSite = $("batchSite").checked;
    let idx = 0;
    const worker = async () => {
      while (idx < batchResults.length) {
        const row = batchResults[idx++];
        try {
          const d = await fetchPage(row.url);
          const page = QC.fromHtml(d.html);
          const rep = buildReport(page.markdown, { fTitle: page.title, fMeta: page.meta, fType: "news" }, { profile: useSite ? profile() : null, html: d.html, url: d.finalUrl });
          Object.assign(row, { status: "done", title: page.title, rep, html: d.html, finalUrl: d.finalUrl });
        } catch (e) { Object.assign(row, { status: "error", error: e.message }); }
        drawBatch();
      }
    };
    await Promise.all([worker(), worker()]);
    busy(btn, false);
    $("batchCsv").disabled = $("batchSheets").disabled = !batchResults.some((r) => r.rep);
    toast("Batch check finished.", "ok");
    void tbody;
  }
  function drawBatch() {
    qs("#batchTable tbody").innerHTML = batchResults.map((r, i) => {
      if (r.status === "pending") return `<tr><td class="url">${esc(r.url)}</td><td colspan="5" class="muted">Checking…</td></tr>`;
      if (r.status === "error") return `<tr><td class="url">${esc(r.url)}</td><td colspan="4" class="c-err">${esc(r.error)}</td><td></td></tr>`;
      const top = r.rep.findings.find((f) => f.severity === "error") || r.rep.findings.find((f) => f.severity === "warn");
      return `<tr><td class="url"><b>${esc(r.title || r.url)}</b><small class="muted">${esc(r.url)}</small></td>
        <td><span class="badge-score ${r.rep.errors ? "bad" : band(r.rep.score)}">${r.rep.score}</span></td>
        <td class="c-err">${r.rep.errors}</td><td class="c-warn">${r.rep.warns}</td>
        <td class="small">${top ? esc(top.message) : '<span class="c-pass">No issues</span>'}</td>
        <td><button class="btn btn-sm" data-batch-open="${i}">Open</button></td></tr>`;
    }).join("");
  }
  function batchRows() {
    const rows = [["URL", "Title", "Score", "Severity", "Category", "Finding", "How to fix", "Reference"]];
    batchResults.filter((r) => r.rep).forEach((r) => r.rep.findings.forEach((f) => rows.push([r.url, r.title, r.rep.score, f.severity, f.category, f.message, f.fix, f.ref ? f.ref.url : ""])));
    return rows;
  }
  const tsv = (rows) => rows.map((r) => r.map((v) => String(v == null ? "" : v).replace(/[\t\n]/g, " ")).join("\t")).join("\n");

  // ---------------- PUBLICATIONS ----------------
  function renderPubs() {
    $("pubGrid").innerHTML = ws.profiles.map((p) => {
      const r = p.rules || {};
      const facts = [
        r.minWords || r.maxWords ? `${r.minWords || "?"}–${r.maxWords || "?"} words` : null,
        r.spelling && r.spelling !== "any" ? r.spelling + " English" : null,
        r.disclaimerRequired ? "Disclaimer" : null,
        r.noPromotional ? "No promo" : null,
        typeof r.maxLinks === "number" ? `≤${r.maxLinks} links` : null,
      ].filter(Boolean);
      const ai = { allowed: ["AI allowed", "good"], disclose: ["AI with disclosure", "ok"], banned: ["No AI content", "bad"], unknown: ["AI policy unknown", ""] }[p.aiPolicy || "unknown"];
      return `<article class="pub ${p.id === ws.activeProfile ? "is-active" : ""}">
        <div class="pub-top"><span class="pub-mark" style="background:${esc(p.color || "var(--gold)")}">${esc((p.name || "?").slice(0, 1))}</span>
          <div class="grow"><h3>${esc(p.name)}</h3><small class="muted">${esc(p.category || p.domain || "")}</small></div>
          ${p.id === ws.activeProfile ? '<span class="tag gold">Active</span>' : ""}</div>
        <div class="pub-tags"><span class="pill ${ai[1]}">${ai[0]}</span>${p.imported ? '<span class="pill good">Rules ready</span>' : '<span class="pill">Rules not imported</span>'}</div>
        <p class="small muted">${facts.length ? esc(facts.join(" · ")) : "No rules yet."}</p>
        <div class="pub-actions">
          <button class="btn btn-sm" data-pub-use="${esc(p.id)}">Write for this</button>
          <button class="btn btn-sm" data-pub-edit="${esc(p.id)}">${p.imported ? "Edit rules" : "Set up"}</button>
          ${p.guidelinesUrl ? `<a class="btn btn-sm btn-ghost" href="${esc(p.guidelinesUrl)}" target="_blank" rel="noopener">Guidelines ↗</a>` : ""}
        </div></article>`;
    }).join("");
  }
  let editingId = null;
  const LIST_FIELDS = ["requiredSections", "bannedPhrases", "requiredPhrases", "otherRules"];
  const NUM_FIELDS = ["minWords", "maxWords", "titleMaxChars", "minLinks", "maxLinks", "bioMaxWords"];
  const BOOL_FIELDS = ["requireSources", "noAffiliateLinks", "noPromotional", "disclaimerRequired", "bioRequired"];
  const STR_FIELDS = ["spelling", "headingCase", "firstPerson", "disclaimerText"];
  function openPub(id) {
    const p = id ? ws.profiles.find((x) => x.id === id) : { id: null, name: "", domain: "", category: "", guidelinesUrl: "", aiPolicy: "unknown", aiPolicyNote: "", rules: SeedData.emptyRules(), notes: "" };
    editingId = p.id;
    fillPubForm(p);
    $("pubDlgTitle").textContent = id ? p.name : "Add publication";
    $("delPub").hidden = !id || id === "house";
    $("importNote").hidden = true;
    $("pubDlg").returnValue = "";
    $("pubDlg").showModal();
  }
  function fillPubForm(p) {
    const f = $("pubForm"), r = Object.assign(SeedData.emptyRules(), p.rules || {});
    ["name", "domain", "category", "guidelinesUrl", "aiPolicy", "aiPolicyNote", "notes"].forEach((k) => (f.elements[k].value = p[k] || (k === "aiPolicy" ? "unknown" : "")));
    NUM_FIELDS.forEach((k) => (f.elements[k].value = r[k] == null ? "" : r[k]));
    BOOL_FIELDS.forEach((k) => (f.elements[k].checked = Boolean(r[k])));
    STR_FIELDS.forEach((k) => (f.elements[k].value = r[k] || (k === "disclaimerText" ? "" : "any")));
    LIST_FIELDS.forEach((k) => (f.elements[k].value = (r[k] || []).join("\n")));
  }
  function readPubForm() {
    const f = $("pubForm"), rules = {};
    NUM_FIELDS.forEach((k) => { const v = f.elements[k].value.trim(); rules[k] = v === "" ? null : Math.max(0, parseInt(v, 10)); });
    BOOL_FIELDS.forEach((k) => (rules[k] = f.elements[k].checked));
    STR_FIELDS.forEach((k) => (rules[k] = f.elements[k].value));
    LIST_FIELDS.forEach((k) => (rules[k] = f.elements[k].value.split("\n").map((s) => s.trim()).filter(Boolean)));
    const out = { rules };
    ["name", "domain", "category", "guidelinesUrl", "aiPolicy", "aiPolicyNote", "notes"].forEach((k) => (out[k] = f.elements[k].value.trim()));
    return out;
  }
  function savePub() {
    const data = readPubForm();
    if (!data.name) { toast("Give the publication a name.", "err"); return false; }
    if (editingId) {
      const p = ws.profiles.find((x) => x.id === editingId);
      const hasRules = Object.values(data.rules).some((v) => (Array.isArray(v) ? v.length : v && v !== "any"));
      Object.assign(p, data, { imported: p.imported || hasRules });
    } else {
      const colors = ["#c9a24a", "#2d6cdf", "#16a37a", "#d9534f", "#8b5cf6", "#e8692c"];
      ws.profiles.push(Object.assign({ id: uid(), color: colors[ws.profiles.length % colors.length], imported: Object.values(data.rules).some((v) => (Array.isArray(v) ? v.length : v && v !== "any")) }, data));
    }
    save(); renderPubSelect(); renderPubs();
    toast("Publication saved.", "ok");
    return true;
  }
  const RULE_SCHEMA = `{
  "aiPolicy": "allowed" | "disclose" | "banned" | "unknown",
  "aiPolicyNote": string,
  "minWords": number|null, "maxWords": number|null, "titleMaxChars": number|null,
  "minLinks": number|null, "maxLinks": number|null,
  "requireSources": boolean, "noAffiliateLinks": boolean, "noPromotional": boolean,
  "disclaimerRequired": boolean, "disclaimerText": string,
  "spelling": "US" | "UK" | "any", "headingCase": "sentence" | "title" | "any", "firstPerson": "avoid" | "any",
  "bioRequired": boolean, "bioMaxWords": number|null,
  "requiredSections": string[], "bannedPhrases": string[], "requiredPhrases": string[],
  "otherRules": string[],
  "summary": string
}`;
  async function extractRules(text, sourceLabel) {
    const prompt = [
      "Extract contributor/editorial rules from the publication guidelines below into JSON matching this schema exactly:",
      RULE_SCHEMA,
      "Rules:",
      "- Only include rules the text actually states. Use null, false, \"any\" or [] when the text doesn't say.",
      "- aiPolicy: 'banned' only if AI-written content is explicitly not accepted; 'disclose' if allowed with disclosure; 'allowed' if explicitly allowed; otherwise 'unknown'.",
      "- otherRules: short imperative sentences for important rules that don't fit other fields (exclusivity, originality, pitching process, image rules, conflicts of interest, etc.). Max 12.",
      "- summary: one sentence describing what the publication wants.",
      "", `GUIDELINES (${sourceLabel}):`, text.slice(0, 45000),
    ].join("\n");
    const data = await gemini({ prompt, json: true, grounding: false, temperature: 0.1 });
    let obj;
    try { obj = JSON.parse(data.text.replace(/^```json\s*|\s*```$/g, "")); } catch { throw new Error("The AI reply wasn't valid JSON. Try again."); }
    return obj;
  }
  function applyExtracted(obj) {
    const cur = readPubForm();
    const rules = Object.assign(SeedData.emptyRules(), cur.rules);
    Object.keys(rules).forEach((k) => { if (obj[k] !== undefined && obj[k] !== null && !(Array.isArray(obj[k]) && !obj[k].length) && obj[k] !== "") rules[k] = obj[k]; });
    fillPubForm(Object.assign(cur, { rules, aiPolicy: obj.aiPolicy || cur.aiPolicy, aiPolicyNote: obj.aiPolicyNote || cur.aiPolicyNote }));
    const n = $("importNote");
    n.className = "banner ok"; n.hidden = false;
    n.innerHTML = `<b>Rules imported — please review before saving.</b> ${esc(obj.summary || "")} AI can misread guidelines, so check each field against the source page.`;
  }
  async function importRules() {
    const f = $("pubForm"), url = f.elements.guidelinesUrl.value.trim(), btn = $("importRules");
    const p = editingId ? ws.profiles.find((x) => x.id === editingId) : null;
    if (!url) { openPaste("Add a guidelines URL, or paste the guidelines text here."); return; }
    busy(btn, true, "Reading guidelines…");
    try {
      const urls = [url].concat((p && p.extraUrls) || []).slice(0, 3);
      const texts = [];
      for (const u of urls) {
        try { const d = await fetchPage(u); texts.push(`# Source: ${u}\n` + QC.fromHtml(d.html).markdown); } catch (e) { if (u === url) throw e; }
      }
      const joined = texts.join("\n\n");
      if (QC.stripMarkdown(joined).split(/\s+/).length < 80) throw new Error("The page had too little readable text.");
      applyExtracted(await extractRules(joined, url));
    } catch (e) {
      openPaste(`Couldn't read the guidelines automatically (${e.message}). Copy the text from the page and paste it here.`);
    } finally { busy(btn, false); }
  }
  function openPaste(why) { $("pasteWhy").textContent = why; $("pasteText").value = ""; $("pasteDlg").returnValue = ""; $("pasteDlg").showModal(); }

  // ---------------- LIBRARY ----------------
  function renderLibrary() {
    const sel = $("libFilter"), cur = sel.value;
    sel.innerHTML = `<option value="">All publications</option>` + ws.profiles.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("");
    sel.value = cur;
    const q = $("libSearch").value.toLowerCase();
    const items = ws.history.filter((x) => (!sel.value || x.profileId === sel.value) && (!q || (x.title || "").toLowerCase().includes(q)));
    qs("#libTable tbody").innerHTML = items.length ? items.map((x) => `<tr>
      <td><b>${esc(x.title)}</b>${x.url ? `<small class="muted url">${esc(x.url)}</small>` : ""}</td>
      <td>${esc(pubName(x.profileId))}</td><td>${x.type === "published" ? "Published QC" : "Draft"}</td>
      <td><span class="badge-score ${band(x.score)}">${x.score ?? "—"}</span></td>
      <td class="muted small">${new Date(x.savedAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
      <td class="nowrap"><button class="btn btn-sm" data-open="${esc(x.id)}">Open</button> <button class="btn btn-sm btn-ghost danger" data-del="${esc(x.id)}" aria-label="Delete">✕</button></td></tr>`).join("")
      : `<tr><td colspan="6" class="muted center">Nothing here yet. Use <b>Save</b> in Write &amp; QC.</td></tr>`;
  }

  // ---------------- POLICIES ----------------
  function renderPolicies() {
    const groups = {};
    SeedData.POLICIES.forEach((p) => (groups[p.group] = groups[p.group] || []).push(p));
    let html = Object.entries(groups).map(([g, list]) => `<section><h3 class="eyebrow">${esc(g)}</h3><div class="policy-grid">${list.map((p) => `
      <a class="policy" href="${esc(p.url)}" target="_blank" rel="noopener"><h4>${esc(p.title)} ↗</h4><p class="small muted">${esc(p.summary)}</p>
      <div class="pub-tags">${p.checks.map((c) => `<span class="pill">${esc(c)}</span>`).join("")}</div></a>`).join("")}</div></section>`).join("");
    const pubs = ws.profiles.filter((p) => p.guidelinesUrl);
    if (pubs.length) html += `<section><h3 class="eyebrow">Publication guidelines</h3><div class="policy-grid">${pubs.map((p) => `
      <a class="policy" href="${esc(p.guidelinesUrl)}" target="_blank" rel="noopener"><h4>${esc(p.name)} ↗</h4><p class="small muted">${esc(p.category || p.domain)}</p>
      <div class="pub-tags"><span class="pill ${p.imported ? "good" : ""}">${p.imported ? "Rules imported" : "Not imported"}</span></div></a>`).join("")}</div></section>`;
    $("policyList").innerHTML = html;
  }

  // ---------------- PULSE ----------------
  let pulse = null, pulseKind = "all", pulseLoading = null;
  const unent = (t) => String(t || "").replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&amp;/g, "&");
  async function loadPulse(forDesk, force) {
    if (!pulse || force) {
      pulseLoading = pulseLoading || api("/api/pulse").then((d) => { d.items.forEach((i) => (i.title = unent(i.title))); return (pulse = d); }).catch(() => (pulse = { items: [], failed: ["all"] })).finally(() => (pulseLoading = null));
      await pulseLoading;
    }
    if (forDesk) {
      $("deskPulse").innerHTML = pulse.items.slice(0, 5).map((i) => `<li><a class="row-btn" href="${esc(i.link)}" target="_blank" rel="noopener"><span class="pill ${i.kind === "ranking" ? "bad" : ""}">${esc(kindLabel(i.kind))}</span><span class="grow"><b>${esc(i.title)}</b><small class="muted">${esc(i.source)}${i.date ? " · " + relTime(i.date) : ""}</small></span></a></li>`).join("") || `<li class="muted">Couldn't load updates right now.</li>`;
      return;
    }
    const items = pulse.items.filter((i) => pulseKind === "all" || i.kind === pulseKind);
    $("pulseList").innerHTML = items.length ? items.map((i) => `<li><a href="${esc(i.link)}" target="_blank" rel="noopener" class="pulse-item">
      <span class="pill ${i.kind === "ranking" ? "bad" : i.kind === "google" ? "gold" : ""}">${esc(kindLabel(i.kind))}</span>
      <div><h4>${esc(i.title)}</h4><small class="muted">${esc(i.source)}${i.date ? " · " + relTime(i.date) : ""}</small></div></a></li>`).join("")
      : `<li class="muted">No updates in this category right now.</li>`;
    if (pulse.failed && pulse.failed.length && pulse.failed[0] !== "all") $("pulseList").insertAdjacentHTML("beforeend", `<li class="muted small">Couldn't reach: ${esc(pulse.failed.join(", "))}</li>`);
  }
  const kindLabel = (k) => ({ ranking: "Ranking", google: "Google", docs: "Docs", patents: "Patent", industry: "Industry" }[k] || k);

  // ---------------- SETTINGS ----------------
  function renderSettings() {
    const s = S();
    $("sProvider").value = curProvider();
    renderProviderFields();
    $("sGrounding").checked = s.grounding; $("sAccess").value = s.access;
    $("sAuthor").value = s.author; $("sMin").value = s.min; $("sMax").value = s.max; $("sStyle").value = s.style; $("sAutoQc").checked = s.autoQc;
  }
  function renderProviderFields(pid) {
    pid = pid || $("sProvider").value;
    const P = PROVIDERS[pid];
    $("sKey").value = (S().keys || {})[pid] || "";
    $("sModel").value = (S().models || {})[pid] || P.model;
    $("modelList").innerHTML = P.suggest.map((m) => `<option value="${esc(m)}"></option>`).join("");
    $("sKeyLink").href = P.key;
    const onServer = serverStatus && (serverStatus.providers || {})[pid];
    $("sKeyWhere").textContent = onServer ? "set in Netlify — optional here" : "saved in this browser only";
    $("groundRow").hidden = !P.grounding;
    $("sProviderHint").innerHTML = esc(P.hint) + ` To use one key on every device, add <code>${P.env}</code> in Netlify instead. Netlify AI credits are never used.`;
  }
  function stashProviderFields(pid) {
    ws.settings.keys = Object.assign({}, S().keys, { [pid]: $("sKey").value.trim() });
    ws.settings.models = Object.assign({}, S().models, { [pid]: $("sModel").value.trim() || PROVIDERS[pid].model });
  }
  let shownProvider = null;
  async function loadModels() {
    const pid = $("sProvider").value, btn = $("loadModels");
    stashProviderFields(pid);
    busy(btn, true, "Loading…");
    try {
      const h = {}; const k = (S().keys || {})[pid]; if (k) h["x-provider-key"] = k; if (S().access) h["x-access-code"] = S().access;
      const r = await fetch("/api/models?provider=" + pid, { headers: h });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Couldn't load models.");
      $("modelList").innerHTML = d.models.map((m) => `<option value="${esc(m.id)}">${esc(m.label !== m.id ? m.label : "")}</option>`).join("");
      toast(`${d.models.length} models available — click the Model box to pick one.`, "ok");
      $("sModel").focus();
    } catch (e) { toast(e.message, "err"); }
    finally { busy(btn, false); }
  }
  function saveSettings() {
    const pid = $("sProvider").value;
    stashProviderFields(pid);
    Object.assign(ws.settings, {
      provider: pid, grounding: $("sGrounding").checked, access: $("sAccess").value.trim(),
      author: $("sAuthor").value.trim(), min: +$("sMin").value || 600, max: +$("sMax").value || 900, style: $("sStyle").value, autoQc: $("sAutoQc").checked,
    });
    save(); checkStatus().then(() => pullCloud(true));
    toast(`Saved — writing with ${PROVIDERS[pid].label} · ${curModel()}.`, "ok");
  }

  // ---------------- events ----------------
  function bind() {
    window.addEventListener("hashchange", route);
    $("menuBtn").onclick = () => document.body.classList.toggle("nav-open");
    $("themeBtn").onclick = () => { ws.settings.theme = S().theme === "dark" ? "light" : "dark"; applyTheme(); save({ silent: true }); writeLS(WS_KEY, ws); };
    $("pubSelect").onchange = (e) => {
      ws.activeProfile = e.target.value; save(); renderPubSelect();
      const v = (location.hash.replace(/^#\//, "") || "desk");
      if (v === "write") { $("genPubName").textContent = profile().name; renderPolicyBanner(); updateCounts(); runQc(); }
      else if (v === "pubs") renderPubs(); else if (v === "batch") renderBatchHead();
      toast("Now writing for " + profile().name + ".", "");
    };
    document.addEventListener("click", (e) => {
      const t = e.target.closest("[data-open],[data-del],[data-pub-use],[data-pub-edit],[data-batch-open],[data-desk],[data-act]");
      if (!t) { if (!e.target.closest(".menu")) $("moreMenu").hidden = true; return; }
      if (t.dataset.open) openItem(t.dataset.open);
      else if (t.dataset.del) { if (confirm("Delete this saved item?")) { ws.history = ws.history.filter((x) => x.id !== t.dataset.del); save(); renderLibrary(); } }
      else if (t.dataset.pubUse) { ws.activeProfile = t.dataset.pubUse; save(); renderPubSelect(); location.hash = "#/write"; }
      else if (t.dataset.pubEdit) openPub(t.dataset.pubEdit);
      else if (t.dataset.batchOpen !== undefined) { const r = batchResults[+t.dataset.batchOpen]; location.hash = "#/write"; setTimeout(() => loadPage(r.html, r.finalUrl, "Published URL"), 0); }
      else if (t.dataset.desk) { ws.desk = t.dataset.desk; save(); renderDesks(); }
      else if (t.dataset.act) {
        $("moreMenu").hidden = true;
        const a = t.dataset.act;
        if (a === "docs") copyForDocs();
        else if (a === "md") copy($("md").value, "Markdown copied.");
        else if (a === "sheets") copy(tsv(reportRows(lastReport, ws.doc.url)), "Report copied — paste into a Google Sheet.");
        else if (a === "csv") download(`qc-report-${new Date().toISOString().slice(0, 10)}.csv`, QC.toCsv(reportRows(lastReport, ws.doc.url)), "text/csv");
        else if (a === "clear" && confirm("Clear the document, SEO fields and sources?")) {
          $("md").value = ""; FIELD_IDS.slice(0, 5).forEach((id) => ($(id).value = ""));
          ws.doc = { markdown: "", fields: {}, sources: [], url: "", html: "", origin: "" };
          $("aiOut").hidden = true; save(); renderSources(); renderDocSource(); updateCounts(); wordCount(); runQc();
        }
      }
    });

    // write
    let qcT;
    const sched = () => { if (!S().autoQc) return; clearTimeout(qcT); qcT = setTimeout(runQc, 450); };
    $("generate").onclick = generate;
    $("copyPrompt").onclick = () => { const p = Prompt.build({ desk: ws.desk, topic: $("topic").value, author: S().author, minWords: +S().min, maxWords: +S().max, houseStyle: S().style, profile: profile(), grounded: grounded() }); copy(p.system + "\n\n" + p.user, "Prompt copied."); };
    $("md").addEventListener("input", () => { syncDocFromInputs(); wordCount(); sched(); });
    $("md").addEventListener("paste", () => setTimeout(() => applyFrontMatter($("md").value, false), 0));
    $("md").addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); runQc(); toast("QC re-run.", ""); } });
    FIELD_IDS.forEach((id) => $(id).addEventListener("input", () => { updateCounts(); syncDocFromInputs(); sched(); }));
    qsa(".seg-btn").forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
    qsa(".qc-bar .chip").forEach((b) => (b.onclick = () => { filter = b.dataset.filter; qsa(".qc-bar .chip").forEach((c) => c.classList.toggle("is-on", c === b)); renderReport(); }));
    $("recheck").onclick = () => { runQc(); toast("QC re-run.", ""); };
    $("aiReview").onclick = aiReview;
    $("tUrl").onclick = () => { $("urlInput").value = ""; $("urlDlg").returnValue = ""; $("urlDlg").showModal(); };
    $("urlDlg").addEventListener("close", () => { const u = $("urlInput").value.trim(); if ($("urlDlg").returnValue === "ok" && u) importUrl(u); });
    $("tFile").onclick = () => $("fileInput").click();
    $("fileInput").onchange = (e) => { const f = e.target.files[0]; if (f) importFile(f); e.target.value = ""; };
    $("tHtml").onclick = () => { $("htmlInput").value = ""; $("htmlDlg").returnValue = ""; $("htmlDlg").showModal(); };
    $("htmlDlg").addEventListener("close", () => { const h = $("htmlInput").value; if ($("htmlDlg").returnValue === "ok" && h.trim()) loadPage(h, "", "Pasted HTML"); });
    $("tSample").onclick = () => setDocText(SeedData.SAMPLE, "Sample article");
    $("tSave").onclick = saveToLibrary;
    $("tMore").onclick = (e) => { e.stopPropagation(); $("moreMenu").hidden = !$("moreMenu").hidden; };

    // batch
    $("batchRun").onclick = runBatch;
    $("batchCsv").onclick = () => download(`batch-qc-${new Date().toISOString().slice(0, 10)}.csv`, QC.toCsv(batchRows()), "text/csv");
    $("batchSheets").onclick = () => copy(tsv(batchRows()), "Report copied — paste into a Google Sheet.");

    // publications
    $("addPub").onclick = () => openPub(null);
    $("importRules").onclick = importRules;
    $("pubDlg").addEventListener("close", () => { if ($("pubDlg").returnValue === "save") { if (!savePub()) setTimeout(() => $("pubDlg").showModal(), 0); } });
    $("delPub").onclick = () => {
      const p = ws.profiles.find((x) => x.id === editingId);
      if (!p || !confirm(`Delete ${p.name}? Saved library items keep their content.`)) return;
      ws.profiles = ws.profiles.filter((x) => x.id !== editingId);
      if (SeedData.PROFILES.some((s) => s.id === editingId)) ws.deletedSeeds = (ws.deletedSeeds || []).concat(editingId);
      if (ws.activeProfile === editingId) ws.activeProfile = "house";
      save(); $("pubDlg").close("cancel"); renderPubSelect(); renderPubs();
    };
    $("pasteDlg").addEventListener("close", async () => {
      const text = $("pasteText").value.trim();
      if ($("pasteDlg").returnValue !== "ok" || text.length < 200) return;
      const btn = $("importRules");
      busy(btn, true, "Extracting…");
      try { applyExtracted(await extractRules(text, "pasted text")); }
      catch (e) { toast(e.message, "err"); }
      finally { busy(btn, false); }
    });

    // library
    $("libFilter").onchange = renderLibrary;
    $("libSearch").oninput = renderLibrary;
    $("libCsv").onclick = () => download("library.csv", QC.toCsv([["Title", "Publication", "Type", "Score", "Errors", "Warnings", "URL", "Saved"]].concat(ws.history.map((x) => [x.title, pubName(x.profileId), x.type, x.score, x.errors, x.warns, x.url, new Date(x.savedAt).toISOString()]))), "text/csv");

    // pulse
    qsa("#pulseFilters .chip").forEach((b) => (b.onclick = () => { pulseKind = b.dataset.k; qsa("#pulseFilters .chip").forEach((c) => c.classList.toggle("is-on", c === b)); loadPulse(false); }));
    $("pulseRefresh").onclick = () => { $("pulseList").innerHTML = '<li class="muted">Loading…</li>'; loadPulse(false, true); };

    // settings
    $("saveSettings").onclick = saveSettings;
    $("clearKeys").onclick = () => { ws.settings.keys = {}; ws.settings.access = ""; save({ silent: true }); renderSettings(); checkStatus(); toast("Saved keys cleared.", "ok"); };
    $("sProvider").addEventListener("focus", () => (shownProvider = $("sProvider").value));
    $("sProvider").onchange = () => { if (shownProvider) stashProviderFields(shownProvider); shownProvider = $("sProvider").value; renderProviderFields(); };
    $("loadModels").onclick = loadModels;
    $("syncPush").onclick = () => pushCloud(false);
    $("syncPull").onclick = () => pullCloud(false);
    $("wsExport").onclick = () => { const b = clone(ws); b.settings.keys = {}; b.settings.access = ""; download(`todays-news-workspace-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(b, null, 2), "application/json"); };
    $("wsImport").onclick = () => $("wsFile").click();
    $("wsFile").onchange = async (e) => {
      const f = e.target.files[0]; e.target.value = "";
      if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        if (!Array.isArray(data.profiles)) throw new Error();
        const keep = { keys: S().keys, access: S().access, theme: S().theme };
        ws = Object.assign(freshWorkspace(), data);
        ws.settings = Object.assign({}, DEFAULT_SETTINGS, data.settings, keep);
        save(); renderPubSelect(); route(); toast("Workspace imported.", "ok");
      } catch { toast("That file isn't a Today's News workspace.", "err"); }
    };
  }

  function init() {
    applyTheme(); tick(); setInterval(tick, 15000);
    renderPubSelect(); bind();
    checkStatus().then(() => pullCloud(true));
    route();
  }
  document.addEventListener("DOMContentLoaded", init);
})();
