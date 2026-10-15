"use strict";

/*
 * Semua data dashboard lewat satu endpoint: /api/admin?a=<aksi>
 * GET : me, summary, daily, campaigns, leads, sales, products
 * POST: sale_add, sale_del, product_save, product_del   (body JSON, header Content-Type: application/json)
 * Tanggal (from, to) berformat YYYY-MM-DD dalam WIB; `to` ikut dihitung.
 */

const sb = require("../lib/sb");
const { normPhone } = require("../lib/phone");

const DAY = 86400000;
const WIB = "T00:00:00+07:00";
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + "T00:00:00Z"));
const fail = (res, code, error) => res.status(code).json({ ok: false, error });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const int = (v, d, min, max) => { const n = parseInt(v, 10); return isNaN(n) ? d : Math.min(max, Math.max(min, n)); };

// Ubah rentang tanggal WIB (inklusif) jadi batas waktu [from, to).
function range(q) {
  if (!isDate(q.from) || !isDate(q.to)) return null;
  const from = Date.parse(q.from + WIB);
  const to = Date.parse(q.to + WIB) + DAY;
  const days = Math.round((to - from) / DAY);
  if (days < 1 || days > 366) return null;
  return { from: new Date(from).toISOString(), to: new Date(to).toISOString(), days, fromMs: from };
}

const DB_ERRORS = {
  items_required: "Isi minimal satu produk.",
  items_too_many: "Terlalu banyak produk dalam satu penjualan.",
  qty_invalid: "Jumlah produk tidak valid.",
  price_invalid: "Harga tidak valid.",
  product_not_found: "Paket tidak ditemukan.",
  name_required: "Nama produk wajib diisi.",
};

async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!sb.configured()) return fail(res, 500, "config");

  const isPost = req.method === "POST";
  if (!isPost && req.method !== "GET") {
    res.setHeader("Allow", "GET, POST");
    return fail(res, 405, "method");
  }

  let body = null;
  if (isPost) {
    if (!/^application\/json/i.test(String(req.headers["content-type"] || ""))) return fail(res, 415, "type");
    body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = null; } }
    if (!body || typeof body !== "object") return fail(res, 400, "body");
  }

  try {
    const s = await sb.session(req, res);
    if (!s) return fail(res, 401, "login");
    const T = s.tenantId;
    const q = req.query || {};
    const a = String(q.a || "");

    if (!isPost) {
      if (a === "me") return res.status(200).json({ ok: true, email: s.email, role: s.role });

      if (a === "products") {
        const rows = await sb.rest("GET", "products?tenant_id=eq." + T + "&select=id,name,price,active&order=active.desc,name.asc&limit=500");
        return res.status(200).json({ ok: true, rows });
      }

      const r = range(q);
      if (!r) return fail(res, 400, "tanggal");

      if (a === "summary") {
        // Periode sebelumnya = rentang yang sama panjang tepat sebelum periode ini (untuk perbandingan).
        const prevFrom = new Date(r.fromMs - r.days * DAY).toISOString();
        const [cur, prev] = await Promise.all([
          sb.rpc("dash_summary", { p_tenant: T, p_from: r.from, p_to: r.to }),
          sb.rpc("dash_summary", { p_tenant: T, p_from: prevFrom, p_to: r.from }),
        ]);
        return res.status(200).json({ ok: true, cur, prev });
      }
      if (a === "daily") {
        const rows = await sb.rpc("dash_daily", { p_tenant: T, p_from: r.from, p_to: r.to });
        return res.status(200).json({ ok: true, rows });
      }
      if (a === "campaigns") {
        const by = q.by === "content" ? "content" : "campaign";
        const rows = await sb.rpc("dash_campaigns", { p_tenant: T, p_from: r.from, p_to: r.to, p_by: by });
        return res.status(200).json({ ok: true, rows });
      }
      if (a === "leads") {
        const f = ["all", "bought", "unbought"].includes(q.filter) ? q.filter : "all";
        const out = await sb.rpc("dash_leads", {
          p_tenant: T, p_from: r.from, p_to: r.to, p_q: String(q.q || "").slice(0, 80), p_filter: f,
          p_limit: int(q.limit, 20, 1, 100), p_offset: int(q.offset, 0, 0, 100000),
        });
        return res.status(200).json(Object.assign({ ok: true }, out));
      }
      if (a === "sales") {
        const out = await sb.rpc("dash_sales", {
          p_tenant: T, p_from: r.from, p_to: r.to, p_q: String(q.q || "").slice(0, 80),
          p_limit: int(q.limit, 20, 1, 100), p_offset: int(q.offset, 0, 0, 100000),
        });
        return res.status(200).json(Object.assign({ ok: true }, out));
      }
      return fail(res, 404, "aksi");
    }

    // ---- POST ----
    const owner = s.role === "owner";

    if (a === "sale_add") {
      const phone = normPhone(body.phone);
      if (!phone) return fail(res, 400, "Nomor WhatsApp tidak valid.");
      const items = Array.isArray(body.items) ? body.items.slice(0, 20).map((i) => ({
        product_id: typeof i.product_id === "string" && UUID.test(i.product_id) ? i.product_id : null,
        name: typeof i.name === "string" ? i.name.trim().slice(0, 120) : "",
        qty: Number(i.qty),
        unit_price: Number(i.unit_price),
      })) : [];
      for (const i of items) {
        if (!Number.isInteger(i.qty) || !Number.isFinite(i.unit_price)) return fail(res, 400, "Jumlah dan harga harus angka.");
      }
      let soldAt = new Date();
      if (body.sold_at) {
        soldAt = new Date(body.sold_at);
        if (isNaN(soldAt) || soldAt.getTime() > Date.now() + 5 * 60000) return fail(res, 400, "Waktu penjualan tidak valid.");
      }
      try {
        const out = await sb.rpc("sale_create", {
          p_tenant: T, p_user: s.userId, p_phone: phone,
          p_name: typeof body.customer_name === "string" ? body.customer_name.slice(0, 80) : null,
          p_items: items, p_sold_at: soldAt.toISOString(),
          p_note: typeof body.note === "string" ? body.note.slice(0, 300) : null,
        });
        return res.status(200).json(Object.assign({ ok: true }, out));
      } catch (e) {
        const key = Object.keys(DB_ERRORS).find((k) => String(e.message).includes(k));
        if (key) return fail(res, 400, DB_ERRORS[key]);
        throw e;
      }
    }

    if (a === "sale_del") {
      if (!owner) return fail(res, 403, "Hanya owner yang bisa menghapus penjualan.");
      if (!UUID.test(String(body.id || ""))) return fail(res, 400, "id");
      await sb.rest("DELETE", "sales?id=eq." + body.id + "&tenant_id=eq." + T);
      return res.status(200).json({ ok: true });
    }

    if (a === "product_save") {
      if (!owner) return fail(res, 403, "Hanya owner yang bisa mengubah paket.");
      const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
      const price = Number(body.price);
      if (!name) return fail(res, 400, "Nama paket wajib diisi.");
      if (!Number.isFinite(price) || price < 0 || price > 1e9) return fail(res, 400, "Harga tidak valid.");
      const row = { name, price: Math.round(price), active: body.active !== false };
      if (body.id) {
        if (!UUID.test(String(body.id))) return fail(res, 400, "id");
        await sb.rest("PATCH", "products?id=eq." + body.id + "&tenant_id=eq." + T, row);
      } else {
        await sb.rest("POST", "products", Object.assign({ tenant_id: T }, row));
      }
      return res.status(200).json({ ok: true });
    }

    if (a === "product_del") {
      if (!owner) return fail(res, 403, "Hanya owner yang bisa mengubah paket.");
      if (!UUID.test(String(body.id || ""))) return fail(res, 400, "id");
      // Riwayat penjualan tetap utuh (nama & harga sudah disalin ke sale_items).
      await sb.rest("DELETE", "products?id=eq." + body.id + "&tenant_id=eq." + T);
      return res.status(200).json({ ok: true });
    }

    return fail(res, 404, "aksi");
  } catch (e) {
    console.error("admin: error", e);
    return fail(res, 502, "db");
  }
}

module.exports = handler;
module.exports.range = range;
