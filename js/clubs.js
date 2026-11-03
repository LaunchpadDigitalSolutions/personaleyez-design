/* ============================================================
   clubs.js — club / team private shops
   The access code is verified server-side by ps_group_login;
   nothing here ever reads the codes table directly.
   Orders go to /api/club-checkout: the server checks the club code,
   looks up every price itself and either sends the customer to Square
   or saves an enquiry. Prices shown here are for display only.
   Collection / delivery lives in js/club-delivery.js.
   ============================================================ */

let GROUP = null, GROUP_CODE = "", PRODUCTS = [], picks = [];
const $ = id => document.getElementById(id);
const money = n => "£" + Number(n || 0).toFixed(2);
// escHtml() comes from js/escape.js

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
    GROUP = res.group; GROUP_CODE = code; PRODUCTS = res.products || []; picks = [];
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
  GROUP = null; GROUP_CODE = ""; PRODUCTS = []; picks = [];
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
  $("s-intro").textContent = GROUP.intro || "Everything below is made just for your club. Pick what you need and check out when you're ready.";
  renderProducts();
  renderBasket();
  window.scrollTo(0,0);
}

/* Items that came from a range (e.g. "Dance range") sit together under the
   range's name. Anything that didn't come from a range comes first. The
   order within each group is unchanged. */
function orderByRange(list){
  const names = [];
  list.forEach(p => { const r = p.range_name || ""; if(!names.includes(r)) names.push(r); });
  names.sort((a,b) => (a === "" ? -1 : 0) - (b === "" ? -1 : 0));
  return names.flatMap(r => list.filter(p => (p.range_name || "") === r));
}

function renderProducts(){
  if(!PRODUCTS.length){
    $("s-products").innerHTML =
      `<p class="body dim" style="padding:0 20px">Nothing's been added to this shop yet. Give us a ring and we'll sort it.</p>`;
    return;
  }
  PRODUCTS = orderByRange(PRODUCTS);   // before the numbered ids below, so picks still match their item
  let lastRange = "";
  $("s-products").innerHTML = PRODUCTS.map((p,i) => {
    const sizes = (p.sizes||"").split(",").map(s=>s.trim()).filter(Boolean);
    const cols  = (p.colours||"").split(",").map(s=>s.trim()).filter(Boolean);
    const range = p.range_name || "";
    const heading = range && range !== lastRange
      ? `<h2 class="display-md" style="grid-column:1/-1;margin:40px 0 4px;padding:0 20px">${escHtml(range)}</h2>` : "";
    lastRange = range;
    return heading + `<div class="piece">
      ${p.image_url ? `<div class="imgwrap"><img loading="lazy" src="${escHtml(p.image_url)}" alt="${escHtml(p.name)}"></div>`
                    : `<div class="imgwrap noimg" style="aspect-ratio:3/4"><span>${escHtml(p.name)}</span></div>`}
      <h3>${escHtml(p.name)}</h3>
      ${p.price != null ? `<p style="color:var(--charcoal);font-family:var(--display);font-size:19px">${money(p.price)}</p>` : ""}
      ${p.description ? `<p>${escHtml(p.description)}</p>` : ""}
      ${sizes.length ? `<div class="fld"><label for="sz-${i}">Size</label>
        <select id="sz-${i}">${sizes.map(s=>`<option>${escHtml(s)}</option>`).join("")}</select></div>` : ""}
      ${cols.length ? `<div class="fld"><label for="co-${i}">Colour</label>
        <select id="co-${i}">${cols.map(s=>`<option>${escHtml(s)}</option>`).join("")}</select></div>` : ""}
      <div class="fld"><label for="qt-${i}">Quantity</label>
        <input id="qt-${i}" type="number" min="0" max="20" value="0" inputmode="numeric" onchange="renderBasket()"></div>
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
      // id/size/colour are what the server prices from; unit and opts are for display
      picks.push({ id:p.id, name:p.name, qty:q, unit:Number(p.price||0), opts:bits,
                   size: $("sz-"+i) ? $("sz-"+i).value : "", colour: $("co-"+i) ? $("co-"+i).value : "" });
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
    `<li><b>${p.qty} × ${escHtml(p.name)}${p.opts.length ? " · " + escHtml(p.opts.join(" · ")) : ""}</b>
     <span>${p.unit ? money(p.unit*p.qty) : "Price on confirmation"}</span></li>`).join("");
  const total = picks.reduce((s,p)=>s + p.unit*p.qty, 0);
  const allPriced = picks.every(p => p.unit > 0);
  const grand = renderDelivery(total, allPriced);   // js/club-delivery.js: fee, address box, totals
  $("s-total").textContent = allPriced ? money(grand) : "TBC";
  // Button and small print follow the basket: pay now, or send an enquiry
  $("s-send").textContent = allPriced ? "Pay " + money(grand) + " online" : "Send enquiry";
  const small = $("s-send").nextElementSibling;
  if(small) small.textContent = allPriced
    ? "Secure payment by Square. We check the prices on our side. Add your email to get a receipt."
    : "An item in your basket needs a price from us. Nothing is charged now. We'll confirm the price and send you a payment link.";
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
  const dv = readDelivery();
  if(dv.error){ note("s-notice","err",dv.error); return; }
  if(!name){ note("s-notice","err","We need your name."); return; }
  if(phone.length < 9){ note("s-notice","err","We need a phone number."); return; }
  if(!$("s-consent").checked){ note("s-notice","err","Please tick the box to say you're happy for us to use your details for this order."); return; }

  btn.disabled = true; note("s-notice","busy","Setting up your order…");

  try{
    const res = await fetch("/api/club-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        group: { slug: GROUP.slug, code: GROUP_CODE },
        items: picks.map(p => ({ product_id: p.id, qty: p.qty, size: p.size || undefined, colour: p.colour || undefined })),
        delivery: dv.delivery,
        customer: { name, phone, email: email || undefined },
        note: note_ || undefined
      })
    });
    const data = await res.json();

    if(res.ok && data.checkout_url){
      location.href = data.checkout_url;      // Square's own page; we never see card details
      return;
    }
    if(res.ok && data.enquiry){
      showDone(data.order_ref, true);
      btn.disabled = false; return;
    }
    // PCC-01x/02x = something the customer can fix; the server's message is written for them
    const friendly = res.status < 500 && /^PCC-0[12]\d$/.test(data.error || "");
    const code = data.error ? " (" + data.error + ")" : "";
    note("s-notice","err", friendly ? data.message : "That didn't go through. Please ring us on " + BRAND.phone + "." + code);
  }catch(e){
    note("s-notice","err","That didn't go through. Please ring us on " + BRAND.phone + ".");
  }
  btn.disabled = false;
}

/* Done screen for an enquiry (nothing paid). Paid orders land on track.html from Square. */
function showDone(ref, isEnquiry){
  $("s-ref").textContent = ref;
  $("s-tracklink").href = "track.html?ref=" + encodeURIComponent(ref);
  const label = $("s-done").querySelector(".label");
  if(label) label.textContent = isEnquiry ? "Enquiry sent" : "Order placed";
  clearNote("s-notice");
  $("s-checkout").style.display = "none";
  $("s-basketbox").style.display = "none";
  $("s-products").style.display = "none";
  $("s-done").style.display = "block";
  $("s-done").scrollIntoView({behavior:"smooth", block:"center"});
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
      if(res && res.ok){ GROUP = res.group; GROUP_CODE = saved.code; PRODUCTS = res.products || []; showShop(); }
    }
  }catch(e){}
});
