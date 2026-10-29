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

/* Both payment buttons share this. The browser sends product ids, quantities and
   options only; the server prices everything (functions/api/checkout*.js). */
async function submitOrder(url, btnId, busyMsg){
  const name  = $("suc-cname").value.trim();
  const phone = $("suc-cphone").value.trim();
  const email = $("suc-cemail").value.trim();
  const btn   = $(btnId);

  if(!name){ note("suc-notice", "err", "We need your name."); return; }
  if(phone.length < 9){ note("suc-notice", "err", "We need a phone number."); return; }
  if(!$("suc-consent").checked){ note("suc-notice", "err", "Please tick the box to say you're happy for us to use your details for this order."); return; }

  btn.disabled = true; note("suc-notice", "busy", busyMsg);
  try{
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // product_id/qty/size/colour/initials is what the server prices from. name/price are legacy
        // (current server reads them until the Job 15 server change deploys; the new one ignores them).
        items: basket.map(b => ({ product_id: b.id, qty: b.qty, size: b.size || undefined, colour: b.colour || undefined, initials: b.initials || undefined,
          name: `${b.name} (${b.opts.join(", ")})`, price: b.unit })),
        customer: { name, phone, email: email || undefined },
        note: schoolName || undefined
      })
    });
    const data = await res.json();
    if(!res.ok || !data.checkout_url){
      if(data && data.refresh){ clearStaleBasket(data.message); return; }   // basket out of date: start clean
      note("suc-notice", "err", data && data.message && res.status < 500 ? data.message : "That didn't go through. Please ring us on " + BRAND.phone + ".");
      btn.disabled = false; return;
    }
    sessionStorage.removeItem("su_basket");
    location.href = data.checkout_url;
  }catch(e){
    note("suc-notice", "err", "That didn't go through. Please ring us on " + BRAND.phone + ".");
    btn.disabled = false;
  }
}

const startUniformCheckout   = () => submitOrder("/api/checkout", "suc-pay", "Setting up your payment…");
const startInstalmentCheckout = () => submitOrder("/api/checkout-instalments", "suc-spread", "Setting up your payment plan…");

/* A basket saved before prices moved to the server has no product ids.
   Empty it with a clear message rather than fail at the payment step. */
function clearStaleBasket(msg){
  basket = [];
  sessionStorage.removeItem("su_basket");
  $("suc-content").style.display = "none";
  $("suc-empty").style.display = "block";
  let n = $("suc-stale");
  if(!n){
    n = document.createElement("p"); n.id = "suc-stale"; n.className = "body";
    $("suc-empty").insertBefore(n, $("suc-empty").firstChild);
  }
  n.textContent = msg || "Your order was out of date, so we've emptied it. Please add your items again.";
}

document.addEventListener("DOMContentLoaded", async () => {
  if(!(await healthCheck())) $("health").style.display = "block";
  try{ basket = JSON.parse(sessionStorage.getItem("su_basket") || "[]"); }
  catch(e){ basket = []; }
  schoolName = sessionStorage.getItem("su_school") || "";

  if(basket.length && basket.some(b => !b.id)){
    clearStaleBasket("Your order was saved before we updated the shop, so we've emptied it. Please add your items again.");
    return;
  }
  if(!basket.length){
    $("suc-empty").style.display = "block";
    return;
  }
  $("suc-content").style.display = "block";
  renderOrder();
});
