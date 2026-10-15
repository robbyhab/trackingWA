"use strict";

// Harus sama dengan norm() di index.html — server tidak boleh percaya validasi browser.
function normPhone(raw) {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.slice(0, 2) === "00") d = d.slice(2);
  if (d.slice(0, 3) === "620") d = "62" + d.slice(3);
  else if (d.charAt(0) === "0") d = "62" + d.slice(1);
  else if (d.charAt(0) === "8") d = "62" + d;
  if (d.slice(0, 2) === "62") return /^628\d{8,12}$/.test(d) ? d : "";
  return /^\d{10,15}$/.test(d) ? d : "";
}

module.exports = { normPhone };
