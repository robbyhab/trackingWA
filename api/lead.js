"use strict";

/*
 * POST /api/lead — menyimpan lead dari landing page ke Supabase.
 * Env (diset di Vercel): SUPABASE_URL, SUPABASE_SERVICE_KEY, TENANT_ID
 * Service key hanya ada di server ini, tidak pernah dikirim ke browser.
 */

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const TENANT_ID = process.env.TENANT_ID;

const { normPhone } = require("../lib/phone");

const clip = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const orNull = (v) => v || null;

async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method" });
  }
  if (!SB_URL || !SB_KEY || !TENANT_ID) {
    console.error("lead: env SUPABASE_URL / SUPABASE_SERVICE_KEY / TENANT_ID belum lengkap");
    return res.status(500).json({ ok: false, error: "config" });
  }

  let b = req.body;
  if (typeof b === "string") {
    try { b = JSON.parse(b); } catch (e) { b = null; }
  }
  if (!b || typeof b !== "object") {
    return res.status(400).json({ ok: false, error: "body" });
  }

  const phone = normPhone(b.phone);
  if (!phone) return res.status(400).json({ ok: false, error: "phone" });

  const utm = b.utm && typeof b.utm === "object" ? b.utm : {};
  const ip = (String(req.headers["x-forwarded-for"] || "").split(",")[0].trim()) ||
    (req.socket && req.socket.remoteAddress) || "";

  const row = {
    tenant_id: TENANT_ID,
    name: orNull(clip(b.name, 80)),
    phone,
    ref_code: orNull(clip(b.ref, 12)),
    event_id: orNull(clip(b.event_id, 64)),
    fbclid: orNull(clip(b.fbclid, 500)),
    fbc: orNull(clip(b.fbc, 600)),
    fbp: orNull(clip(b.fbp, 200)),
    utm_source: orNull(clip(utm.source, 100)),
    utm_medium: orNull(clip(utm.medium, 100)),
    utm_campaign: orNull(clip(utm.campaign, 200)),
    utm_content: orNull(clip(utm.content, 200)),
    utm_term: orNull(clip(utm.term, 200)),
    ip: orNull(clip(ip, 64)),
    user_agent: orNull(clip(req.headers["user-agent"], 300)),
  };

  try {
    const r = await fetch(SB_URL.replace(/\/$/, "") + "/rest/v1/leads", {
      method: "POST",
      headers: {
        apikey: SB_KEY,
        Authorization: "Bearer " + SB_KEY,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(row),
    });
    if (!r.ok) {
      console.error("lead: supabase menolak", r.status, await r.text());
      return res.status(502).json({ ok: false, error: "db" });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("lead: gagal menghubungi supabase", e);
    return res.status(502).json({ ok: false, error: "db" });
  }
}

module.exports = handler;
module.exports.normPhone = normPhone;
