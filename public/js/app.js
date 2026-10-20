/* Today's News — UI controller.
 * Wires the generator, editor, SEO fields and the QC report together.
 */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const LS = {
    get(k, d) { try { const v = localStorage.getItem("tn:" + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("tn:" + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
    del(k) { try { localStorage.removeItem("tn:" + k); } catch { /* ignore */ } },
  };

  const state = {
    desk: LS.get("desk", "auto"),
    sources: LS.get("sources", []),
    filter: "issues",
    lastReport: null,
    busy: false,
  };

  const settings = Object.assign(
    { model: "gemini-2.5-flash", grounding: true, userKey: "", access: "", author: "", min: 600, max: 900, style: "", autoQc: true },
    LS.get("settings", {}),
  );

  // ---------- toast ----------
  let toastT;
  function toast(msg, kind) {
    const t = $("toast");
    t.textContent = msg;
    t.className = "toast show " + (kind || "");
    clearTimeout(toastT);
    toastT = setTimeout(() => (t.className = "toast"), 3200);
  }

  // ---------- header clock & brief ----------
  function tick() {
    const now = new Date();
    $("clock").textContent = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    $("session").textContent = Prompt.session(now).toUpperCase();
  }
  function brief() {
    const now = new Date();
    $("briefDate").textContent = now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
    $("briefEdition").textContent = Prompt.edition(now);
    $("briefAngle").textContent = Prompt.suggestedAngle(now);
  }

  async function checkStatus() {
    const pill = $("status");
    try {
      const r = await fetch("/api/status", { cache: "no-store" });
      if (!r.ok) throw new Error();
      const s = await r.json();
      if (s.gemini || settings.userKey) { pill.textContent = "Gemini ready"; pill.className = "pill pill-ok"; }
      else { pill.textContent = "No API key"; pill.className = "pill pill-err"; pill.title = "Add GEMINI_API_KEY in Netlify environment variables"; }
      if (s.accessCodeRequired && !settings.access) { pill.textContent = "Access code needed"; pill.className = "pill pill-warn"; }
    } catch {
      pill.textContent = "Offline mode — QC only"; pill.className = "pill pill-warn";
      pill.title = "The server functions aren't reachable (e.g. opened as a local file). QC still works.";
    }
  }

  // ---------- desks ----------
  function renderDesks() {
    const wrap = $("desks");
    wrap.innerHTML = "";
    Object.entries(Prompt.DESKS).forEach(([key, d]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip" + (key === state.desk ? " is-on" : "");
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", key === state.desk);
      b.textContent = d.label;
      b.onclick = () => { state.desk = key; LS.set("desk", key); renderDesks(); };
      wrap.appendChild(b);
    });
  }

  // ---------- prompt ----------
  function currentPrompt() {
    return Prompt.build({
      desk: state.desk, topic: $("topic").value, author: settings.author,
      minWords: +settings.min || 600, maxWords: +settings.max || 900, houseStyle: settings.style,
    });
  }

  // ---------- generate ----------
  async function generate() {
    if (state.busy) return;
    const p = currentPrompt();
    setBusy(true);
    try {
      const headers = { "content-type": "application/json" };
      if (settings.userKey) headers["x-user-gemini-key"] = settings.userKey;
      if (settings.access) headers["x-access-code"] = settings.access;
      const r = await fetch("/api/generate", {
        method: "POST", headers,
        body: JSON.stringify({ prompt: p.user, system: p.system, model: settings.model, grounding: settings.grounding }),
      });
      const data = await r.json().catch(() => ({ error: "Unexpected response from the server." }));
      if (!r.ok) throw new Error(data.error || "Generation failed.");

      const text = cleanModelOutput(data.text);
      $("md").value = text;
      state.sources = data.sources || [];
      LS.set("sources", state.sources);
      applyFrontMatter(text, true);
      renderSources();
      saveDraft();
      logWire(p.meta.desk, $("fTitle").value || firstHeading(text));
      runQc();
      if (!$("preview").hidden) renderPreview();
      toast("Article ready — check the QC report.", "ok");
    } catch (e) {
      toast(e.message || "Generation failed.", "err");
    } finally {
      setBusy(false);
    }
  }

  function cleanModelOutput(t) {
    return (t || "").replace(/^```(?:markdown|md)?\s*\n/i, "").replace(/\n```\s*$/i, "").trim() + "\n";
  }
  function firstHeading(md) { const m = md.match(/^#\s+(.+)$/m); return m ? m[1] : "Untitled"; }

  function setBusy(b) {
    state.busy = b;
    const btn = $("generate");
    btn.classList.toggle("is-busy", b);
    btn.disabled = b;
    btn.querySelector(".btn-label").textContent = b ? "Researching…" : "Generate";
  }

  // ---------- SEO fields ----------
  const FIELD_MAP = { title: "fTitle", meta_description: "fMeta", focus_keyword: "fKeyword", secondary_keywords: "fSecondary", slug: "fSlug" };
  function applyFrontMatter(md, overwrite) {
    const { fields } = QC.parseFrontMatter(md);
    Object.entries(FIELD_MAP).forEach(([k, id]) => {
      if (fields[k] && (overwrite || !$(id).value)) $(id).value = fields[k];
    });
    if (!fields.title && overwrite) {
      const h = md.match(/^#\s+(.+)$/m);
      if (h && !$("fTitle").value) $("fTitle").value = h[1];
    }
    updateCounts();
    saveFields();
  }
  function updateCounts() {
    document.querySelectorAll(".count").forEach((el) => {
      const n = $(el.dataset.for).value.length;
      el.textContent = n;
      const [lo, hi] = el.dataset.for === "fTitle" ? [30, 60] : [120, 160];
      el.className = "count " + (n === 0 ? "" : n < lo || n > hi ? "bad" : "good");
    });
  }
  function saveFields() {
    LS.set("fields", Object.fromEntries(["fTitle", "fMeta", "fKeyword", "fSecondary", "fSlug", "fType"].map((id) => [id, $(id).value])));
  }
  function loadFields() {
    const f = LS.get("fields", {});
    Object.entries(f).forEach(([id, v]) => { if ($(id)) $(id).value = v; });
    updateCounts();
  }

  // ---------- editor ----------
  function saveDraft() { LS.set("draft", $("md").value); }
  function wordCount() {
    const n = (QC.stripMarkdown($("md").value).match(/[A-Za-z0-9][A-Za-z0-9'’.%$-]*/g) || []).length;
    $("wordCount").textContent = n + (n === 1 ? " word" : " words");
  }
  function bodyHtml() {
    const { body } = QC.parseFrontMatter($("md").value);
    return DOMPurify.sanitize(marked.parse(body));
  }
  function renderPreview() { $("preview").innerHTML = bodyHtml(); }
  function setView(v) {
    document.querySelectorAll(".seg-btn").forEach((b) => {
      const on = b.dataset.view === v;
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-selected", on);
    });
    $("md").hidden = v !== "edit";
    $("preview").hidden = v !== "preview";
    if (v === "preview") renderPreview();
  }

  async function copyForDocs() {
    const html = bodyHtml();
    const text = QC.stripMarkdown($("md").value);
    try {
      if (window.ClipboardItem) {
        await navigator.clipboard.write([new ClipboardItem({
          "text/html": new Blob([`<meta charset="utf-8">${html}`], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        })]);
      } else {
        await navigator.clipboard.writeText(text);
      }
      toast("Copied — paste into Google Docs to keep formatting.", "ok");
    } catch {
      toast("Copy blocked by the browser. Use Preview, select all, and copy.", "err");
    }
  }
  async function copyText(t, msg) {
    try { await navigator.clipboard.writeText(t); toast(msg, "ok"); }
    catch { toast("Copy blocked by the browser.", "err"); }
  }

  // ---------- sources & log ----------
  function renderSources() {
    const ol = $("sources");
    ol.innerHTML = "";
    if (!state.sources.length) {
      ol.innerHTML = '<li class="muted">Live sources used for the article will show up here after you generate.</li>';
      return;
    }
    state.sources.forEach((s) => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = s.uri; a.target = "_blank"; a.rel = "noopener"; a.textContent = s.title || s.uri;
      li.appendChild(a);
      ol.appendChild(li);
    });
  }
  function weekKey(d) { const t = new Date(d); t.setHours(0, 0, 0, 0); t.setDate(t.getDate() - ((t.getDay() + 6) % 7)); return t.toISOString().slice(0, 10); }
  function logWire(desk, title) {
    const log = LS.get("log", []).filter((e) => weekKey(e.t) === weekKey(Date.now()));
    log.unshift({ t: Date.now(), desk, title });
    LS.set("log", log.slice(0, 30));
    renderLog();
  }
  function renderLog() {
    const log = LS.get("log", []).filter((e) => weekKey(e.t) === weekKey(Date.now()));
    const ul = $("wireLog");
    ul.innerHTML = "";
    if (!log.length) { ul.innerHTML = '<li class="muted">Nothing generated yet this week.</li>'; return; }
    log.forEach((e) => {
      const li = document.createElement("li");
      const time = new Date(e.t).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });
      li.innerHTML = `<span class="mono muted"></span> <span class="tag"></span> <span></span>`;
      li.children[0].textContent = time;
      li.children[1].textContent = e.desk;
      li.children[2].textContent = e.title;
      ul.appendChild(li);
    });
  }

  // ---------- QC ----------
  function runQc() {
    const report = QC.run({
      markdown: $("md").value,
      title: $("fTitle").value, meta: $("fMeta").value, keyword: $("fKeyword").value,
      secondary: $("fSecondary").value, slug: $("fSlug").value, contentType: $("fType").value,
      author: settings.author || QC.parseFrontMatter($("md").value).fields.author || "",
      sources: state.sources,
    });
    state.lastReport = report;
    renderReport();
  }

  function renderReport() {
    const r = state.lastReport;
    if (!r) return;
    const ring = $("ring");
    ring.style.setProperty("--v", r.score);
    ring.dataset.band = r.errors ? "bad" : r.score >= 85 ? "good" : r.score >= 70 ? "ok" : "bad";
    const empty = r.stats.wc < 30;
    if (empty) { ring.style.setProperty("--v", 0); ring.dataset.band = ""; }
    $("score").textContent = empty ? "—" : r.score;
    $("grade").textContent = empty ? "Waiting for an article" : r.grade;
    $("cErr").textContent = r.errors;
    $("cWarn").textContent = r.warns;
    $("cPass").textContent = r.passes;

    const list = $("findings");
    list.innerHTML = "";
    const shown = r.findings.filter((f) =>
      state.filter === "all" ? true : state.filter === "pass" ? f.severity === "pass" : f.severity !== "pass");
    if (!shown.length) {
      list.innerHTML = `<li class="empty">${state.filter === "pass" ? "Nothing has passed yet." : "No issues found. Nice work."}</li>`;
      return;
    }
    let lastCat = "";
    shown.forEach((f) => {
      if (f.category !== lastCat) {
        const h = document.createElement("li");
        h.className = "cat";
        h.textContent = f.category;
        list.appendChild(h);
        lastCat = f.category;
      }
      const li = document.createElement("li");
      li.className = "finding sev-" + f.severity + (f.match ? " jumpable" : "");
      li.innerHTML = `<span class="dot" aria-hidden="true"></span><div><p class="msg"></p><p class="fix"></p></div>`;
      li.querySelector(".msg").textContent = f.message;
      const fix = li.querySelector(".fix");
      if (f.fix) fix.textContent = f.fix; else fix.remove();
      if (f.ref) {
        const a = document.createElement("a");
        a.href = f.ref.url; a.target = "_blank"; a.rel = "noopener"; a.className = "ref"; a.textContent = f.ref.label + " ↗";
        a.onclick = (e) => e.stopPropagation();
        li.querySelector("div").appendChild(a);
      }
      if (f.match) {
        li.tabIndex = 0;
        li.title = "Jump to this in the editor";
        const go = () => jumpTo(f.match);
        li.onclick = go;
        li.onkeydown = (e) => { if (e.key === "Enter") go(); };
      }
      list.appendChild(li);
    });
  }

  function jumpTo(needle) {
    const ta = $("md");
    setView("edit");
    const hay = ta.value.toLowerCase();
    let i = hay.indexOf(needle.toLowerCase());
    if (i < 0) i = hay.indexOf(needle.toLowerCase().slice(0, 30));
    if (i < 0) { toast("Couldn't find that text in the editor.", ""); return; }
    ta.focus();
    ta.setSelectionRange(i, i + needle.length);
    const before = ta.value.slice(0, i).split("\n").length;
    const lh = parseFloat(getComputedStyle(ta).lineHeight) || 22;
    ta.scrollTop = Math.max(0, (before - 4) * lh);
    ta.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  async function aiReview() {
    const md = $("md").value.trim();
    if (md.length < 200) { toast("Write or generate an article first.", ""); return; }
    const out = $("aiOut");
    out.hidden = false;
    out.innerHTML = '<p class="muted">Asking Gemini for an editor\'s second opinion…</p>';
    const issues = (state.lastReport?.findings || []).filter((f) => f.severity !== "pass").map((f) => "- " + f.message).join("\n");
    const prompt = [
      "You are a strict news editor and SEO reviewer. Review the article below against Google's helpful content guidance, spam policies and YMYL standards for financial content.",
      "Return markdown with: a 1-line verdict; up to 6 specific problems (quote the exact sentence, explain why, give a rewritten version); and any factual claims that need verification.",
      "Do not repeat issues an automated checker already found:", issues || "- none",
      "", "ARTICLE:", md.slice(0, 40000),
    ].join("\n");
    try {
      const headers = { "content-type": "application/json" };
      if (settings.userKey) headers["x-user-gemini-key"] = settings.userKey;
      if (settings.access) headers["x-access-code"] = settings.access;
      const r = await fetch("/api/generate", { method: "POST", headers, body: JSON.stringify({ prompt, model: settings.model, grounding: false, temperature: 0.3 }) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "AI review failed.");
      out.innerHTML = '<h3>Editor\'s second opinion</h3>' + DOMPurify.sanitize(marked.parse(data.text));
    } catch (e) {
      out.innerHTML = "";
      out.hidden = true;
      toast(e.message, "err");
    }
  }

  // ---------- import ----------
  async function importUrl(url) {
    try {
      const headers = {};
      if (settings.access) headers["x-access-code"] = settings.access;
      const r = await fetch("/api/page?url=" + encodeURIComponent(url), { headers });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "Import failed.");
      const page = QC.fromHtml(data.html);
      $("md").value = page.markdown;
      $("fTitle").value = page.title;
      $("fMeta").value = page.meta;
      try { $("fSlug").value = new URL(data.finalUrl).pathname.replace(/^\/|\/$/g, ""); } catch { /* ignore */ }
      state.sources = [];
      LS.set("sources", []);
      renderSources();
      updateCounts(); saveFields(); saveDraft(); wordCount(); runQc();
      toast("Page imported. Set a focus keyword for full checks.", "ok");
    } catch (e) {
      toast(e.message, "err");
    }
  }

  // ---------- settings ----------
  function openSettings() {
    $("sModel").value = settings.model;
    $("sGrounding").checked = settings.grounding;
    $("sUserKey").value = settings.userKey;
    $("sAccess").value = settings.access;
    $("sAuthor").value = settings.author;
    $("sMin").value = settings.min;
    $("sMax").value = settings.max;
    $("sStyle").value = settings.style;
    $("sAutoQc").checked = settings.autoQc;
    $("settings").showModal();
  }
  function saveSettings() {
    Object.assign(settings, {
      model: $("sModel").value, grounding: $("sGrounding").checked, userKey: $("sUserKey").value.trim(),
      access: $("sAccess").value.trim(), author: $("sAuthor").value.trim(), min: +$("sMin").value || 600,
      max: +$("sMax").value || 900, style: $("sStyle").value, autoQc: $("sAutoQc").checked,
    });
    LS.set("settings", settings);
    checkStatus();
    runQc();
    toast("Settings saved.", "ok");
  }

  // ---------- wire up ----------
  let qcT;
  function scheduleQc() {
    if (!settings.autoQc) return;
    clearTimeout(qcT);
    qcT = setTimeout(runQc, 500);
  }

  function init() {
    brief(); tick(); setInterval(tick, 1000); renderDesks(); checkStatus();
    loadFields();
    $("md").value = LS.get("draft", "");
    renderSources(); renderLog(); wordCount(); runQc();

    $("generate").onclick = generate;
    $("copyPrompt").onclick = () => { const p = currentPrompt(); copyText(p.system + "\n\n" + p.user, "Prompt copied."); };
    $("md").addEventListener("input", () => { saveDraft(); wordCount(); scheduleQc(); });
    $("md").addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); runQc(); toast("QC re-run.", ""); } });
    $("md").addEventListener("paste", () => setTimeout(() => applyFrontMatter($("md").value, false), 0));
    ["fTitle", "fMeta", "fKeyword", "fSecondary", "fSlug", "fType"].forEach((id) =>
      $(id).addEventListener("input", () => { updateCounts(); saveFields(); scheduleQc(); }));
    document.querySelectorAll(".seg-btn").forEach((b) => (b.onclick = () => setView(b.dataset.view)));
    document.querySelectorAll(".filters .chip").forEach((b) => (b.onclick = () => {
      state.filter = b.dataset.filter;
      document.querySelectorAll(".filters .chip").forEach((c) => c.classList.toggle("is-on", c === b));
      renderReport();
    }));
    $("copyDocs").onclick = copyForDocs;
    $("copyMd").onclick = () => copyText($("md").value, "Markdown copied.");
    $("clear").onclick = () => {
      if (!confirm("Clear the article, SEO fields and sources?")) return;
      $("md").value = "";
      ["fTitle", "fMeta", "fKeyword", "fSecondary", "fSlug"].forEach((id) => ($(id).value = ""));
      state.sources = []; LS.set("sources", []);
      $("aiOut").hidden = true;
      saveDraft(); saveFields(); updateCounts(); renderSources(); wordCount(); runQc();
    };
    $("recheck").onclick = () => { runQc(); toast("QC re-run.", ""); };
    $("aiReview").onclick = aiReview;
    $("openSettings").onclick = openSettings;
    $("saveSettings").onclick = saveSettings;
    $("clearKeys").onclick = () => {
      settings.userKey = ""; settings.access = ""; LS.set("settings", settings);
      $("sUserKey").value = ""; $("sAccess").value = "";
      toast("Saved keys cleared.", "ok"); checkStatus();
    };
    $("importUrl").onclick = () => { $("importInput").value = ""; $("importDlg").showModal(); };
    $("doImport").onclick = (e) => {
      const u = $("importInput").value.trim();
      if (!u) { e.preventDefault(); return; }
      importUrl(u);
    };
  }

  document.addEventListener("DOMContentLoaded", init);
})();
