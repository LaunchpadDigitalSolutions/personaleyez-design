/* ============================================================
   clubs.js — club / team private shops
   The access code is verified server-side by ps_group_login;
   nothing here ever reads the codes table directly.
   ============================================================ */

let GROUP = null, PRODUCTS = [], picks = [];
const $ = id => document.getElementById(id);
const money = n => "£" + Number(n || 0).toFixed(2);

function note(el, cls, msg){
  const n = $(el); n.className = "notice show " + cls; n.textContent = msg;
}
const clearNote = el => $(el).className = "notice";

/* ---------- gate ---------- */
async function enterGroup(){
  const slug = $("g-slug").value.trim().toLowerCase().replace(/\s+/g,"-");
  const code = $("g-code").value.trim();
  const btn  = $("g-btn");

  if(!slug){ note("g-notice","err","Pop your club name in."); return; }
  if(!code){ note("g-notice","err","We need the access code your club gave you."); return; }

  btn.disabled = true;
  note("g-notice","busy","Checking…");

  try{
    const res = await groupLogin(slug, code);
    if(!res || !res.ok){
      note("g-notice","err","That club name and code don't match. Check with whoever runs your club.");
      btn.disabled = false; return;
    }
    GROUP = res.group; PRODUCTS = res.products || []; picks = [];
    try{ sessionStorage.setItem("ps_group", JSON.stringify({slug, code})); }catch(e){}
    clearNote("g-notice");
    showShop();
  }catch(e){
    note("g-notice","err","Couldn't check that just now. Please ring the studio.");
  }
  btn.disabled = false;
}

function leaveGroup(){
  try{ sessionStorage.removeItem("ps_group"); }catch(e){}
  GROUP = null; PRODUCTS = []; picks = [];
  $("shop").style.display = "none";
  $("gate").style.display = "block";
  $("s-done").style.display = "none";
  $("s-checkout").style.display = "none";
  window.scrollTo(0,0);
}

/* ---------- shop ---------- */
function showShop(){
  $("gate").style.display = "none";
  $("shop").style.display = "block";
  $("s-kind").textContent = (GROUP.kind === "school" ? "School shop"
                          : GROUP.kind === "business" ? "Team shop" : "Club shop");
  $("s-name").textContent = GROUP.name;
  $("s-intro").textContent = GROUP.intro || "Everything below is made just for your club. Pick what you need and we'll be in touch to confirm.";
  renderProducts();
  renderBasket();
  window.scrollTo(0,0);
}

function renderProducts(){
  if(!PRODUCTS.length){
    $("s-products").innerHTML =
      `<p class="body dim" style="padding:0 20px">Nothing's been added to this shop yet. Give us a ring and we'll sort it.</p>`;
    return;
  }
  $("s-products").innerHTML = PRODUCTS.map((p,i) => {
    const sizes = (p.sizes||"").split(",").map(s=>s.trim()).filter(Boolean);
    const cols  = (p.colours||"").split(",").map(s=>s.trim()).filter(Boolean);
    return `<div class="piece">
      ${p.image_url ? `<div class="imgwrap"><img loading="lazy" src="${p.image_url}" alt="${p.name}"></div>`
                    : `<div class="imgwrap noimg" style="aspect-ratio:3/4"><span>${p.name}</span></div>`}
      <h3>${p.name}</h3>
      ${p.price != null ? `<p style="color:var(--charcoal);font-family:var(--display);font-size:19px">${money(p.price)}</p>` : ""}
      ${p.description ? `<p>${p.description}</p>` : ""}
      ${sizes.length ? `<div class="fld"><label for="sz-${i}">Size</label>
        <select id="sz-${i}">${sizes.map(s=>`<option>${s}</option>`).join("")}</select></div>` : ""}
      ${cols.length ? `<div class="fld"><label for="co-${i}">Colour</label>
        <select id="co-${i}">${cols.map(s=>`<option>${s}</option>`).join("")}</select></div>` : ""}
      <div class="fld"><label for="qt-${i}">Quantity</label>
        <input id="qt-${i}" type="number" min="0" value="0" inputmode="numeric" onchange="renderBasket()"></div>
    </div>`;
  }).join("");
}

function collectPicks(){
  picks = [];
  PRODUCTS.forEach((p,i) => {
    const q = parseInt(($("qt-"+i)||{}).value || 0);
    if(q > 0){
      const bits = [];
      if($("sz-"+i)) bits.push($("sz-"+i).value);
      if($("co-"+i)) bits.push($("co-"+i).value);
      picks.push({ name:p.name, qty:q, unit:Number(p.price||0), opts:bits });
    }
  });
  return picks;
}

function renderBasket(){
  collectPicks();
  const box = $("s-basketbox"), co = $("s-checkout");
  if(!picks.length){ box.style.display="none"; co.style.display="none"; return; }
  box.style.display = "block"; co.style.display = "block";
  $("s-basket").innerHTML = picks.map(p =>
    `<li><b>${p.qty} × ${p.name}${p.opts.length ? " · " + p.opts.join(" · ") : ""}</b>
     <span>${p.unit ? money(p.unit*p.qty) : "Price on confirmation"}</span></li>`).join("");
  const total = picks.reduce((s,p)=>s + p.unit*p.qty, 0);
  $("s-total").textContent = total ? money(total) : "TBC";
}

/* ---------- order ---------- */
async function placeGroupOrder(){
  collectPicks();
  const name = $("s-cname").value.trim();
  const phone= $("s-cphone").value.trim();
  const email= $("s-cemail").value.trim();
  const note_= $("s-cnote").value.trim();
  const btn  = $("s-send");

  if(!picks.length){ note("s-notice","err","Choose at least one item."); return; }
  if(!name){ note("s-notice","err","We need your name."); return; }
  if(phone.length < 9){ note("s-notice","err","We need a phone number."); return; }

  btn.disabled = true; note("s-notice","busy","Placing your order…");
  const total = picks.reduce((s,p)=>s + p.unit*p.qty, 0);
  const desc  = picks.map(p => `${p.qty} × ${p.name}${p.opts.length?" ("+p.opts.join(", ")+")":""}`).join("; ");

  try{
    const o = await createOrder({
      customer_name:name, customer_phone:phone, customer_email:email||null,
      category:"club", description:desc,
      quantity: picks.reduce((s,p)=>s+p.qty,0),
      quoted_total: total || null,
      notes: (note_ ? note_ + " · " : "") + GROUP.name,
      group_id: GROUP.id, group_slug: GROUP.slug,
      status:"enquiry"
    });
    $("s-ref").textContent = o.order_ref;
    $("s-tracklink").href = "track.html?ref=" + o.order_ref;
    clearNote("s-notice");
    $("s-checkout").style.display = "none";
    $("s-basketbox").style.display = "none";
    $("s-products").style.display = "none";
    $("s-done").style.display = "block";
    $("s-done").scrollIntoView({behavior:"smooth", block:"center"});
  }catch(e){
    note("s-notice","err","That didn't go through. Please ring us on " + BRAND.phone + ".");
  }
  btn.disabled = false;
}

/* ---------- boot ---------- */
document.addEventListener("DOMContentLoaded", async () => {
  if(!(await healthCheck())) $("health").style.display = "block";

  // Deep link: clubs.html?c=starlight-dance  → prefills the club name
  const c = new URLSearchParams(location.search).get("c");
  if(c) $("g-slug").value = c;

  // Resume a session so refreshing doesn't kick them out
  try{
    const saved = JSON.parse(sessionStorage.getItem("ps_group") || "null");
    if(saved){
      const res = await groupLogin(saved.slug, saved.code);
      if(res && res.ok){ GROUP = res.group; PRODUCTS = res.products || []; showShop(); }
    }
  }catch(e){}
});
