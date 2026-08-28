/* ============================================================
   admin.js — Jo's order dashboard
   ============================================================ */
let orders = [], enquiries = [], tab = "live";
const $ = id => document.getElementById(id);
const LIVE = ["enquiry", "in_production", "ready"];
const STATUS_LABEL = { enquiry: "Enquiry", in_production: "In production",
  ready: "Ready for collection", collected: "Collected", cancelled: "Cancelled" };
const NEXT = {
  enquiry:       { to: "in_production", label: "Start production" },
  in_production: { to: "ready",         label: "Mark ready" },
  ready:         { to: "collected",     label: "Mark collected" }
};

function ago(ts) {
  const m = Math.floor((Date.now() - new Date(ts)) / 60000);
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  return Math.floor(h / 24) + "d ago";
}
const money = n => n == null ? "—" : "£" + Number(n).toFixed(2);

async function load() {
  try {
    [orders, enquiries] = await Promise.all([listOrders(150), listEnquiries(60)]);
    $("health").style.display = "none";
  } catch (e) { $("health").style.display = "block"; return; }
  stats(); render();
}

function stats() {
  const live = orders.filter(o => LIVE.includes(o.status));
  const ready = orders.filter(o => o.status === "ready");
  const newEnq = enquiries.filter(e => !e.handled);
  const owed = orders.filter(o => LIVE.includes(o.status))
    .reduce((s, o) => s + (Number(o.quoted_total || 0) - Number(o.deposit_paid || 0)), 0);
  $("stats").innerHTML = `
    <div class="stat"><b>${live.length}</b><span>Open orders</span></div>
    <div class="stat"><b>${ready.length}</b><span>Ready to collect</span></div>
    <div class="stat"><b>${newEnq.length}</b><span>New enquiries</span></div>
    <div class="stat"><b>${money(owed)}</b><span>Still to collect</span></div>`;
}

function setTab(t) {
  tab = t;
  document.querySelectorAll(".tab").forEach(x => x.classList.toggle("on", x.dataset.tab === t));
  render();
}

function orderRow(o) {
  const n = NEXT[o.status];
  return `<div class="orow">
    <div class="orow-top">
      <span class="oref">${o.order_ref}</span>
      <span class="pill p-${o.status}">${STATUS_LABEL[o.status]}</span>
      <span class="otime">${ago(o.created_at)}</span>
    </div>
    <div class="ocust">${o.customer_name} · <a href="tel:${o.customer_phone}" style="color:var(--accent)">${o.customer_phone}</a></div>
    <div class="odesc">${o.quantity > 1 ? o.quantity + " × " : ""}${o.description}</div>
    <div class="ometa">
      ${o.category ? o.category + " · " : ""}Quote ${money(o.quoted_total)}
      ${Number(o.deposit_paid) ? " · Deposit " + money(o.deposit_paid) : ""}
      ${o.due_date ? " · Due " + new Date(o.due_date).toLocaleDateString("en-GB") : ""}
    </div>
    ${o.notes ? `<div class="ometa" style="color:var(--warning)">Note: ${o.notes}</div>` : ""}
    <div class="oact">
      ${n ? `<button onclick="advance('${o.id}','${n.to}')">${n.label}</button>` : ""}
      <button class="sec" onclick="copyLink('${o.order_ref}')">Copy tracking link</button>
      ${o.status !== "collected" && o.status !== "cancelled"
        ? `<button class="sec" onclick="advance('${o.id}','cancelled')">Cancel</button>` : ""}
    </div>
  </div>`;
}

function enqRow(e) {
  return `<div class="orow">
    <div class="orow-top">
      <span class="oref">${e.name}</span>
      ${e.handled ? '<span class="pill p-collected">Handled</span>'
                  : '<span class="pill p-enquiry">New</span>'}
      <span class="otime">${ago(e.created_at)}</span>
    </div>
    <div class="ometa">${e.category || ""}
      ${e.phone ? ` · <a href="tel:${e.phone}" style="color:var(--accent)">${e.phone}</a>` : ""}
      ${e.email ? ` · <a href="mailto:${e.email}" style="color:var(--accent)">${e.email}</a>` : ""}</div>
    <div class="odesc" style="margin-top:10px">${e.message}</div>
    ${!e.handled ? `<div class="oact"><button onclick="markHandled('${e.id}')">Mark handled</button></div>` : ""}
  </div>`;
}

function newOrderForm() {
  return `<div class="newcard">
    <h2 style="font-size:20px">Add an order</h2>
    <div class="fld"><label for="n-name">Customer name</label><input id="n-name" type="text"></div>
    <div class="fld"><label for="n-phone">Phone</label><input id="n-phone" type="tel"></div>
    <div class="fld"><label for="n-email">Email <span class="hint">(optional)</span></label><input id="n-email" type="email"></div>
    <div class="fld"><label for="n-cat">Category</label>
      <select id="n-cat">
        <option value="school">School uniform</option>
        <option value="workwear">Workwear</option>
        <option value="personalised">Personalised</option>
        <option value="other">Other</option>
      </select></div>
    <div class="fld"><label for="n-desc">What are we making?</label>
      <textarea id="n-desc" style="min-height:90px" placeholder="12 navy polos, left breast logo"></textarea></div>
    <div class="fld"><label for="n-qty">Quantity</label><input id="n-qty" type="number" value="1" min="1"></div>
    <div class="fld"><label for="n-total">Quoted total (£)</label><input id="n-total" type="number" step="0.01" inputmode="decimal"></div>
    <div class="fld"><label for="n-dep">Deposit paid (£)</label><input id="n-dep" type="number" step="0.01" value="0" inputmode="decimal"></div>
    <div class="fld"><label for="n-due">Due date <span class="hint">(optional)</span></label><input id="n-due" type="date"></div>
    <div class="fld"><label for="n-notes">Notes <span class="hint">(optional)</span></label><textarea id="n-notes" style="min-height:70px"></textarea></div>
    <div class="notice" id="n-notice"></div>
    <button class="btn btn-primary" id="n-save" onclick="saveOrder()" style="width:100%;margin-top:20px">Create order</button>
  </div>`;
}

function render() {
  const p = $("panel");
  if (tab === "new") { p.innerHTML = newOrderForm(); return; }
  if (tab === "enq") {
    p.innerHTML = enquiries.length ? enquiries.map(enqRow).join("")
      : `<p style="text-align:center;color:var(--text-muted);padding:60px 0">No enquiries yet.</p>`;
    return;
  }
  const list = tab === "live" ? orders.filter(o => LIVE.includes(o.status)) : orders;
  p.innerHTML = list.length ? list.map(orderRow).join("")
    : `<p style="text-align:center;color:var(--text-muted);padding:60px 0">
         ${tab === "live" ? "No open orders." : "No orders yet."}</p>`;
}

async function advance(id, status) {
  try { await updateOrder(id, { status }); toast("Updated"); load(); }
  catch (e) { toast(e.message); }
}
async function markHandled(id) {
  try {
    await fetch(SB_URL + "/rest/v1/ps_enquiries?id=eq." + id, {
      method: "PATCH",
      headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ handled: true })
    });
    toast("Marked handled"); load();
  } catch (e) { toast("Couldn't update"); }
}
function copyLink(ref) {
  const url = location.origin + location.pathname.replace("admin.html", "track.html") + "?ref=" + ref;
  navigator.clipboard.writeText(url)
    .then(() => toast("Tracking link copied"))
    .catch(() => toast(url));
}

async function saveOrder() {
  const g = id => $(id).value.trim();
  const n = $("n-notice"), btn = $("n-save");
  if (!g("n-name")) { n.className = "notice show err"; n.textContent = "Customer name needed."; return; }
  if (!g("n-phone")) { n.className = "notice show err"; n.textContent = "Phone number needed."; return; }
  if (!g("n-desc")) { n.className = "notice show err"; n.textContent = "Say what's being made."; return; }

  btn.disabled = true;
  n.className = "notice show busy"; n.textContent = "Saving…";
  try {
    const o = await createOrder({
      customer_name: g("n-name"), customer_phone: g("n-phone"),
      customer_email: g("n-email") || null,
      category: g("n-cat"), description: g("n-desc"),
      quantity: parseInt(g("n-qty")) || 1,
      quoted_total: g("n-total") ? Number(g("n-total")) : null,
      deposit_paid: g("n-dep") ? Number(g("n-dep")) : 0,
      due_date: g("n-due") || null,
      notes: g("n-notes") || null,
      status: "enquiry"
    });
    n.className = "notice show ok";
    n.innerHTML = `Created <strong>${o.order_ref}</strong> — give this reference to the customer.`;
    ["n-name","n-phone","n-email","n-desc","n-total","n-notes","n-due"].forEach(id => $(id).value = "");
    $("n-qty").value = 1; $("n-dep").value = 0;
    load();
  } catch (e) {
    n.className = "notice show err"; n.textContent = "Couldn't save that (" + e.message + ").";
  }
  btn.disabled = false;
}

document.addEventListener("DOMContentLoaded", () => { load(); setInterval(load, 30000); });
