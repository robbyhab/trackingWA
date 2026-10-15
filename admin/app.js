(function () {
"use strict";

/* ====================== util ====================== */
var app = document.getElementById("app");
var SVGNS = "http://www.w3.org/2000/svg";

function h(tag, attrs) {
  var el = document.createElement(tag);
  fill(el, attrs, arguments, 2);
  return el;
}
function sv(tag, attrs) {
  var el = document.createElementNS(SVGNS, tag);
  fill(el, attrs, arguments, 2);
  return el;
}
function fill(el, attrs, args, from) {
  if (attrs) {
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === "class") el.setAttribute("class", v);
      else if (k.slice(0, 2) === "on" && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (k === "value") el.value = v;
      else if (k === "checked" || k === "disabled" || k === "selected") el[k] = !!v;
      else el.setAttribute(k, v === true ? "" : String(v));
    });
  }
  for (var i = from; i < args.length; i++) add(el, args[i]);
}
function add(el, c) {
  if (c === null || c === undefined || c === false) return;
  if (Array.isArray(c)) { c.forEach(function (x) { add(el, x); }); return; }
  if (c.nodeType) el.appendChild(c);
  else el.appendChild(document.createTextNode(String(c)));
}
function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
function put(el) { clear(el); for (var i = 1; i < arguments.length; i++) add(el, arguments[i]); }

var nf = new Intl.NumberFormat("id-ID");
function num(n) { return nf.format(Math.round(Number(n) || 0)); }
function rp(n) { return "Rp " + num(n); }
function pct(n) { return (Math.round((Number(n) || 0) * 10) / 10).toString().replace(".", ",") + "%"; }
function compact(n) {
  var a = Math.abs(n), u = [[1e9, " M"], [1e6, " jt"], [1e3, " rb"]];
  for (var i = 0; i < u.length; i++) {
    if (a >= u[i][0]) return (Math.round(n / u[i][0] * 10) / 10).toString().replace(".", ",") + u[i][1];
  }
  return String(Math.round(n * 10) / 10).replace(".", ",");
}
var tzWhen = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
function when(iso) { return tzWhen.format(new Date(iso)); }
var MON = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
function dayLabel(s) { return parseInt(s.slice(8, 10), 10) + " " + MON[parseInt(s.slice(5, 7), 10) - 1]; }
function dmy(s) { return s.slice(8, 10) + "-" + s.slice(5, 7) + "-" + s.slice(0, 4); }
var tzDay = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jakarta" });
function todayWIB() { return tzDay.format(new Date()); }
function addDays(s, n) {
  var d = new Date(Date.parse(s + "T00:00:00Z") + n * 86400000);
  return d.toISOString().slice(0, 10);
}
function digits(s) { return String(s || "").replace(/\D/g, ""); }
function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* abaikan */ } }

/* ====================== api ====================== */
function qs(o) {
  return Object.keys(o).filter(function (k) { return o[k] !== undefined && o[k] !== ""; })
    .map(function (k) { return encodeURIComponent(k) + "=" + encodeURIComponent(o[k]); }).join("&");
}
function api(action, params, body) {
  var url = "/api/admin?" + qs(Object.assign({ a: action }, params || {}));
  var opt = { credentials: "same-origin" };
  if (body !== undefined) {
    opt.method = "POST";
    opt.headers = { "Content-Type": "application/json" };
    opt.body = JSON.stringify(body);
  }
  return fetch(url, opt).then(function (r) {
    return r.json().catch(function () { return { ok: false, error: "db" }; }).then(function (j) {
      if (r.status === 401) { showLogin(); throw new Error("login"); }
      if (!r.ok || !j.ok) { var e = new Error(typeof j.error === "string" ? j.error : "db"); e.api = true; throw e; }
      return j;
    });
  });
}
function errText(e) {
  if (e && e.api && e.message && e.message !== "db" && e.message !== "config") return e.message;
  return "Gagal memuat data. Coba lagi.";
}

/* ====================== state ====================== */
var role = "cs", email = "";
var range = { preset: "30d", from: "", to: "" };
var products = null;
var seq = 0;                       // untuk membuang respons lama
var refreshCurrent = function () {};

var PRESETS = [
  { k: "today", label: "Hari Ini" },
  { k: "yesterday", label: "Kemarin" },
  { k: "7d", label: "7 Hari Terakhir" },
  { k: "30d", label: "30 Hari Terakhir" },
  { k: "90d", label: "90 Hari Terakhir" },
  { k: "month", label: "Bulan Ini" }
];
function resolveRange() {
  var t = todayWIB(), p = range.preset;
  if (p === "today") { range.from = t; range.to = t; }
  else if (p === "yesterday") { range.from = range.to = addDays(t, -1); }
  else if (p === "7d") { range.from = addDays(t, -6); range.to = t; }
  else if (p === "30d") { range.from = addDays(t, -29); range.to = t; }
  else if (p === "90d") { range.from = addDays(t, -89); range.to = t; }
  else if (p === "month") { range.from = t.slice(0, 8) + "01"; range.to = t; }
  // "custom": from/to sudah diisi
}
function rangeLabel() {
  if (range.preset === "custom") return "Pilih tanggal";
  for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i].k === range.preset) return PRESETS[i].label;
  return "";
}
function rq() { resolveRange(); return { from: range.from, to: range.to }; }

/* ====================== toast & modal ====================== */
function toast(msg) {
  var t = h("div", { class: "toast", role: "status" }, msg);
  document.body.appendChild(t);
  setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 5000);
}

function modal(title, body, footer) {
  var opener = document.activeElement;
  var ov = h("div", { class: "ov" });
  var dlg = h("div", { class: "dlg", role: "dialog", "aria-modal": "true", "aria-label": title });
  var closeBtn = h("button", { class: "btn sm", type: "button", "aria-label": "Tutup" }, "✕");
  dlg.appendChild(h("div", { class: "hd" }, h("h2", null, title), closeBtn));
  dlg.appendChild(h("div", { class: "bd" }, body));
  if (footer) dlg.appendChild(h("div", { class: "ft" }, footer));
  ov.appendChild(dlg);
  function close() {
    document.removeEventListener("keydown", onKey, true);
    if (ov.parentNode) ov.parentNode.removeChild(ov);
    if (opener && opener.focus) opener.focus();
  }
  function onKey(e) {
    if (e.key === "Escape") { e.stopPropagation(); close(); return; }
    if (e.key !== "Tab") return;
    var f = dlg.querySelectorAll("button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea,a[href]");
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  closeBtn.addEventListener("click", close);
  ov.addEventListener("mousedown", function (e) { if (e.target === ov) close(); });
  document.addEventListener("keydown", onKey, true);
  document.body.appendChild(ov);
  var first = dlg.querySelector("input,select,textarea");
  if (first) first.focus(); else closeBtn.focus();
  return { close: close, dlg: dlg };
}

/* ====================== login ====================== */
function showLogin(note) {
  document.querySelectorAll(".ov,.toast").forEach(function (n) { n.parentNode.removeChild(n); });
  var err = h("p", { class: "err", role: "alert" }, note || "");
  var em = h("input", { class: "in", type: "email", id: "em", autocomplete: "username", required: true });
  var pw = h("input", { class: "in", type: "password", id: "pw", autocomplete: "current-password", required: true });
  var btn = h("button", { class: "btn pri", type: "submit" }, "Masuk");
  var form = h("form", { onsubmit: function (e) {
    e.preventDefault();
    btn.disabled = true; put(err, "");
    fetch("/api/auth", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: em.value, password: pw.value }) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { r: r, j: j }; }); })
      .then(function (x) {
        if (x.r.ok && x.j.ok) { role = x.j.role; email = x.j.email; showShell(); return; }
        btn.disabled = false;
        put(err, x.j.error === "salah" ? "Email atau password salah." :
          x.j.error === "bukan_anggota" ? "Akun ini belum didaftarkan sebagai anggota dashboard." :
          x.j.error === "config" ? "Server belum dikonfigurasi (cek environment variable di Vercel)." : "Gagal masuk. Coba lagi.");
      })
      .catch(function () { btn.disabled = false; put(err, "Tidak bisa terhubung ke server."); });
  } },
    h("div", { class: "fld" }, h("label", { for: "em" }, "Email"), em),
    h("div", { class: "fld" }, h("label", { for: "pw" }, "Password"), pw),
    btn, err);
  put(app, h("div", { class: "login" }, h("div", { class: "box" },
    h("h1", null, "Tracking WA"), h("p", { class: "hint" }, "Masuk untuk membuka dashboard."), form)));
  em.focus();
}

/* ====================== shell & router ====================== */
var NAV = [
  { g: "", items: [["beranda", "Beranda"]] },
  { g: "Pelanggan", items: [["lead", "Lead Masuk"], ["penjualan", "Penjualan"]] },
  { g: "Iklan", items: [["campaign", "Performa Campaign"]] },
  { g: "Pengaturan", items: [["paket", "Paket & Harga"]] }
];
var PAGES = { beranda: pageHome, lead: pageLeads, penjualan: pageSales, campaign: pageCampaigns, paket: pageProducts };
var TITLES = { beranda: "Beranda", lead: "Lead Masuk", penjualan: "Penjualan", campaign: "Performa Campaign", paket: "Paket & Harga" };
var GROUP = { lead: "Pelanggan", penjualan: "Pelanggan", campaign: "Iklan", paket: "Pengaturan" };
var contentEl = null, crumbEl = null, navEl = null;

function showShell() {
  var sel = lsGet("rangePreset");
  if (sel && (sel === "custom" ? false : PRESETS.some(function (p) { return p.k === sel; }))) range.preset = sel;
  navEl = h("nav", { class: "nav", "aria-label": "Menu utama" });
  NAV.forEach(function (g) {
    if (g.g) navEl.appendChild(h("div", { class: "grp" }, g.g));
    g.items.forEach(function (it) { navEl.appendChild(h("a", { href: "#/" + it[0], "data-p": it[0] }, it[1])); });
  });
  crumbEl = h("div", { class: "crumb" });
  contentEl = h("main", { class: "content" });
  put(app, h("div", { class: "shell" },
    h("aside", { class: "side" }, h("div", { class: "brand" }, h("i", { "aria-hidden": "true" }, "W"), "Tracking WA"), navEl),
    h("div", { class: "main" },
      h("header", { class: "top" }, crumbEl,
        h("span", { class: "who", title: email }, email + (role === "owner" ? " · owner" : " · CS")),
        h("button", { class: "btn sm", type: "button", onclick: logout }, "Keluar")),
      contentEl)));
  route();
}

function logout() {
  fetch("/api/auth", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ logout: true }) })
    .then(function () { products = null; showLogin(); }, function () { showLogin(); });
}

function route() {
  if (!contentEl) return;
  var p = (location.hash.match(/^#\/(\w+)/) || [])[1];
  if (!PAGES[p]) p = "beranda";
  navEl.querySelectorAll("a").forEach(function (a) {
    if (a.getAttribute("data-p") === p) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  put(crumbEl, "Tracking WA / ", GROUP[p] ? GROUP[p] + " / " : "", h("b", null, TITLES[p]));
  document.title = TITLES[p] + " · Tracking WA";
  seq++;
  refreshCurrent = function () {};
  clear(contentEl);
  PAGES[p]();
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);

/* ====================== date range picker ====================== */
function rangePicker(onChange) {
  var wrap = h("div", { class: "range" });
  var btn = h("button", { class: "btn", type: "button", "aria-haspopup": "true", "aria-expanded": "false" });
  var menu = null;
  function paint() {
    resolveRange();
    put(btn, h("b", null, rangeLabel() + " (GMT+7)"), h("span", { class: "hint" }, dmy(range.from) + " - " + dmy(range.to)), "▾");
  }
  function close() { if (menu) { menu.parentNode.removeChild(menu); menu = null; btn.setAttribute("aria-expanded", "false"); document.removeEventListener("mousedown", outside, true); document.removeEventListener("keydown", esc, true); } }
  function outside(e) { if (menu && !wrap.contains(e.target)) close(); }
  function esc(e) { if (e.key === "Escape") { close(); btn.focus(); } }
  function pick(k) { range.preset = k; if (k !== "custom") lsSet("rangePreset", k); paint(); close(); onChange(); }
  function open() {
    var rows = PRESETS.map(function (p) {
      return h("button", { class: "row", type: "button", role: "menuitemradio", "aria-checked": String(range.preset === p.k), onclick: function () { pick(p.k); } },
        h("span", { class: "ck", "aria-hidden": "true" }, range.preset === p.k ? "✓" : ""), p.label);
    });
    var f = h("input", { class: "in", type: "date", value: range.from, "aria-label": "Dari tanggal", max: todayWIB() });
    var t = h("input", { class: "in", type: "date", value: range.to, "aria-label": "Sampai tanggal", max: todayWIB() });
    var msg = h("div", { class: "err" });
    var apply = h("button", { class: "btn pri sm", type: "button", onclick: function () {
      if (!f.value || !t.value) { put(msg, "Isi kedua tanggal."); return; }
      if (f.value > t.value) { put(msg, "Tanggal awal harus sebelum tanggal akhir."); return; }
      if ((Date.parse(t.value) - Date.parse(f.value)) / 86400000 > 365) { put(msg, "Maksimal 366 hari."); return; }
      range.from = f.value; range.to = t.value; pick("custom");
    } }, "Terapkan");
    menu = h("div", { class: "menu", role: "menu" }, rows,
      h("div", { class: "foot" }, h("div", { class: "hint" }, "Pilih tanggal"), h("div", { class: "two" }, f, t), msg, apply));
    wrap.appendChild(menu);
    btn.setAttribute("aria-expanded", "true");
    document.addEventListener("mousedown", outside, true);
    document.addEventListener("keydown", esc, true);
  }
  btn.addEventListener("click", function () { if (menu) close(); else open(); });
  paint();
  wrap.appendChild(btn);
  return wrap;
}

/* ====================== beranda ====================== */
var KPIS = [
  { k: "leads", l: "Lead Masuk", get: function (s) { return s.leads; }, day: function (d) { return d.leads; }, fmt: num },
  { k: "buyers", l: "Pembeli", get: function (s) { return s.buyers; }, day: function (d) { return d.buyers; }, fmt: num },
  { k: "orders", l: "Pesanan", get: function (s) { return s.orders; }, day: function (d) { return d.orders; }, fmt: num },
  { k: "items", l: "Produk Terjual", get: function (s) { return s.items; }, day: function (d) { return d.items; }, fmt: num },
  { k: "gmv", l: "GMV", get: function (s) { return s.gmv; }, day: function (d) { return d.gmv; }, fmt: rp, axis: compact },
  { k: "conv", l: "Konversi (pembeli ÷ lead)", get: function (s) { return s.leads ? s.buyers / s.leads * 100 : 0; }, day: function (d) { return d.leads ? d.buyers / d.leads * 100 : 0; }, fmt: pct, axis: function (n) { return Math.round(n) + "%"; } },
  { k: "aov", l: "Rata-rata Nilai Order", get: function (s) { return s.orders ? s.gmv / s.orders : 0; }, day: function (d) { return d.orders ? d.gmv / d.orders : 0; }, fmt: rp, axis: compact },
  { k: "unb", l: "Lead Belum Pernah Beli", get: function (s) { return s.leads_unbought; }, fmt: num, plain: true }
];
var metric = "leads";

function delta(cur, prev) {
  if (!prev && !cur) return h("span", null, "– ", "sama");
  if (!prev) return h("span", { class: "up" }, "▲ baru");
  var p = (cur - prev) / prev * 100;
  if (Math.abs(p) < 0.05) return h("span", null, "– 0%");
  return p > 0 ? h("span", { class: "up" }, "▲ " + pct(p)) : h("span", { class: "dn" }, "▼ " + pct(Math.abs(p)));
}

function pageHome() {
  var kpiBox = h("div", { class: "kpis" });
  var chartTitle = h("h2");
  var chartBox = h("div", { class: "chart" });
  var view = "grafik";
  var segG = h("button", { type: "button", "aria-pressed": "true" }, "Grafik");
  var segT = h("button", { type: "button", "aria-pressed": "false" }, "Tabel");
  var campBody = h("div", { class: "tbl" });
  var leadBody = h("div", { class: "tbl" });
  var hint = h("span", { class: "hint" });
  var data = { sum: null, daily: null };

  function setView(v) { view = v; segG.setAttribute("aria-pressed", String(v === "grafik")); segT.setAttribute("aria-pressed", String(v === "tabel")); drawChartArea(); }
  segG.addEventListener("click", function () { setView("grafik"); });
  segT.addEventListener("click", function () { setView("tabel"); });

  function drawKpis() {
    clear(kpiBox);
    if (!data.sum) return;
    KPIS.forEach(function (m) {
      var cur = m.get(data.sum.cur), prev = m.get(data.sum.prev);
      var attrs = { class: "kpi" + (m.k === metric ? " sel" : ""), type: "button" };
      if (!m.plain) { attrs["data-m"] = m.k; attrs["aria-pressed"] = String(m.k === metric); attrs.onclick = function () { metric = m.k; drawKpis(); drawChartArea(); }; }
      else attrs.disabled = true;
      var b = h("button", attrs, h("div", { class: "l" }, m.l), h("div", { class: "v" }, m.fmt(cur)),
        h("div", { class: "d" }, m.plain ? "Belum ada pembelian dari nomor ini" : ["vs periode lalu ", delta(cur, prev)]));
      if (m.plain) b.removeAttribute("data-m");
      kpiBox.appendChild(b);
    });
  }
  function curMetric() { return KPIS.filter(function (m) { return m.k === metric; })[0]; }
  function drawChartArea() {
    var m = curMetric();
    put(chartTitle, m.l);
    if (!data.daily) return;
    var pts = data.daily.map(function (d) { return { day: d.day, v: m.day(d) }; });
    if (view === "grafik") drawChart(chartBox, pts, m); else drawTable(chartBox, pts, m);
  }
  function drawCamps(rows) {
    var top = rows.filter(function (r) { return r.gmv > 0 || r.leads > 0; }).slice(0, 5);
    if (!top.length) { put(campBody, h("div", { class: "empty" }, "Belum ada data campaign pada periode ini.")); return; }
    put(campBody, h("table", null,
      h("thead", null, h("tr", null, h("th", null, "Campaign"), h("th", { class: "r" }, "Lead"), h("th", { class: "r" }, "Pembeli"), h("th", { class: "r" }, "GMV"))),
      h("tbody", null, top.map(function (r) {
        return h("tr", null, h("td", null, r.name), h("td", { class: "r" }, num(r.leads)), h("td", { class: "r" }, num(r.buyers)), h("td", { class: "r" }, rp(r.gmv)));
      }))));
  }
  function drawLeads(out) {
    if (!out.rows.length) { put(leadBody, h("div", { class: "empty" }, "Semua lead pada periode ini sudah beli, atau belum ada lead.")); return; }
    put(leadBody, h("table", null,
      h("thead", null, h("tr", null, h("th", null, "Lead"), h("th", null, "Masuk"), h("th", null, "Aksi"))),
      h("tbody", null, out.rows.map(function (r) {
        return h("tr", null,
          h("td", null, h("div", null, r.name || "(tanpa nama)"), h("div", { class: "sub num" }, r.phone)),
          h("td", { class: "sub" }, when(r.last_at)),
          h("td", null, leadActions(r)));
      }))));
  }
  function load() {
    var my = ++seq, q = rq();
    hint.textContent = "Data " + dmy(q.from) + " s/d " + dmy(q.to) + ", dibandingkan dengan periode sebelumnya yang sama panjang.";
    [chartBox, campBody, leadBody, kpiBox].forEach(function (n) { n.classList.add("loading"); });
    Promise.all([
      api("summary", q), api("daily", q), api("campaigns", Object.assign({ by: "campaign" }, q)),
      api("leads", Object.assign({ filter: "unbought", limit: 5 }, q))
    ]).then(function (r) {
      if (my !== seq) return;
      data.sum = r[0]; data.daily = r[1].rows;
      drawKpis(); drawChartArea(); drawCamps(r[2].rows); drawLeads(r[3]);
    }).catch(function (e) {
      if (my !== seq || e.message === "login") return;
      var m = h("div", { class: "empty", role: "alert" }, errText(e));
      put(chartBox, m);
    }).then(function () {
      if (my !== seq) return;
      [chartBox, campBody, leadBody, kpiBox].forEach(function (n) { n.classList.remove("loading"); });
    });
  }
  refreshCurrent = load;

  contentEl.appendChild(h("h1", null, "Beranda"));
  contentEl.appendChild(h("div", { class: "bar" }, rangePicker(load), h("div", { class: "sp" }),
    h("button", { class: "btn pri", type: "button", onclick: function () { openSale(); } }, "+ Catat Penjualan")));
  contentEl.appendChild(h("section", { class: "card", "aria-label": "Ringkasan" },
    h("div", { class: "hd" }, h("h2", null, "Ringkasan"), hint), kpiBox));
  contentEl.appendChild(h("section", { class: "card", "aria-label": "Tren" },
    h("div", { class: "hd" }, chartTitle, h("div", { class: "sp" }), h("div", { class: "seg" }, segG, segT)),
    h("div", { class: "bd" }, chartBox)));
  contentEl.appendChild(h("div", { class: "two" },
    h("section", { class: "card" }, h("div", { class: "hd" }, h("h2", null, "Campaign Teratas"), h("div", { class: "sp" }), h("a", { href: "#/campaign" }, "Lihat semua")), campBody),
    h("section", { class: "card" }, h("div", { class: "hd" }, h("h2", null, "Lead Belum Beli"), h("div", { class: "sp" }), h("a", { href: "#/lead" }, "Lihat semua")), leadBody)));
  load();
}

/* ====================== grafik ====================== */
function niceMax(v) {
  if (v <= 0) return 4;
  var e = Math.pow(10, Math.floor(Math.log(v) / Math.LN10)), f = v / e;
  var n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 4 ? 4 : f <= 5 ? 5 : f <= 8 ? 8 : 10;
  return n * e;
}

function drawChart(box, pts, m) {
  clear(box);
  var narrow = box.clientWidth > 0 && box.clientWidth < 520;
  var W = narrow ? 400 : 800, H = narrow ? 260 : 280, ml = narrow ? 48 : 56, mr = 24, mt = 16, mb = 30;
  var pw = W - ml - mr, ph = H - mt - mb, n = pts.length;
  var max = niceMax(Math.max.apply(null, pts.map(function (p) { return p.v; }).concat([0])));
  var fmt = m.axis || num;
  function X(i) { return n === 1 ? ml + pw / 2 : ml + pw * i / (n - 1); }
  function Y(v) { return mt + ph - ph * v / max; }
  var svg = sv("svg", { viewBox: "0 0 " + W + " " + H, role: "img", tabindex: "0",
    "aria-label": m.l + " per hari. Gunakan panah kiri/kanan untuk membaca nilai, atau lihat tampilan Tabel." });
  for (var i = 0; i <= 4; i++) {
    var gv = max * i / 4, gy = Y(gv);
    svg.appendChild(sv("line", { class: i === 0 ? "axis" : "grid", x1: ml, x2: W - mr, y1: gy, y2: gy }));
    svg.appendChild(sv("text", { x: ml - 8, y: gy + 4, "text-anchor": "end" }, fmt(gv)));
  }
  var step = Math.max(1, Math.ceil(n / (narrow ? 4 : 6)));
  pts.forEach(function (p, i) {
    if (i % step !== 0 && i !== n - 1) return;
    if (i !== n - 1 && n - 1 - i < step * 0.6) return;
    svg.appendChild(sv("text", { x: X(i), y: H - 8, "text-anchor": i === 0 && n > 1 ? "start" : i === n - 1 && n > 1 ? "end" : "middle" }, dayLabel(p.day)));
  });
  var d = pts.map(function (p, i) { return (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(p.v).toFixed(1); }).join(" ");
  svg.appendChild(sv("path", { class: "area", d: d + " L" + X(n - 1).toFixed(1) + " " + Y(0) + " L" + X(0).toFixed(1) + " " + Y(0) + " Z" }));
  svg.appendChild(sv("path", { class: "ln", d: d }));
  var last = pts[n - 1];
  svg.appendChild(sv("circle", { class: "dot", cx: X(n - 1), cy: Y(last.v), r: 4 }));
  svg.appendChild(sv("text", { x: X(n - 1), y: Y(last.v) - 10, "text-anchor": n > 1 ? "end" : "middle", style: null }, fmt(last.v)));
  var cross = sv("line", { class: "xh", y1: mt, y2: mt + ph, x1: 0, x2: 0, visibility: "hidden" });
  var hot = sv("circle", { class: "dot", r: 4, cx: 0, cy: 0, visibility: "hidden" });
  svg.appendChild(cross); svg.appendChild(hot);
  var tip = h("div", { class: "tip", hidden: true, role: "status" });
  box.appendChild(svg); box.appendChild(tip);

  function show(i) {
    var p = pts[i], r = svg.getBoundingClientRect(), k = r.width / W;
    cross.setAttribute("x1", X(i)); cross.setAttribute("x2", X(i)); cross.setAttribute("visibility", "visible");
    hot.setAttribute("cx", X(i)); hot.setAttribute("cy", Y(p.v)); hot.setAttribute("visibility", "visible");
    put(tip, h("div", { class: "tv" }, h("i"), m.fmt(p.v)), h("div", { class: "tl" }, dayLabel(p.day)));
    tip.hidden = false;
    var tx = X(i) * k + 12;
    if (tx + tip.offsetWidth > r.width) tx = X(i) * k - tip.offsetWidth - 12;
    tip.style.left = Math.max(0, tx) + "px";
    tip.style.top = Math.max(0, Y(p.v) * k - 44) + "px";
  }
  function hide() { cross.setAttribute("visibility", "hidden"); hot.setAttribute("visibility", "hidden"); tip.hidden = true; }
  var cur = n - 1;
  svg.addEventListener("pointermove", function (e) {
    var r = svg.getBoundingClientRect();
    var x = (e.clientX - r.left) * (W / (r.width || W));
    var i = n === 1 ? 0 : Math.round((x - ml) / pw * (n - 1));
    cur = Math.max(0, Math.min(n - 1, i));
    show(cur);
  });
  svg.addEventListener("pointerleave", hide);
  svg.addEventListener("blur", hide);
  svg.addEventListener("keydown", function (e) {
    if (e.key === "ArrowLeft") { cur = Math.max(0, cur - 1); show(cur); e.preventDefault(); }
    else if (e.key === "ArrowRight") { cur = Math.min(n - 1, cur + 1); show(cur); e.preventDefault(); }
    else if (e.key === "Escape") hide();
  });
}

function drawTable(box, pts, m) {
  clear(box);
  box.appendChild(h("div", { class: "tbl" }, h("table", null,
    h("thead", null, h("tr", null, h("th", null, "Tanggal"), h("th", { class: "r" }, m.l))),
    h("tbody", null, pts.slice().reverse().map(function (p) {
      return h("tr", null, h("td", null, dmy(p.day)), h("td", { class: "r" }, m.fmt(p.v)));
    })))));
}

/* ====================== daftar generik ====================== */
function leadActions(r) {
  var ph = digits(r.phone);
  return h("div", { class: "acts" },
    h("a", { class: "btn sm", href: "https://wa.me/" + ph, target: "_blank", rel: "noopener noreferrer" }, "Chat WA"),
    h("button", { class: "btn sm", type: "button", onclick: function () { openSale({ phone: r.phone, name: r.name }); } }, "Catat beli"));
}

// cfg: {action, tabs, searchLabel, head, row, empty, extra}
function listPage(cfg) {
  var st = { q: "", filter: cfg.tabs ? cfg.tabs[0][0] : undefined, offset: 0, limit: 20 };
  var body = h("div", { class: "tbl" });
  var pgBox = h("div", { class: "pg" });
  var timer = null;
  var tabsEl = null;
  if (cfg.tabs) {
    tabsEl = h("div", { class: "tabs", role: "tablist" }, cfg.tabs.map(function (t) {
      return h("button", { type: "button", role: "tab", "aria-selected": String(t[0] === st.filter), "data-t": t[0], onclick: function () {
        st.filter = t[0]; st.offset = 0;
        tabsEl.querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-selected", String(b.getAttribute("data-t") === st.filter)); });
        load();
      } }, t[1]);
    }));
  }
  var search = h("input", { class: "in", type: "search", placeholder: cfg.searchLabel, "aria-label": cfg.searchLabel, style: null,
    oninput: function () { clearTimeout(timer); timer = setTimeout(function () { st.q = search.value; st.offset = 0; load(); }, 300); } });
  var prev = h("button", { class: "btn sm", type: "button" }, "‹ Sebelumnya");
  var next = h("button", { class: "btn sm", type: "button" }, "Berikutnya ›");
  var info = h("span", { class: "hint" });
  pgBox.appendChild(info); pgBox.appendChild(prev); pgBox.appendChild(next);
  prev.addEventListener("click", function () { st.offset = Math.max(0, st.offset - st.limit); load(); });
  next.addEventListener("click", function () { st.offset += st.limit; load(); });

  function load() {
    var my = ++seq;
    body.classList.add("loading");
    api(cfg.action, Object.assign(rq(), { q: st.q, filter: st.filter, limit: st.limit, offset: st.offset })).then(function (out) {
      if (my !== seq) return;
      if (!out.rows.length) put(body, h("div", { class: "empty" }, st.q ? "Tidak ada hasil untuk pencarian ini." : cfg.empty));
      else put(body, h("table", null, h("thead", null, h("tr", null, cfg.head.map(function (c) { return h("th", { class: c[1] || "" }, c[0]); }))),
        h("tbody", null, out.rows.map(function (r) { return cfg.row(r); }))));
      var from = out.total ? st.offset + 1 : 0, to = Math.min(out.total, st.offset + out.rows.length);
      put(info, from + "–" + to + " dari " + num(out.total));
      prev.disabled = st.offset === 0; next.disabled = to >= out.total;
      pgBox.hidden = out.total <= st.limit;
    }).catch(function (e) {
      if (my !== seq || e.message === "login") return;
      put(body, h("div", { class: "empty", role: "alert" }, errText(e)));
    }).then(function () { if (my === seq) body.classList.remove("loading"); });
  }
  refreshCurrent = load;
  contentEl.appendChild(h("h1", null, cfg.title));
  contentEl.appendChild(h("div", { class: "bar" }, rangePicker(function () { st.offset = 0; load(); }), h("div", { class: "sp" }),
    h("button", { class: "btn pri", type: "button", onclick: function () { openSale(); } }, "+ Catat Penjualan")));
  contentEl.appendChild(h("section", { class: "card" }, tabsEl, h("div", { class: "bd" }, search), body, pgBox));
  load();
}

function pageLeads() {
  listPage({
    title: "Lead Masuk", action: "leads", searchLabel: "Cari nama, nomor, atau kode ref",
    tabs: [["all", "Semua"], ["unbought", "Belum Beli"], ["bought", "Sudah Beli"]],
    empty: "Belum ada lead pada periode ini.",
    head: [["Lead"], ["Kode Ref"], ["Sumber Iklan"], ["Masuk Terakhir"], ["Status"], ["Aksi"]],
    row: function (r) {
      return h("tr", null,
        h("td", null, h("div", null, r.name || "(tanpa nama)"), h("div", { class: "sub num" }, r.phone)),
        h("td", { class: "num" }, r.ref_code || "–"),
        h("td", null, h("div", null, r.utm_campaign || "(tanpa campaign)"), h("div", { class: "sub" }, r.utm_content || "")),
        h("td", null, h("div", null, when(r.last_at)), r.submits > 1 ? h("div", { class: "sub" }, r.submits + "× submit") : null),
        h("td", null, r.bought ? h("span", { class: "badge ok" }, "✓ Sudah beli · " + rp(r.spent)) : h("span", { class: "badge no" }, "● Belum beli")),
        h("td", null, leadActions(r)));
    }
  });
}

function pageSales() {
  listPage({
    title: "Penjualan", action: "sales", searchLabel: "Cari nama atau nomor",
    empty: "Belum ada penjualan pada periode ini.",
    head: [["Waktu"], ["Pelanggan"], ["Produk"], ["Total", "r"], ["Sumber Iklan"], [""]],
    row: function (r) {
      return h("tr", null,
        h("td", { class: "sub" }, when(r.sold_at)),
        h("td", null, h("div", null, r.customer_name || "(tanpa nama)"), h("div", { class: "sub num" }, r.phone)),
        h("td", null, r.items.map(function (i) { return h("div", null, i.name + " × " + i.qty); }), r.note ? h("div", { class: "sub" }, r.note) : null),
        h("td", { class: "r" }, rp(r.total)),
        h("td", null, r.campaign ? [h("div", null, r.campaign), h("div", { class: "sub" }, r.content || "")] : h("span", { class: "sub" }, "(tanpa sumber)")),
        h("td", null, role === "owner" ? h("button", { class: "btn sm danger", type: "button", onclick: function () {
          if (!window.confirm("Hapus penjualan " + rp(r.total) + " ini? Tindakan ini tidak bisa dibatalkan.")) return;
          api("sale_del", {}, { id: r.id }).then(function () { toast("Penjualan dihapus."); refreshCurrent(); }, function (e) { if (e.message !== "login") toast(errText(e)); });
        } }, "Hapus") : null));
    }
  });
}

/* ====================== campaign ====================== */
function pageCampaigns() {
  var by = "campaign";
  var body = h("div", { class: "tbl" });
  var segC = h("button", { type: "button", "aria-pressed": "true" }, "Per Campaign");
  var segA = h("button", { type: "button", "aria-pressed": "false" }, "Per Iklan");
  function setBy(v) { by = v; segC.setAttribute("aria-pressed", String(v === "campaign")); segA.setAttribute("aria-pressed", String(v === "content")); load(); }
  segC.addEventListener("click", function () { setBy("campaign"); });
  segA.addEventListener("click", function () { setBy("content"); });
  function load() {
    var my = ++seq;
    body.classList.add("loading");
    api("campaigns", Object.assign({ by: by }, rq())).then(function (out) {
      if (my !== seq) return;
      if (!out.rows.length) { put(body, h("div", { class: "empty" }, "Belum ada data pada periode ini.")); return; }
      var t = out.rows.reduce(function (a, r) { ["leads", "buyers", "orders", "items", "gmv"].forEach(function (k) { a[k] += Number(r[k]); }); return a; }, { leads: 0, buyers: 0, orders: 0, items: 0, gmv: 0 });
      put(body, h("table", null,
        h("thead", null, h("tr", null, h("th", null, by === "campaign" ? "Campaign" : "Campaign / Iklan"), h("th", { class: "r" }, "Lead"), h("th", { class: "r" }, "Pembeli"),
          h("th", { class: "r" }, "Pesanan"), h("th", { class: "r" }, "Produk Terjual"), h("th", { class: "r" }, "GMV"), h("th", { class: "r" }, "Konversi"))),
        h("tbody", null, out.rows.map(function (r) {
          return h("tr", null, h("td", null, r.name), h("td", { class: "r" }, num(r.leads)), h("td", { class: "r" }, num(r.buyers)), h("td", { class: "r" }, num(r.orders)),
            h("td", { class: "r" }, num(r.items)), h("td", { class: "r" }, rp(r.gmv)), h("td", { class: "r" }, r.leads ? pct(r.buyers / r.leads * 100) : "–"));
        }), h("tr", null, h("td", null, h("b", null, "Total")), h("td", { class: "r" }, h("b", null, num(t.leads))), h("td", { class: "r" }, h("b", null, num(t.buyers))),
          h("td", { class: "r" }, h("b", null, num(t.orders))), h("td", { class: "r" }, h("b", null, num(t.items))), h("td", { class: "r" }, h("b", null, rp(t.gmv))), h("td", { class: "r" }, t.leads ? h("b", null, pct(t.buyers / t.leads * 100)) : "–")))));
    }).catch(function (e) { if (my !== seq || e.message === "login") return; put(body, h("div", { class: "empty", role: "alert" }, errText(e))); })
      .then(function () { if (my === seq) body.classList.remove("loading"); });
  }
  refreshCurrent = load;
  contentEl.appendChild(h("h1", null, "Performa Campaign"));
  contentEl.appendChild(h("div", { class: "bar" }, rangePicker(load), h("div", { class: "seg" }, segC, segA), h("div", { class: "sp" }),
    h("button", { class: "btn pri", type: "button", onclick: function () { openSale(); } }, "+ Catat Penjualan")));
  contentEl.appendChild(h("section", { class: "card" }, body,
    h("div", { class: "bd hint" }, "Lead dihitung dari yang masuk di periode ini. Pembeli, pesanan, dan GMV dari penjualan di periode ini, dikaitkan ke campaign dari lead terakhir pada nomor pembeli. “(tanpa sumber)” = nomor belum pernah mengisi landing page. Konversi = pembeli ÷ lead.")));
  load();
}

/* ====================== paket ====================== */
function pageProducts() {
  var body = h("div", { class: "tbl" });
  function load() {
    var my = ++seq;
    api("products").then(function (out) {
      if (my !== seq) return;
      products = out.rows;
      if (!out.rows.length) { put(body, h("div", { class: "empty" }, role === "owner" ? "Belum ada paket. Tambahkan paket pertama." : "Belum ada paket.")); return; }
      put(body, h("table", null,
        h("thead", null, h("tr", null, h("th", null, "Nama Paket"), h("th", { class: "r" }, "Harga"), h("th", null, "Status"), h("th", null, ""))),
        h("tbody", null, out.rows.map(function (p) {
          return h("tr", null, h("td", null, p.name), h("td", { class: "r" }, rp(p.price)),
            h("td", null, p.active ? h("span", { class: "badge ok" }, "✓ Aktif") : h("span", { class: "badge no" }, "Nonaktif")),
            h("td", null, role === "owner" ? h("div", { class: "acts" },
              h("button", { class: "btn sm", type: "button", onclick: function () { openProduct(p); } }, "Ubah"),
              h("button", { class: "btn sm danger", type: "button", onclick: function () {
                if (!window.confirm("Hapus paket “" + p.name + "”? Riwayat penjualan tetap tersimpan.")) return;
                api("product_del", {}, { id: p.id }).then(function () { products = null; load(); }, function (e) { if (e.message !== "login") toast(errText(e)); });
              } }, "Hapus")) : null));
        }))));
    }).catch(function (e) { if (my !== seq || e.message === "login") return; put(body, h("div", { class: "empty", role: "alert" }, errText(e))); });
  }
  refreshCurrent = load;
  contentEl.appendChild(h("h1", null, "Paket & Harga"));
  contentEl.appendChild(h("div", { class: "bar" }, h("div", { class: "sp" }),
    role === "owner" ? h("button", { class: "btn pri", type: "button", onclick: function () { openProduct(null); } }, "+ Tambah Paket") : null));
  contentEl.appendChild(h("section", { class: "card" }, body,
    h("div", { class: "bd hint" }, "Harga di sini hanya acuan saat mencatat penjualan; harga bisa diubah per transaksi. Mengubah harga tidak mengubah riwayat penjualan.")));
  load();
}

function openProduct(p) {
  var name = h("input", { class: "in", id: "pn", maxlength: "120", value: p ? p.name : "" });
  var price = h("input", { class: "in", id: "pp", type: "number", min: "0", step: "1", inputmode: "numeric", value: p ? p.price : "" });
  var act = h("input", { type: "checkbox", id: "pa", checked: p ? p.active : true });
  var err = h("p", { class: "err", role: "alert" });
  var save = h("button", { class: "btn pri", type: "button" }, "Simpan");
  var cancel = h("button", { class: "btn", type: "button" }, "Batal");
  var m = modal(p ? "Ubah Paket" : "Tambah Paket", h("div", null,
    h("div", { class: "fld" }, h("label", { for: "pn" }, "Nama paket"), name),
    h("div", { class: "fld" }, h("label", { for: "pp" }, "Harga (Rp)"), price),
    h("div", { class: "fld" }, h("label", null, act, " Aktif (muncul saat mencatat penjualan)")), err), [cancel, save]);
  cancel.addEventListener("click", m.close);
  save.addEventListener("click", function () {
    save.disabled = true; put(err, "");
    api("product_save", {}, { id: p ? p.id : undefined, name: name.value, price: Number(price.value), active: act.checked })
      .then(function () { products = null; m.close(); refreshCurrent(); },
        function (e) { save.disabled = false; if (e.message !== "login") put(err, errText(e)); });
  });
}

/* ====================== catat penjualan ====================== */
function getProducts() {
  if (products) return Promise.resolve(products);
  return api("products").then(function (o) { products = o.rows; return products; });
}

function openSale(pre) {
  pre = pre || {};
  getProducts().catch(function () { return []; }).then(function (prods) {
    var active = prods.filter(function (p) { return p.active; });
    var phone = h("input", { class: "in", id: "sp", inputmode: "tel", autocomplete: "off", placeholder: "0812xxxxxxxx", value: pre.phone ? "0" + String(pre.phone).replace(/^62/, "") : "" });
    var cname = h("input", { class: "in", id: "sn", maxlength: "80", autocomplete: "off", value: pre.name || "" });
    var when_ = h("input", { class: "in", id: "sw", type: "datetime-local" });
    var note = h("input", { class: "in", id: "so", maxlength: "300", placeholder: "Opsional" });
    var itemsBox = h("div"), totalEl = h("span", { class: "num" }, rp(0));
    var err = h("p", { class: "err", role: "alert" });
    var rows = [];

    function recalc() {
      var t = 0;
      rows.forEach(function (r) { t += (parseInt(r.qty.value, 10) || 0) * (Number(r.price.value) || 0); });
      put(totalEl, rp(t));
    }
    function addRow() {
      var sel = h("select", { class: "in", "aria-label": "Paket" });
      sel.appendChild(h("option", { value: "" }, "Pilih paket…"));
      active.forEach(function (p) { sel.appendChild(h("option", { value: p.id }, p.name + " — " + rp(p.price))); });
      sel.appendChild(h("option", { value: "__other" }, "Lainnya (ketik nama)"));
      var nm = h("input", { class: "in", maxlength: "120", placeholder: "Nama produk", "aria-label": "Nama produk", hidden: true });
      var qty = h("input", { class: "in", type: "number", min: "1", max: "1000", step: "1", value: "1", "aria-label": "Jumlah", inputmode: "numeric" });
      var price = h("input", { class: "in price", type: "number", min: "0", step: "1", placeholder: "Harga satuan", "aria-label": "Harga satuan (Rp)", inputmode: "numeric" });
      var del = h("button", { class: "btn sm", type: "button", "aria-label": "Hapus baris" }, "✕");
      var row = { sel: sel, nm: nm, qty: qty, price: price };
      sel.addEventListener("change", function () {
        nm.hidden = sel.value !== "__other";
        var p = active.filter(function (x) { return x.id === sel.value; })[0];
        if (p) price.value = p.price;
        recalc();
      });
      qty.addEventListener("input", recalc); price.addEventListener("input", recalc);
      var el = h("div", { class: "item" }, h("div", null, sel, nm), qty, price, del);
      del.addEventListener("click", function () {
        if (rows.length === 1) return;
        rows.splice(rows.indexOf(row), 1); itemsBox.removeChild(el); recalc();
      });
      rows.push(row); itemsBox.appendChild(el);
    }
    addRow();

    var save = h("button", { class: "btn pri", type: "button" }, "Simpan Penjualan");
    var cancel = h("button", { class: "btn", type: "button" }, "Batal");
    var m = modal("Catat Penjualan", h("div", null,
      h("div", { class: "fld" }, h("label", { for: "sp" }, "Nomor WhatsApp pembeli"), phone),
      h("div", { class: "fld" }, h("label", { for: "sn" }, "Nama pembeli"), cname),
      h("div", { class: "fld" }, h("label", null, "Produk yang dibeli"), itemsBox,
        h("div", null, h("button", { class: "btn sm", type: "button", onclick: function () { if (rows.length < 20) addRow(); } }, "+ Tambah produk"))),
      h("div", { class: "total" }, h("span", null, "Total (GMV)"), totalEl),
      h("div", { class: "fld", style: null }, h("label", { for: "sw" }, "Waktu penjualan (WIB) — kosongkan untuk sekarang"), when_),
      h("div", { class: "fld" }, h("label", { for: "so" }, "Catatan"), note), err), [cancel, save]);
    cancel.addEventListener("click", m.close);
    save.addEventListener("click", function () {
      put(err, "");
      var items = [];
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i], v = r.sel.value;
        if (!v) { put(err, "Pilih paket pada setiap baris produk."); return; }
        var it = { qty: parseInt(r.qty.value, 10), unit_price: Number(r.price.value) };
        if (v === "__other") { it.name = r.nm.value.trim(); if (!it.name) { put(err, "Isi nama produk untuk baris “Lainnya”."); return; } }
        else it.product_id = v;
        if (!(it.qty >= 1)) { put(err, "Jumlah minimal 1."); return; }
        if (r.price.value === "" || !(it.unit_price >= 0)) { put(err, "Isi harga satuan."); return; }
        items.push(it);
      }
      if (!phone.value.trim()) { put(err, "Isi nomor WhatsApp pembeli."); return; }
      save.disabled = true;
      api("sale_add", {}, { phone: phone.value, customer_name: cname.value, items: items, note: note.value,
        sold_at: when_.value ? when_.value + ":00+07:00" : undefined })
        .then(function (out) {
          m.close();
          toast("Penjualan " + rp(out.total) + " tercatat. " + (out.attributed ? "Dikaitkan ke campaign: " + (out.campaign || "(tanpa campaign)") + "." : "Nomor ini belum pernah lewat landing page, jadi masuk “(tanpa sumber)”."));
          refreshCurrent();
        }, function (e) { save.disabled = false; if (e.message !== "login") put(err, errText(e)); });
    });
  });
}

/* ====================== boot ====================== */
fetch("/api/auth", { credentials: "same-origin" }).then(function (r) {
  return r.json().catch(function () { return {}; }).then(function (j) { return { r: r, j: j }; });
}).then(function (x) {
  if (x.r.ok && x.j.ok) { role = x.j.role; email = x.j.email; showShell(); }
  else if (x.r.status === 401) showLogin();
  else showLogin(x.j.error === "config" ? "Server belum dikonfigurasi (cek environment variable di Vercel)." : "Server bermasalah. Coba muat ulang.");
}).catch(function () { showLogin("Tidak bisa terhubung ke server."); });

})();
