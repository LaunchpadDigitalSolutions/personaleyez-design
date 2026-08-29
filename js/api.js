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

/* ============================================================
   Groups / club portals — PS-3xx
   Customers never read ps_groups directly; the access code is
   checked server-side by the ps_group_login function.
   ============================================================ */

async function groupLogin(slug, code){
  const res = await fetch(SB_URL + "/rest/v1/rpc/ps_group_login", {
    method:"POST", headers:HEADERS,
    body: JSON.stringify({ p_slug: slug, p_code: code })
  });
  if(!res.ok){ console.error("PS-300", res.status, await res.text()); throw new Error("PS-300"); }
  return res.json();
}

async function listGroups(){
  return sb("rpc/ps_admin_list_groups", {
    method:"POST", body: JSON.stringify({ p_pass: ADMIN_PASSPHRASE })
  }, "PS-301");
}
async function createGroup(g){
  return sb("rpc/ps_admin_create_group", {
    method:"POST", body: JSON.stringify({
      p_pass: ADMIN_PASSPHRASE, p_name: g.name, p_slug: g.slug, p_code: g.access_code,
      p_kind: g.kind, p_intro: g.intro, p_active: g.active
    })
  }, "PS-302");
}
async function updateGroup(id, patch){
  return sb("rpc/ps_admin_update_group", {
    method:"POST", body: JSON.stringify({ p_pass: ADMIN_PASSPHRASE, p_id: id, p_active: patch.active })
  }, "PS-303");
}
async function deleteGroup(id){
  return sb("rpc/ps_admin_delete_group", {
    method:"POST", body: JSON.stringify({ p_pass: ADMIN_PASSPHRASE, p_id: id })
  }, "PS-304");
}
async function listGroupProducts(groupId){
  return sb("rpc/ps_admin_list_group_products", {
    method:"POST", body: JSON.stringify({ p_pass: ADMIN_PASSPHRASE, p_group_id: groupId })
  }, "PS-305");
}
async function createGroupProduct(p){
  return sb("rpc/ps_admin_create_group_product", {
    method:"POST", body: JSON.stringify({
      p_pass: ADMIN_PASSPHRASE, p_group_id: p.group_id, p_name: p.name, p_description: p.description,
      p_price: p.price, p_sizes: p.sizes, p_colours: p.colours, p_image_url: p.image_url, p_sort_order: p.sort_order
    })
  }, "PS-306");
}
async function deleteGroupProduct(id){
  return sb("rpc/ps_admin_delete_group_product", {
    method:"POST", body: JSON.stringify({ p_pass: ADMIN_PASSPHRASE, p_id: id })
  }, "PS-307");
}

/* ============================================================
   Editable copy — PS-4xx
   ============================================================ */

let CONTENT = {};

async function loadContent(page){
  try{
    const rows = await sb("ps_content?page=eq."+encodeURIComponent(page)+"&select=ckey,value", {}, "PS-400");
    rows.forEach(r => CONTENT[r.ckey] = r.value);
  }catch(e){ /* fall back to whatever is hardcoded in the page */ }
}

/* Swap any [data-edit="key"] element for its stored value, if one exists. */
function applyContent(){
  document.querySelectorAll("[data-edit]").forEach(el => {
    const v = CONTENT[el.dataset.edit];
    if (v != null && v !== "") el.textContent = v;
  });
}

async function listContent(){
  return sb("ps_content?select=*&order=page,ckey", {}, "PS-401");
}
async function saveContent(page, ckey, value){
  return sb("ps_content?on_conflict=page,ckey", {
    method:"POST",
    headers:{ Prefer:"resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ page, ckey, value, updated_at:new Date().toISOString() })
  }, "PS-402");
}
