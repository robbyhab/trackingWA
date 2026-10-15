"use strict";

/*
 * Pembantu Supabase untuk dashboard.
 * Env: SUPABASE_URL, SUPABASE_SERVICE_KEY (rahasia, hanya server), SUPABASE_ANON_KEY (untuk login).
 * Sesi disimpan di cookie httpOnly — token tidak pernah terbaca oleh JavaScript di browser.
 */

const env = () => ({
  url: (process.env.SUPABASE_URL || "").replace(/\/$/, ""),
  svc: process.env.SUPABASE_SERVICE_KEY || "",
  anon: process.env.SUPABASE_ANON_KEY || "",
});

const configured = () => { const e = env(); return !!(e.url && e.svc && e.anon); };

function svcHeaders(extra) {
  const e = env();
  return Object.assign({ apikey: e.svc, Authorization: "Bearer " + e.svc, "Content-Type": "application/json" }, extra);
}

// Panggil fungsi SQL (rpc). Mengembalikan hasil JSON; melempar Error(pesan) jika database menolak.
async function rpc(fn, args) {
  const r = await fetch(env().url + "/rest/v1/rpc/" + fn, {
    method: "POST", headers: svcHeaders(), body: JSON.stringify(args),
  });
  const t = await r.text();
  let j = null;
  try { j = t ? JSON.parse(t) : null; } catch (e) { /* bukan JSON */ }
  if (!r.ok) {
    const err = new Error((j && j.message) || "db");
    err.status = r.status;
    throw err;
  }
  return j;
}

// Query tabel lewat PostgREST. path contoh: "products?tenant_id=eq.X&order=name".
async function rest(method, path, body, prefer) {
  const r = await fetch(env().url + "/rest/v1/" + path, {
    method, headers: svcHeaders(prefer ? { Prefer: prefer } : {}), body: body === undefined ? undefined : JSON.stringify(body),
  });
  const t = await r.text();
  let j = null;
  try { j = t ? JSON.parse(t) : null; } catch (e) { /* kosong */ }
  if (!r.ok) {
    const err = new Error((j && j.message) || "db");
    err.status = r.status;
    throw err;
  }
  return j;
}

async function authCall(path, method, headers, body) {
  const r = await fetch(env().url + "/auth/v1/" + path, {
    method, headers: Object.assign({ apikey: env().anon, "Content-Type": "application/json" }, headers),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let j = null;
  try { j = await r.json(); } catch (e) { /* kosong */ }
  return { ok: r.ok, status: r.status, body: j };
}

const signIn = (email, password) => authCall("token?grant_type=password", "POST", {}, { email, password });
const refresh = (token) => authCall("token?grant_type=refresh_token", "POST", {}, { refresh_token: token });
const getUser = (access) => authCall("user", "GET", { Authorization: "Bearer " + access });

// ---- cookie ----
function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || "").split(";").forEach((p) => {
    const i = p.indexOf("=");
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

function cookie(name, value, maxAge) {
  return name + "=" + encodeURIComponent(value) + "; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=" + maxAge;
}

function setSession(res, tokens) {
  res.setHeader("Set-Cookie", [
    cookie("sb_at", tokens.access_token, 3600),
    cookie("sb_rt", tokens.refresh_token, 60 * 60 * 24 * 30),
  ]);
}

function clearSession(res) {
  res.setHeader("Set-Cookie", [cookie("sb_at", "", 0), cookie("sb_rt", "", 0)]);
}

// Cari pengguna yang sedang login + tenant dan perannya. Return null jika belum login / bukan anggota.
async function session(req, res) {
  const c = parseCookies(req);
  let user = null;
  if (c.sb_at) {
    const u = await getUser(c.sb_at);
    if (u.ok && u.body && u.body.id) user = u.body;
  }
  if (!user && c.sb_rt) {
    const rr = await refresh(c.sb_rt);
    if (rr.ok && rr.body && rr.body.access_token) {
      setSession(res, rr.body);
      user = rr.body.user || null;
      if (!user) { const u = await getUser(rr.body.access_token); user = u.ok ? u.body : null; }
    }
  }
  if (!user || !user.id) return null;
  if (!/^[0-9a-f-]{36}$/i.test(user.id)) return null;
  const m = await rest("GET", "members?user_id=eq." + user.id + "&select=tenant_id,role&limit=1");
  if (!m || !m[0]) return null;
  return { userId: user.id, email: user.email || "", tenantId: m[0].tenant_id, role: m[0].role };
}

module.exports = { configured, rpc, rest, signIn, session, setSession, clearSession };
