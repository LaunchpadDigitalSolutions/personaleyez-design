/* ============================================================
   schools-checkout.js — dedicated checkout page for school
   uniform orders. Basket is handed off from schools-shop.js via
   sessionStorage rather than carried in a URL, since a full
   uniform order can run to a dozen+ lines with size/colour/
   embroidery notes attached to each.
   ============================================================ */

let basket = [], schoolName = "";
const $ = id => document.getElementById(id);
const money = n => "£" + Number(n || 0).toFixed(2);

function note(el, cls, msg){
  const n = $(el); n.className = "notice show " + cls; n.textContent = msg;
}

function renderOrder(){
  $("suc-basket").innerHTML = basket.map((b, i) =>
    `<li style="display:flex;justify-content:space-between;align-items:center;gap:12px">
      <span><b>${b.qty} × ${b.name} · ${b.opts.join(" · ")}</b></span>
      <span style="display:flex;align-items:center;gap:14px;white-space:nowrap">
        ${money(b.unit * b.qty)}
        <button onclick="removeItem(${i})" style="min-height:auto;padding:0;border:none;background:none;font-size:12px;text-decoration:underline;color:var(--muted);cursor:pointer">Remove</button>
      </span>
    </li>`).join("");
  const total = basket.reduce((s, b) => s + b.unit * b.qty, 0);
  $("suc-total").textContent = money(total);
}

function removeItem(i){
  basket.splice(i, 1);
  if(!basket.length){
    sessionStorage.removeItem("su_basket");
    $("suc-content").style.display = "none";
    $("suc-empty").style.display = "block";
    return;
  }
  sessionStorage.setItem("su_basket", JSON.stringify(basket));
  renderOrder();
}

async function startUniformCheckout(){
  const name  = $("suc-cname").value.trim();
  const phone = $("suc-cphone").value.trim();
  const email = $("suc-cemail").value.trim();
  const btn   = $("suc-pay");

  if(!name){ note("suc-notice", "err", "We need your name."); return; }
  if(phone.length < 9){ note("suc-notice", "err", "We need a phone number."); return; }
  if(!$("suc-consent").checked){ note("suc-notice", "err", "Please tick the box to say you're happy for us to use your details for this order."); return; }

  btn.disabled = true; note("suc-notice", "busy", "Setting up your payment…");
  try{
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: basket.map(b => ({ name: `${b.name} (${b.opts.join(", ")})`, price: b.unit, qty: b.qty })),
        customer: { name, phone, email: email || undefined },
        note: schoolName || undefined
      })
    });
    const data = await res.json();
    if(!res.ok || !data.checkout_url){
      note("suc-notice", "err", "That didn't go through. Please ring us on " + BRAND.phone + ".");
      btn.disabled = false; return;
    }
    sessionStorage.removeItem("su_basket");
    location.href = data.checkout_url;
  }catch(e){
    note("suc-notice", "err", "That didn't go through. Please ring us on " + BRAND.phone + ".");
    btn.disabled = false;
  }
}

async function startInstalmentCheckout(){
  const name  = $("suc-cname").value.trim();
  const phone = $("suc-cphone").value.trim();
  const email = $("suc-cemail").value.trim();
  const btn   = $("suc-spread");

  if(!name){ note("suc-notice", "err", "We need your name."); return; }
  if(phone.length < 9){ note("suc-notice", "err", "We need a phone number."); return; }
  if(!$("suc-consent").checked){ note("suc-notice", "err", "Please tick the box to say you're happy for us to use your details for this order."); return; }

  btn.disabled = true; note("suc-notice", "busy", "Setting up your payment plan…");
  try{
    const res = await fetch("/api/checkout-instalments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: basket.map(b => ({ name: `${b.name} (${b.opts.join(", ")})`, price: b.unit, qty: b.qty })),
        customer: { name, phone, email: email || undefined },
        note: schoolName || undefined
      })
    });
    const data = await res.json();
    if(!res.ok || !data.checkout_url){
      note("suc-notice", "err", "That didn't go through. Please ring us on " + BRAND.phone + ".");
      btn.disabled = false; return;
    }
    sessionStorage.removeItem("su_basket");
    location.href = data.checkout_url;
  }catch(e){
    note("suc-notice", "err", "That didn't go through. Please ring us on " + BRAND.phone + ".");
    btn.disabled = false;
  }
}

async function placeUniformOrder(){
  const name  = $("suc-cname").value.trim();
  const phone = $("suc-cphone").value.trim();
  const email = $("suc-cemail").value.trim();
  const btn   = $("suc-order");

  if(!name){ note("suc-notice", "err", "We need your name."); return; }
  if(phone.length < 9){ note("suc-notice", "err", "We need a phone number."); return; }
  if(!$("suc-consent").checked){ note("suc-notice", "err", "Please tick the box to say you're happy for us to use your details for this order."); return; }

  btn.disabled = true; note("suc-notice", "busy", "Placing your order…");
  const total = basket.reduce((s, b) => s + b.unit * b.qty, 0);
  const desc  = basket.map(b => `${b.qty} × ${b.name}${b.opts.length ? " (" + b.opts.join(", ") + ")" : ""}`).join("; ");

  try{
    const o = await createOrder({
      customer_name: name, customer_phone: phone, customer_email: email || null,
      category: "school", description: desc,
      quantity: basket.reduce((s, b) => s + b.qty, 0),
      quoted_total: total || null,
      notes: schoolName || null,
      status: "enquiry"
    });
    sessionStorage.removeItem("su_basket");
    $("suc-ref").textContent = o.order_ref;
    $("suc-tracklink").href = "track.html?ref=" + o.order_ref;
    $("suc-content").style.display = "none";
    $("suc-done").style.display = "block";
    $("suc-done").scrollIntoView({behavior:"smooth", block:"center"});
  }catch(e){
    note("suc-notice", "err", "That didn't go through. Please ring us on " + BRAND.phone + ".");
  }
  btn.disabled = false;
}

document.addEventListener("DOMContentLoaded", async () => {
  if(!(await healthCheck())) $("health").style.display = "block";
  try{ basket = JSON.parse(sessionStorage.getItem("su_basket") || "[]"); }
  catch(e){ basket = []; }
  schoolName = sessionStorage.getItem("su_school") || "";

  if(!basket.length){
    $("suc-empty").style.display = "block";
    return;
  }
  $("suc-content").style.display = "block";
  renderOrder();
});
