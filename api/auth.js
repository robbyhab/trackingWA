"use strict";

/*
 * POST /api/auth  {email, password}  → login, set cookie sesi
 * POST /api/auth  {logout:true}      → hapus cookie
 * GET  /api/auth                     → siapa yang sedang login (atau 401)
 */

const sb = require("../lib/sb");

async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!sb.configured()) return res.status(500).json({ ok: false, error: "config" });

  if (req.method === "GET") {
    try {
      const s = await sb.session(req, res);
      if (!s) return res.status(401).json({ ok: false });
      return res.status(200).json({ ok: true, email: s.email, role: s.role });
    } catch (e) {
      console.error("auth: cek sesi gagal", e);
      return res.status(502).json({ ok: false, error: "db" });
    }
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "method" });
  }
  if (!/^application\/json/i.test(String(req.headers["content-type"] || ""))) {
    return res.status(415).json({ ok: false, error: "type" });
  }
  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = null; } }
  if (!b || typeof b !== "object") return res.status(400).json({ ok: false, error: "body" });

  if (b.logout) {
    sb.clearSession(res);
    return res.status(200).json({ ok: true });
  }

  const email = typeof b.email === "string" ? b.email.trim().slice(0, 200) : "";
  const password = typeof b.password === "string" ? b.password.slice(0, 200) : "";
  if (!email || !password) return res.status(400).json({ ok: false, error: "kosong" });

  try {
    const r = await sb.signIn(email, password);
    if (!r.ok || !r.body || !r.body.access_token) {
      const b = r.body || {};
      const detail = String(b.error_code || b.msg || b.message || b.error_description || b.error || ("http_" + r.status)).slice(0, 80);
      console.error("auth: supabase menolak login", r.status, detail);
      return res.status(401).json({ ok: false, error: "salah", detail });
    }
    sb.setSession(res, r.body);
    // Pastikan akun ini memang terdaftar sebagai anggota tenant.
    const s = await sb.session({ headers: { cookie: "sb_at=" + encodeURIComponent(r.body.access_token) } }, res);
    if (!s) { sb.clearSession(res); return res.status(403).json({ ok: false, error: "bukan_anggota" }); }
    return res.status(200).json({ ok: true, email: s.email, role: s.role });
  } catch (e) {
    console.error("auth: login gagal", e);
    return res.status(502).json({ ok: false, error: "db" });
  }
}

module.exports = handler;
