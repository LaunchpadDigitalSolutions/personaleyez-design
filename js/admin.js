/* ============================================================
   admin.js — Jo's order dashboard
   ============================================================ */
/* Required by every ps_admin_* RPC call (js/api.js) for group/product
   writes - must match the passphrase check in those Postgres functions.
   Lives here (admin.js), not config.js, so it only ships to whoever
   loads admin.html - not to every public page. Still client-side, so
   this is a step up from the open anon policy it replaces, not a
   substitute for Cloudflare Access on /admin* (see README). */
const ADMIN_PASSPHRASE = "CSZjmD0Mohgj7EieDXoCu7Onhg1T";

let orders = [], enquiries = [], groups = [], contentRows = [], tab = "live";
let openGroup = null, openGroupProducts = [];
let lastCreatedRef = null;   // survives the auto-refresh re-render
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
    [orders, enquiries, groups] = await Promise.all([
      listOrders(150), listEnquiries(60), listGroups()
    ]);
    $("health").style.display = "none";
  } catch (e) { $("health").style.display = "block"; return; }
  stats();
  // The 30s auto-refresh used to redraw the whole panel underneath
  // whoever was mid-typing into a form (New order, Add a club shop,
  // Add an item), wiping out anything they'd entered. Skip the redraw
  // while focus is on a field inside the panel - data is still fetched
  // above, the screen just waits until they're not actively typing.
  const active = document.activeElement;
  const panel = $("panel");
  const isTyping = active && panel && panel.contains(active) &&
    ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName);
  if (isTyping) return;
  render();
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
  if (tab === "new" && t !== "new") lastCreatedRef = null;
  tab = t;
  document.querySelectorAll(".tab").forEach(x => x.classList.toggle("on", x.dataset.tab === t));
  render();
}

function orderRow(o) {
  const n = NEXT[o.status];
  return `<div class="orow">
    <div class="orow-top">
      <span class="oref">${o.order_ref}</span>
      <span class="stat-word s-${o.status}">${STATUS_LABEL[o.status]}</span>
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
      <button class="ghost" onclick="copyLink('${o.order_ref}')">Copy tracking link</button>
      ${o.status !== "collected" && o.status !== "cancelled"
        ? `<button class="ghost" onclick="advance('${o.id}','cancelled')">Cancel</button>` : ""}
    </div>
  </div>`;
}

function enqRow(e) {
  return `<div class="orow">
    <div class="orow-top">
      <span class="oref">${e.name}</span>
      ${e.handled ? '<span class="stat-word s-collected">Handled</span>'
                  : '<span class="stat-word s-enquiry">New</span>'}
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
  const banner = lastCreatedRef
    ? `<div class="notice show ok" style="margin:0 0 18px">
         Created <strong style="font-family:var(--display);font-size:18px">${lastCreatedRef}</strong>
         — give this reference to the customer.
         <button onclick="copyRef('${lastCreatedRef}')"
           style="margin-left:10px;text-decoration:underline;font-size:13px">Copy</button>
       </div>` : "";
  return `${banner}<div class="newcard">
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
  if (tab === "groups")  { renderGroups(p);  return; }
  if (tab === "content") { renderContent(p); return; }
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

function copyRef(ref){
  navigator.clipboard.writeText(ref)
    .then(()=>toast("Reference copied")).catch(()=>toast(ref));
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
    lastCreatedRef = o.order_ref;
    toast("Created " + o.order_ref);
    ["n-name","n-phone","n-email","n-desc","n-total","n-notes","n-due"].forEach(id => $(id).value = "");
    $("n-qty").value = 1; $("n-dep").value = 0;
    await load();
    render();          // redraw so the reference banner is visible
  } catch (e) {
    n.className = "notice show err"; n.textContent = "Couldn't save that (" + e.message + ").";
  }
  btn.disabled = false;
}



/* ============================================================
   CLUB / TEAM SHOPS
   Jo creates a shop, sets the code, adds the products. No dev needed.
   ============================================================ */

function slugify(s){
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
}
function suggestCode(){
  const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s=""; for(let i=0;i<6;i++) s += c[Math.floor(Math.random()*c.length)];
  return s;
}

function renderGroups(p){
  if(openGroup){ renderGroupDetail(p); return; }

  p.innerHTML = `
    <div class="newcard" style="margin-bottom:18px">
      <h2 style="font-size:20px;font-family:var(--display)">Add a club shop</h2>
      <p style="font-size:14px;color:var(--muted);margin:6px 0 0">
        Give them the club name and the code, and they can order their own kit.</p>
      <div class="fld"><label for="ng-name">Club or team name</label>
        <input id="ng-name" type="text" placeholder="Starlight Dance Academy" oninput="autoSlug()" autocomplete="off"></div>
      <div class="fld"><label for="ng-slug">Web name (what they type in)</label>
        <input id="ng-slug" type="text" placeholder="starlight-dance" autocomplete="off"></div>
      <div class="fld"><label for="ng-code">Access code</label>
        <input id="ng-code" type="text" style="text-transform:uppercase" autocomplete="off"></div>
      <div class="fld"><label for="ng-kind">Type</label>
        <select id="ng-kind">
          <option value="club">Dance club / team</option>
          <option value="school">School</option>
          <option value="business">Business</option>
        </select></div>
      <div class="fld"><label for="ng-intro">Welcome message (optional)</label>
        <textarea id="ng-intro" style="min-height:70px" placeholder="Kit for the 2026 season. Orders close 30th September."></textarea></div>
      <div class="notice" id="ng-notice"></div>
      <button class="btn-solid" id="ng-save" onclick="saveGroup()" style="margin-top:20px">Create shop</button>
    </div>

    ${groups.length ? groups.map(g => `
      <div class="orow">
        <div class="orow-top">
          <span class="oref">${g.name}</span>
          <span class="stat-word ${g.active?"s-ready":"s-collected"}">${g.active?"Live":"Paused"}</span>
          <span class="otime">${ago(g.created_at)}</span>
        </div>
        <div class="ometa">Web name <strong>${g.slug}</strong> &nbsp;·&nbsp; Code <strong>${g.access_code}</strong></div>
        <div class="oact">
          <button onclick="openGroupPanel('${g.id}')">Manage products</button>
          <button class="ghost" onclick="copyClubLink('${g.slug}','${g.access_code}')">Copy link &amp; code</button>
          <button class="ghost" onclick="toggleGroup('${g.id}',${!g.active})">${g.active?"Pause":"Reactivate"}</button>
        </div>
      </div>`).join("")
    : `<p style="text-align:center;color:var(--muted);padding:50px 0">No club shops yet.</p>`}`;

  if($("ng-code")) $("ng-code").value = suggestCode();
}

function autoSlug(){
  const n = $("ng-name").value;
  if($("ng-slug")) $("ng-slug").value = slugify(n);
}

async function saveGroup(){
  const name = $("ng-name").value.trim();
  const slug = slugify($("ng-slug").value || name);
  const code = $("ng-code").value.trim().toUpperCase();
  const n = $("ng-notice"), btn = $("ng-save");
  if(!name){ n.className="notice show err"; n.textContent="Give the club a name."; return; }
  if(!code){ n.className="notice show err"; n.textContent="Set an access code."; return; }

  btn.disabled = true; n.className="notice show busy"; n.textContent="Creating…";
  try{
    await createGroup({ name, slug, access_code:code, kind:$("ng-kind").value,
                        intro:$("ng-intro").value.trim() || null, active:true });
    toast("Shop created"); await load(); setTab("groups");
  }catch(e){
    n.className="notice show err";
    n.textContent = e.message === "PS-302"
      ? "Couldn't create that — the web name might already be taken."
      : "Couldn't create that ("+e.message+").";
  }
  btn.disabled = false;
}

async function toggleGroup(id, active){
  try{ await updateGroup(id,{active}); toast(active?"Reactivated":"Paused"); load(); }
  catch(e){ toast("Couldn't update"); }
}

function copyClubLink(slug, code){
  const url = location.origin + location.pathname.replace("admin.html","clubs.html") + "?c=" + slug;
  const msg = `Your shop: ${url}\nClub name: ${slug}\nAccess code: ${code}`;
  navigator.clipboard.writeText(msg).then(()=>toast("Link and code copied")).catch(()=>toast(url));
}

async function openGroupPanel(id){
  openGroup = groups.find(g => g.id === id);
  try{ openGroupProducts = await listGroupProducts(id); }
  catch(e){ openGroupProducts = []; }
  render();
}
function closeGroupPanel(){ openGroup = null; openGroupProducts = []; render(); }

function renderGroupDetail(p){
  const g = openGroup;
  p.innerHTML = `
    <button class="ghost" onclick="closeGroupPanel()"
      style="min-height:44px;padding:0 18px;border-radius:2px;background:var(--cream-deep);margin-bottom:16px">
      &larr; All club shops</button>

    <div class="orow">
      <div class="orow-top"><span class="oref">${g.name}</span></div>
      <div class="ometa">Web name <strong>${g.slug}</strong> · Code <strong>${g.access_code}</strong></div>
    </div>

    <div class="newcard" style="margin:18px 0">
      <h2 style="font-size:19px;font-family:var(--display)">Add an item</h2>
      <div class="fld"><label for="np-name">Item name</label>
        <input id="np-name" type="text" placeholder="Club hoodie" autocomplete="off"></div>
      <div class="fld"><label for="np-desc">Description (optional)</label>
        <input id="np-desc" type="text" placeholder="Embroidered club logo, name on the back" autocomplete="off"></div>
      <div class="fld"><label for="np-price">Price (£)</label>
        <input id="np-price" type="number" step="0.01" inputmode="decimal" autocomplete="off"></div>
      <div class="fld"><label for="np-sizes">Sizes, comma separated</label>
        <input id="np-sizes" type="text" placeholder="3-4, 5-6, 7-8, S, M, L" autocomplete="off"></div>
      <div class="fld"><label for="np-cols">Colours, comma separated (optional)</label>
        <input id="np-cols" type="text" placeholder="Navy, Black" autocomplete="off"></div>
      <div class="fld"><label for="np-img">Image URL (optional)</label>
        <input id="np-img" type="url" placeholder="https://…" autocomplete="off"></div>
      <div class="notice" id="np-notice"></div>
      <button class="btn-solid" id="np-save" onclick="saveGroupProduct()" style="margin-top:18px">Add item</button>
    </div>

    ${openGroupProducts.length ? openGroupProducts.map(pr => `
      <div class="orow">
        <div class="orow-top"><span class="oref" style="font-size:15px">${pr.name}</span>
          <span class="otime">${pr.price!=null?money(pr.price):"—"}</span></div>
        ${pr.description?`<div class="odesc">${pr.description}</div>`:""}
        <div class="ometa">${pr.sizes?"Sizes: "+pr.sizes:""}${pr.colours?" · Colours: "+pr.colours:""}</div>
        <div class="oact"><button class="ghost" onclick="removeGroupProduct('${pr.id}')">Remove</button></div>
      </div>`).join("")
    : `<p style="text-align:center;color:var(--muted);padding:40px 0">No items in this shop yet.</p>`}`;
}

async function saveGroupProduct(){
  const v = id => $(id).value.trim();
  const n = $("np-notice"), btn = $("np-save");
  if(!v("np-name")){ n.className="notice show err"; n.textContent="Give the item a name."; return; }
  btn.disabled = true; n.className="notice show busy"; n.textContent="Adding…";
  try{
    await createGroupProduct({
      group_id: openGroup.id, name: v("np-name"),
      description: v("np-desc") || null,
      price: v("np-price") ? Number(v("np-price")) : null,
      sizes: v("np-sizes") || null, colours: v("np-cols") || null,
      image_url: v("np-img") || null,
      sort_order: openGroupProducts.length
    });
    openGroupProducts = await listGroupProducts(openGroup.id);
    toast("Item added"); render();
  }catch(e){ n.className="notice show err"; n.textContent="Couldn't add that ("+e.message+")."; }
  btn.disabled = false;
}

async function removeGroupProduct(id){
  try{
    await deleteGroupProduct(id);
    openGroupProducts = await listGroupProducts(openGroup.id);
    toast("Removed"); render();
  }catch(e){ toast("Couldn't remove that"); }
}

/* ============================================================
   EDITABLE COPY
   ============================================================ */
const EDITABLE = [
  ["index","hero_line1","Hero line 1","MADE"],
  ["index","hero_line2","Hero line 2","JUST"],
  ["index","hero_line3","Hero line 3 (italic)","for you."],
  ["index","hero_note","Hero paragraph","Embroidery and print, stitched by hand in our own studio."],
  ["index","statement","Big statement","Nothing here leaves the shop unloved."],
  ["index","collection_head","Collection heading","Three things, done properly."],
  ["index","quote","Pull quote","Sweet style, Southern vibes, stitched in the North East."],
  ["schools","repay_head","Repayment heading","Spread the cost of September."],
  ["schools","repay_body","Repayment paragraph","It's an expensive month, especially with more than one at school."]
];

function renderContent(p){
  p.innerHTML = `
    <div class="newcard">
      <h2 style="font-size:20px;font-family:var(--display)">Wording</h2>
      <p style="font-size:14px;color:var(--muted);margin:6px 0 0">
        Change the words on the site. Leave a box empty to keep what's there now.</p>
      ${EDITABLE.map(([page,key,label,def]) => {
        const row = contentRows.find(r => r.page===page && r.ckey===key);
        const val = row ? row.value : "";
        return `<div class="fld">
          <label for="ct-${page}-${key}">${label} <span style="text-transform:none;letter-spacing:0;color:var(--muted)">· ${page}</span></label>
          <textarea id="ct-${page}-${key}" style="min-height:64px" placeholder="${def.replace(/"/g,"&quot;")}">${val}</textarea>
        </div>`;
      }).join("")}
      <div class="notice" id="ct-notice"></div>
      <button class="btn-solid" id="ct-save" onclick="saveAllContent()" style="margin-top:22px">Save wording</button>
    </div>`;
}

async function saveAllContent(){
  const n = $("ct-notice"), btn = $("ct-save");
  btn.disabled = true; n.className="notice show busy"; n.textContent="Saving…";
  try{
    for(const [page,key] of EDITABLE.map(e=>[e[0],e[1]])){
      const el = $(`ct-${page}-${key}`);
      if(el && el.value.trim()) await saveContent(page, key, el.value.trim());
    }
    contentRows = await listContent();
    n.className="notice show ok"; n.textContent="Saved. Refresh the site to see it.";
  }catch(e){ n.className="notice show err"; n.textContent="Couldn't save ("+e.message+")."; }
  btn.disabled = false;
}

/* ============================================================
   DEMO PIN GATE
   Cosmetic only — the PIN ships in the client bundle. Real
   protection is Cloudflare Access plus tighter RLS; see README.
   ============================================================ */
function unlockAdmin(){
  document.getElementById("pingate").classList.add("hidden");
  if (!window.__adminBooted) {
    window.__adminBooted = true;
    listContent().then(r => contentRows = r).catch(()=>{});
    load();
    setInterval(load, 30000);
  }
}

function tryPin(){
  const v = document.getElementById("pin").value.trim();
  const err = document.getElementById("pinerr");
  if (v === ADMIN_PIN) {
    try { sessionStorage.setItem("ps_admin", "1"); } catch(e) {}
    err.classList.remove("show");
    unlockAdmin();
  } else {
    err.classList.add("show");
    document.getElementById("pin").value = "";
    document.getElementById("pin").focus();
  }
}

function lockAdmin(){
  try { sessionStorage.removeItem("ps_admin"); } catch(e) {}
  location.reload();
}

document.addEventListener("DOMContentLoaded", () => {
  let unlocked = false;
  try { unlocked = sessionStorage.getItem("ps_admin") === "1"; } catch(e) {}
  if (unlocked) unlockAdmin();
  else setTimeout(()=>{ const p=document.getElementById("pin"); if(p) p.focus(); }, 300);
});
