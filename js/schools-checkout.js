/* ============================================================
   schools-checkout.js — dedicated checkout page for school
   uniform orders. Basket is handed off from schools-shop.js via
   sessionStorage rather than carried in a URL, since a full
   uniform order can run to a dozen+ lines with size/colour/
   embroidery notes attached to each.

   Prices shown here are for display only. What we send is WHICH
   product, how many, size/colour and initials yes/no; the server
   looks up every price itself (functions/_lib/pricing.js).
   ============================================================ */

let basket = [], schoolName = "";
const $ = id => document.getElementById(id);
const money = n => "£" + Number(n || 0).toFixed(2);
const PHONE_FALLBACK = () => "That didn't go through. Please ring us on " + BRAND.phone + ".";
const STALE_MSG = "We've updated the shop, so please choose your uniform again.";

function note(el, cls, msg){
  const n = $(el); n.className = "notice show " + cls; n.textContent = msg;
}

function showEmpty(msg){
  sessionStorage.removeItem("su_basket");
  $("suc-content").style.display = "none";
  $("suc-empty").style.display = "block";
  if(msg){
    const p = document.createElement("p");
    p.className = "body"; p.style.fontWeight = "500"; p.textContent = msg;
    $("suc-empty").insertBefore(p, $("suc-empty").firstChild);
  }
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
  if(!basket.length){ showEmpty(); return; }
  sessionStorage.setItem("su_basket", JSON.stringify(basket));
  renderOrder();
}

/* One path for both buttons: same checks, same payload, different endpoint. */
async function submitOrder(endpoint, btnId, busyMsg){
  const name  = $("suc-cname").value.trim();
  const phone = $("suc-cphone").value.trim();
  const email = $("suc-cemail").value.trim();
  const btn   = $(btnId);

  if(!name){ note("suc-notice", "err", "We need your name."); return; }
  if(phone.length < 9){ note("suc-notice", "err", "We need a phone number."); return; }
  if(!$("suc-consent").checked){ note("suc-notice", "err", "Please tick the box to say you're happy for us to use your details for this order."); return; }

  btn.disabled = true; note("suc-notice", "busy", busyMsg);
  try{
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: basket.map(b => ({ product_id: b.id, qty: b.qty, size: b.size || undefined, colour: b.colour || undefined, initials: !!b.initials,
          name: b.name, price: b.unit })),   // name/price: legacy fields, ignored by the server (needed only until it is upgraded)
        customer: { name, phone, email: email || undefined },
        note: schoolName || undefined
      })
    });
    const data = await res.json();
    if(!res.ok || !data.checkout_url){
      // 02x = something the customer can fix (the server's message is written for them)
      const friendly = res.status < 500 && /^PS[CI]-02\d$/.test(data.error || "");
      note("suc-notice", "err", friendly ? data.message : PHONE_FALLBACK());
      btn.disabled = false; return;
    }
    sessionStorage.removeItem("su_basket");
    location.href = data.checkout_url;
  }catch(e){
    note("suc-notice", "err", PHONE_FALLBACK());
    btn.disabled = false;
  }
}

const startUniformCheckout    = () => submitOrder("/api/checkout", "suc-pay", "Setting up your payment…");
const startInstalmentCheckout = () => submitOrder("/api/checkout-instalments", "suc-spread", "Setting up your payment plan…");

document.addEventListener("DOMContentLoaded", async () => {
  if(!(await healthCheck())) $("health").style.display = "block";
  try{ basket = JSON.parse(sessionStorage.getItem("su_basket") || "[]"); }
  catch(e){ basket = []; }
  schoolName = sessionStorage.getItem("su_school") || "";

  if(!basket.length){
    $("suc-empty").style.display = "block";
    return;
  }
  // A basket saved before the shop sent product ids can't be priced: empty it, say why.
  if(basket.some(b => !b || !b.id)){ basket = []; showEmpty(STALE_MSG); return; }
  $("suc-content").style.display = "block";
  renderOrder();
});
