#!/usr/bin/env node
/**
 * ZEC Bounties access audit.
 *
 * API: plain HTTP (401/403 = private, 2xx/3xx/4xx-without-auth = public).
 * UI:  real Chromium via Playwright so client-side redirects to /login count.
 *
 * Usage:
 *   FRONTEND=http://localhost:3000 BACKEND=http://localhost:9001 node access-audit.mjs
 *
 * First run needs Playwright Chromium:
 *   npm i -D playwright && npx playwright install chromium
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FRONTEND = (process.env.FRONTEND || "http://localhost:3000").replace(/\/$/, "");
const BACKEND = (process.env.BACKEND || "http://localhost:9000").replace(/\/$/, "");
const OUT = process.argv.includes("--out")
  ? process.argv[process.argv.indexOf("--out") + 1]
  : resolve(process.cwd(), "access-audit.html");

const TIMEOUT_MS = 8000;
const UI_WAIT_MS = 2500;

const UI = [
  { path: "/", expected: "public", note: "Bounty board" },
  { path: "/login", expected: "public", note: "Login page" },
  { path: "/docs", expected: "public", note: "Docs overview" },
  { path: "/docs/getting-started", expected: "public" },
  { path: "/docs/addresses", expected: "public" },
  { path: "/docs/hunters", expected: "public" },
  { path: "/docs/teams", expected: "public" },
  { path: "/docs/contributors", expected: "public" },
  { path: "/docs/creators", expected: "public" },
  { path: "/docs/bounty-amounts", expected: "public" },
  { path: "/docs/privacy-payments", expected: "public" },
  { path: "/docs/api", expected: "public" },
  { path: "/docs/badges", expected: "public" },
  { path: "/docs/faq", expected: "public" },
  { path: "/docs/glossary", expected: "public" },
  { path: "/home", expected: "private", note: "Signed-in home" },
  { path: "/profile", expected: "private" },
  { path: "/my-bounties", expected: "private" },
  { path: "/teams", expected: "private" },
  { path: "/teams/profile", expected: "private" },
  { path: "/leaderboard", expected: "private", note: "UI page" },
  { path: "/kpis", expected: "private" },
  { path: "/explore", expected: "private" },
  { path: "/onboarding", expected: "private" },
  { path: "/admin", expected: "private" },
  { path: "/admin/dashboard", expected: "private" },
  { path: "/admin/kpis", expected: "private" },
  { path: "/users/test", expected: "private", note: "User profile page" },
];

const API = [
  { method: "GET", path: "/api/bounties", expected: "public", note: "Open board" },
  { method: "GET", path: "/api/bounties/categories", expected: "public" },
  { method: "GET", path: "/api/leaderboard", expected: "public", note: "Public ranks" },
  { method: "GET", path: "/api/users/test/public", expected: "public", note: "404 is still public access" },
  { method: "GET", path: "/api/teams/public", expected: "public", note: "Public team list" },
  { method: "GET", path: "/", expected: "public", note: "Backend health" },
  { method: "GET", path: "/auth/github", expected: "public", note: "Starts OAuth" },
  { method: "GET", path: "/auth/discord", expected: "public", note: "Starts Discord connect" },
  { method: "GET", path: "/auth/me", expected: "private" },
  { method: "GET", path: "/api/users/me/profile-settings", expected: "private" },
  { method: "GET", path: "/api/users/search?q=a", expected: "private" },
  { method: "GET", path: "/api/bounties/my-applications", expected: "private" },
  { method: "GET", path: "/api/bounties/my-submissions", expected: "private" },
  { method: "POST", path: "/api/bounties", expected: "private", body: {} },
  { method: "POST", path: "/api/bounties/apply", expected: "private", body: {} },
  { method: "GET", path: "/api/kpis/top-contributors", expected: "private" },
  { method: "GET", path: "/api/teams", expected: "private" },
  { method: "GET", path: "/api/teams/favorites", expected: "private" },
  { method: "GET", path: "/api/notifications", expected: "private" },
  { method: "GET", path: "/api/transactions", expected: "private", note: "Admin" },
  { method: "GET", path: "/api/transactions/balance", expected: "private", note: "Admin" },
  { method: "GET", path: "/api/zcash/info", expected: "private", note: "Admin" },
  { method: "GET", path: "/api/zcash/params/all", expected: "private", note: "Admin" },
];

function esc(s) {
  const amp = "&" + "amp;";
  const lt = "&" + "lt;";
  const gt = "&" + "gt;";
  const quot = "&" + "quot;";
  return String(s ?? "")
    .replace(/&/g, amp)
    .replace(/</g, lt)
    .replace(/>/g, gt)
    .replace(/"/g, quot);
}

async function probeHttp(url, { method = "GET", body } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method,
      redirect: "manual",
      signal: ctrl.signal,
      headers: body ? { "content-type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const ms = Date.now() - started;
    const loc = res.headers.get("location") || "";
    let snippet = "";
    try {
      snippet = (await res.text()).slice(0, 180).replace(/\s+/g, " ");
    } catch {
      snippet = "";
    }
    return { ok: true, status: res.status, location: loc, snippet, ms };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      location: "",
      snippet: String(err?.message || err),
      ms: Date.now() - started,
    };
  } finally {
    clearTimeout(t);
  }
}

function classifyAPI(result) {
  if (!result.ok) return { access: "error", reason: result.snippet };
  const status = result.status;
  if (status === 401 || status === 403) return { access: "private", reason: `HTTP ${status}` };
  if (status >= 200 && status < 300) return { access: "public", reason: `HTTP ${status}` };
  if (status >= 300 && status < 400) return { access: "public", reason: `redirect ${status}` };
  if (status === 400 || status === 404 || status === 405) {
    return { access: "public", reason: `HTTP ${status} (no auth required)` };
  }
  return { access: "error", reason: `HTTP ${status}` };
}

function classifyUI(requestedPath, finalUrl, bodyText) {
  const url = finalUrl || "";
  const body = (bodyText || "").toLowerCase();
  const onLogin = /\/login(?:$|\?|#)/i.test(url);
  // The login page itself is public. Landing on /login from anywhere else is a gate.
  if (onLogin && requestedPath !== "/login") {
    return { access: "private", reason: `browser landed on ${url}` };
  }
  if (onLogin) {
    return { access: "public", reason: "login page" };
  }
  if (body.includes("log in to start earning") || body.includes("login with github")) {
    return { access: "private", reason: "login shell rendered" };
  }
  return { access: "public", reason: `stayed on ${url}` };
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    console.error("Playwright is required for UI checks.");
    console.error("Install once:");
    console.error("  npm i -D playwright && npx playwright install chromium");
    process.exit(1);
  }
}

async function run() {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const uiResults = [];
  for (const item of UI) {
    const url = FRONTEND + item.path;
    const started = Date.now();
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });
      await page.waitForTimeout(UI_WAIT_MS);
      const finalUrl = page.url();
      const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 400) || "");
      const cls = classifyUI(item.path, finalUrl, bodyText);
      const match = item.expected === "either" || cls.access === item.expected ? "pass" : "fail";
      uiResults.push({
        ...item,
        url,
        status: 200,
        ms: Date.now() - started,
        location: finalUrl,
        snippet: bodyText.slice(0, 120),
        ...cls,
        match,
      });
    } catch (err) {
      uiResults.push({
        ...item,
        url,
        status: 0,
        ms: Date.now() - started,
        location: "",
        snippet: String(err?.message || err),
        access: "error",
        reason: String(err?.message || err),
        match: "fail",
      });
    }
  }
  await browser.close();

  const apiResults = [];
  for (const item of API) {
    const url = BACKEND + item.path;
    const raw = await probeHttp(url, { method: item.method, body: item.body });
    const cls = classifyAPI(raw);
    const match = item.expected === "either" || cls.access === item.expected ? "pass" : "fail";
    apiResults.push({ ...item, url, ...raw, ...cls, match });
  }

  const leakResults = await checkLeaks();

  const all = [...uiResults, ...apiResults, ...leakResults];
  const summary = {
    total: all.length,
    public: all.filter((r) => r.access === "public").length,
    private: all.filter((r) => r.access === "private").length,
    error: all.filter((r) => r.access === "error").length,
    fail: all.filter((r) => r.match === "fail").length,
    leaks: leakResults.filter((r) => r.match === "fail").length,
  };

  const html = renderHtml({ uiResults, apiResults, leakResults, summary });
  writeFileSync(OUT, html);
  console.log(`Wrote ${OUT}`);
  console.log(
    `UI ${uiResults.length} (browser) · API ${apiResults.length} (http) · leaks ${summary.leaks}/${leakResults.length} · public ${summary.public} · private ${summary.private} · error ${summary.error} · mismatch ${summary.fail}`,
  );
  if (summary.error) {
    console.log("Errors:");
    for (const r of all.filter((x) => x.access === "error")) {
      console.log(`  ${r.method || "GET"} ${r.url} — ${r.reason}`);
    }
  }
  if (summary.fail) {
    console.log("Mismatches / leaks:");
    for (const r of all.filter((x) => x.match === "fail")) {
      console.log(`  ${r.method || "GET"} ${r.path} expected ${r.expected} got ${r.access} (${r.reason})`);
    }
  }

  if (summary.error || summary.fail) {
    process.exit(1);
  }
}

async function fetchJson(path) {
  const res = await fetch(BACKEND + path, { redirect: "manual" });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* ignore */ }
  return { status: res.status, json };
}

function flagOn(profile, key) {
  const v = profile?.visibility?.[key];
  if (typeof v === "boolean") return v;
  // defaults from users.js: avatar + display name on, rest off
  if (key === "showAvatar" || key === "showDisplayName") return true;
  return false;
}

function checkUserFields(source, user, profile) {
  const leaks = [];
  if (!user) return leaks;
  const showName = flagOn(profile, "showDisplayName");
  const showAvatar = flagOn(profile, "showAvatar");
  if (!showName) {
    const name = user.name || "";
    if (name && name !== "Anonymous contributor") {
      leaks.push(`name leaked (${name})`);
    }
    if (user.nickname) leaks.push(`nickname leaked (${user.nickname})`);
  }
  if (!showAvatar && user.avatar) leaks.push("avatar leaked");
  return leaks;
}

function checkLeaderboardRow(row, profile) {
  const leaks = [];
  const showName = flagOn(profile, "showDisplayName");
  const showAvatar = flagOn(profile, "showAvatar");
  const showCompleted = flagOn(profile, "showCompleted");
  const showEarnings = flagOn(profile, "showEarnings");
  if (!showName) {
    const name = row.name || "";
    if (name && name !== "Anonymous contributor") leaks.push(`name leaked (${name})`);
    if (row.nickname) leaks.push(`nickname leaked (${row.nickname})`);
  }
  if (!showAvatar && row.avatar) leaks.push("avatar leaked");
  if (!showCompleted && typeof row.completed === "number") leaks.push(`completed leaked (${row.completed})`);
  if (!showEarnings && typeof row.earned === "number") leaks.push(`earned leaked (${row.earned})`);
  if ((!showCompleted || !showEarnings) && typeof row.points === "number") {
    leaks.push(`points leaked (${row.points})`);
  }
  return leaks;
}

async function checkLeaks() {
  const results = [];
  const profileCache = new Map();

  async function profileFor(id) {
    if (!id) return null;
    if (profileCache.has(id)) return profileCache.get(id);
    const { status, json } = await fetchJson(`/api/users/${encodeURIComponent(id)}/public`);
    const profile = status === 200 ? json : null;
    profileCache.set(id, profile);
    return profile;
  }

  // Leaderboard
  const lb = await fetchJson("/api/leaderboard?limit=25");
  const rows = Array.isArray(lb.json) ? lb.json : [];
  for (const row of rows) {
    const profile = await profileFor(row.id);
    if (!profile) {
      results.push({
        method: "GET",
        path: `/api/leaderboard → ${row.id}`,
        url: BACKEND + `/api/users/${row.id}/public`,
        note: "leaderboard row",
        expected: "redacted",
        status: 0,
        ms: 0,
        access: "error",
        reason: "no public profile",
        match: "fail",
      });
      continue;
    }
    const leaks = checkLeaderboardRow(row, profile);
    results.push({
      method: "GET",
      path: `/api/leaderboard → ${row.nickname || row.id}`,
      url: BACKEND + "/api/leaderboard",
      note: "leaderboard vs public profile",
      expected: "redacted",
      status: 200,
      ms: 0,
      access: leaks.length ? "public" : "private",
      reason: leaks.length ? leaks.join("; ") : "matches profile flags",
      match: leaks.length ? "fail" : "pass",
    });
  }

  // Bounty list user objects
  const bounties = await fetchJson("/api/bounties?limit=20");
  const list = Array.isArray(bounties.json?.data) ? bounties.json.data : [];
  const seen = new Set();
  for (const b of list) {
    for (const [label, user] of [
      ["createdByUser", b.createdByUser],
      ["assigneeUser", b.assigneeUser],
    ]) {
      if (!user?.id || seen.has(user.id + label)) continue;
      seen.add(user.id + label);
      const profile = await profileFor(user.id);
      if (!profile) continue;
      const leaks = checkUserFields(label, user, profile);
      results.push({
        method: "GET",
        path: `/api/bounties ${label} → ${user.nickname || user.id}`,
        url: BACKEND + "/api/bounties",
        note: "bounty list vs public profile",
        expected: "redacted",
        status: 200,
        ms: 0,
        access: leaks.length ? "public" : "private",
        reason: leaks.length ? leaks.join("; ") : "matches profile flags",
        match: leaks.length ? "fail" : "pass",
      });
    }
  }

  return results;
}

function badge(access) {
  if (access === "public") return `<span class="badge public">public</span>`;
  if (access === "private") return `<span class="badge private">private</span>`;
  return `<span class="badge error">error</span>`;
}

function row(r) {
  return `<tr class="${r.match}">
    <td>${badge(r.access)}</td>
    <td class="mono">${esc(r.method || "GET")}</td>
    <td class="mono"><a href="${esc(r.url)}">${esc(r.path)}</a></td>
    <td>${esc(r.note || "")}</td>
    <td>${esc(r.expected)}</td>
    <td>${r.status || "—"}</td>
    <td>${r.ms}ms</td>
    <td class="reason">${esc(r.reason)}</td>
    <td>${r.match === "pass" ? "ok" : "mismatch"}</td>
  </tr>`;
}

function renderHtml({ uiResults, apiResults, leakResults, summary }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>ZEC Bounties access audit</title>
<style>
  :root { color-scheme: dark; }
  body { font: 14px/1.4 ui-sans-serif, system-ui, sans-serif; margin: 24px; background: #0f1115; color: #e7e9ee; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .meta { color: #9aa3b2; margin-bottom: 16px; }
  .summary { display: flex; gap: 12px; margin: 12px 0 20px; flex-wrap: wrap; }
  .pill { padding: 6px 10px; border-radius: 999px; background: #1b1f27; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 28px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #242a33; vertical-align: top; }
  th { color: #9aa3b2; font-weight: 600; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
  a { color: #8ab4ff; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 700; }
  .badge.public { background: #7f1d1d; color: #fecaca; }
  .badge.private { background: #14532d; color: #bbf7d0; }
  .badge.error { background: #78350f; color: #fde68a; }
  tr.fail { background: #2a1a1a; }
  .reason { color: #b8c0cc; max-width: 420px; }
  h2 { font-size: 16px; margin: 24px 0 8px; }
</style>
</head>
<body>
  <h1>ZEC Bounties access audit</h1>
  <div class="meta">Frontend ${esc(FRONTEND)} · Backend ${esc(BACKEND)} · unauthenticated · UI via Chromium</div>
  <div class="summary">
    <div class="pill">total ${summary.total}</div>
    <div class="pill"><span class="badge public">public</span> ${summary.public}</div>
    <div class="pill"><span class="badge private">private</span> ${summary.private}</div>
    <div class="pill">error ${summary.error}</div>
    <div class="pill">mismatch ${summary.fail}</div>
    <div class="pill">leaks ${summary.leaks}</div>
  </div>
  <p class="meta">public = red · private = green · leak rows are highlighted</p>

  <h2>Privacy leaks (content)</h2>
  <table>
    <thead><tr><th>access</th><th>method</th><th>path</th><th>note</th><th>expected</th><th>status</th><th>time</th><th>reason</th><th></th></tr></thead>
    <tbody>${leakResults.map(row).join("")}</tbody>
  </table>

  <h2>UI pages (browser)</h2>
  <table>
    <thead><tr><th>access</th><th>method</th><th>path</th><th>note</th><th>expected</th><th>status</th><th>time</th><th>reason</th><th></th></tr></thead>
    <tbody>${uiResults.map(row).join("")}</tbody>
  </table>

  <h2>API endpoints (HTTP)</h2>
  <table>
    <thead><tr><th>access</th><th>method</th><th>path</th><th>note</th><th>expected</th><th>status</th><th>time</th><th>reason</th><th></th></tr></thead>
    <tbody>${apiResults.map(row).join("")}</tbody>
  </table>
</body>
</html>`;
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
