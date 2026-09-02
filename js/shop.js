/* ============================================================
   shop.js — public shop: browse, basket, pay by card.
   Checkout goes through /api/checkout (a Cloudflare Pages Function),
   never touches Supabase directly for payment - that keeps pricing
   and payment status out of the browser's hands entirely.
   ============================================================ */

let PRODUCTS = [], picks = [];
const $ = id => document.getElementById(id);
const money = n => "£" + Number(n || 0).toFixed(2);

function note(el, cls, msg){
  const n = $(el); n.className = "notice show " + cls; n.textContent = msg;
}
const clearNote = el => $(el).className = "notice";

function renderProducts(){
  if(!PRODUCTS.length){
    $("p-products").innerHTML =
      `<p class="body dim" style="padding:0 20px">Nothing's in the shop just yet — check back soon, or give us a ring.</p>`;
    return;
  }
  $("p-products").innerHTML = PRODUCTS.map((p,i) => {
    const sizes = (p.sizes||"").split(",").map(s=>s.trim()).filter(Boolean);
    const cols  = (p.colours||"").split(",").map(s=>s.trim()).filter(Boolean);
    return `<div class="piece">
      ${p.image_url ? `<div class="imgwrap"><img loading="lazy" src="${p.image_url}" alt="${p.name}"></div>`
                    : `<div class="imgwrap noimg" style="aspect-ratio:3/4"><span>${p.name}</span></div>`}
      <h3>${p.name}</h3>
      <p style="color:var(--charcoal);font-family:var(--display);font-size:19px">${money(p.price)}</p>
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
  const box = $("p-basketbox"), co = $("p-checkout");
  if(!picks.length){ box.style.display="none"; co.style.display="none"; return; }
  box.style.display = "block"; co.style.display = "block";
  $("p-basket").innerHTML = picks.map(p =>
    `<li><b>${p.qty} × ${p.name}${p.opts.length ? " · " + p.opts.join(" · ") : ""}</b>
     <span>${money(p.unit*p.qty)}</span></li>`).join("");
  const total = picks.reduce((s,p)=>s + p.unit*p.qty, 0);
  $("p-total").textContent = money(total);
}

/* ---------- checkout ---------- */
async function startShopCheckout(){
  collectPicks();
  const name  = $("p-cname").value.trim();
  const phone = $("p-cphone").value.trim();
  const email = $("p-cemail").value.trim();
  const note_ = $("p-cnote").value.trim();
  const btn   = $("p-pay");

  if(!picks.length){ note("p-notice","err","Choose at least one item."); return; }
  if(!name){ note("p-notice","err","We need your name."); return; }
  if(phone.length < 9){ note("p-notice","err","We need a phone number."); return; }

  btn.disabled = true; note("p-notice","busy","Setting up your payment…");

  try{
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: picks.map(p => ({
          name: p.opts.length ? `${p.name} (${p.opts.join(", ")})` : p.name,
          price: p.unit, qty: p.qty
        })),
        customer: { name, phone, email: email || undefined },
        note: note_ || undefined
      })
    });
    const data = await res.json();
    if(!res.ok || !data.checkout_url){
      note("p-notice","err","That didn't go through. Please ring us on " + BRAND.phone + ".");
      btn.disabled = false; return;
    }
    // Off to Square's own checkout page - we never see the card details.
    location.href = data.checkout_url;
  }catch(e){
    note("p-notice","err","That didn't go through. Please ring us on " + BRAND.phone + ".");
    btn.disabled = false;
  }
}

/* ---------- boot ---------- */
document.addEventListener("DOMContentLoaded", async () => {
  if(!(await healthCheck())) $("health").style.display = "block";
  try{
    PRODUCTS = await listShopProducts();
  }catch(e){ PRODUCTS = []; }
  renderProducts();
  renderBasket();
});
