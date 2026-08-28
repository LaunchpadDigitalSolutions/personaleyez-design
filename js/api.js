/* ============================================================
   api.js — Supabase access. Error codes: PS-1xx orders, PS-2xx enquiries.
   ============================================================ */
const HEADERS = { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY, "Content-Type": "application/json" };

async function sb(path, opts = {}, code = "PS-100") {
  const res = await fetch(SB_URL + "/rest/v1/" + path, { ...opts, headers: { ...HEADERS, ...(opts.headers || {}) } });
  if (!res.ok) { console.error(code, res.status, await res.text()); throw new Error(code); }
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

function makeRef() {
  const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = ""; for (let i = 0; i < 5; i++) s += c[Math.floor(Math.random() * c.length)];
  return "PD-" + s;
}

async function findOrder(ref) {
  const clean = ref.trim().toUpperCase();
  const out = await sb("ps_orders?order_ref=eq." + encodeURIComponent(clean) + "&select=*", {}, "PS-101");
  return out[0] || null;
}
async function listOrders(limit = 100) {
  return sb("ps_orders?select=*&order=created_at.desc&limit=" + limit, {}, "PS-102");
}
async function createOrder(o) {
  const out = await sb("ps_orders", {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ...o, order_ref: makeRef() })
  }, "PS-103");
  return out[0];
}
async function updateOrder(id, patch) {
  return sb("ps_orders?id=eq." + id, {
    method: "PATCH", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() })
  }, "PS-104");
}
async function sendEnquiry(e) {
  return sb("ps_enquiries", { method: "POST", body: JSON.stringify(e) }, "PS-200");
}
async function listEnquiries(limit = 50) {
  return sb("ps_enquiries?select=*&order=created_at.desc&limit=" + limit, {}, "PS-201");
}
async function healthCheck() {
  try { await sb("ps_orders?select=id&limit=1", {}, "PS-105"); return true; } catch (e) { return false; }
}
