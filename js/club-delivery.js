/* ============================================================
   club-delivery.js — collection / delivery choice on club shops.
   Display only. The server (functions/_lib/club-order.js) works out the
   real fee and charges it; nothing here is trusted.
   Uses $ and money() from clubs.js.
   ============================================================ */

// Keep in step with DELIVERY in functions/_lib/club-order.js
const DELIVERY = { feePence: 499, freeFromPence: 15000 };

function deliveryMethod(){
  const d = $("s-m-d");
  return d && d.checked ? "delivery" : "collection";
}

function deliveryFeePence(method, subtotalPence){
  return method === "delivery" && subtotalPence < DELIVERY.freeFromPence ? DELIVERY.feePence : 0;
}

/* Redraws the choice, address box and totals for this basket.
   Returns the grand total in pounds, or null when an item has no price. */
function renderDelivery(subtotal, allPriced){
  const method = deliveryMethod();
  const subP = Math.round(subtotal * 100);
  const free = subP >= DELIVERY.freeFromPence;
  const feeP = deliveryFeePence(method, subP);

  $("s-oc").classList.toggle("on", method === "collection");
  $("s-od").classList.toggle("on", method === "delivery");
  $("s-addr").style.display = method === "delivery" ? "block" : "none";
  $("s-dnote").textContent = !allPriced ? "We'll confirm the fee with your price"
                          : free ? "Free, your order is £150 or more" : "Free on orders of £150 or more";
  $("s-dfee").textContent = !allPriced ? "TBC" : free ? "Free" : money(DELIVERY.feePence / 100);

  if(!allPriced){ $("s-totals").innerHTML = ""; return null; }
  const grand = (subP + feeP) / 100;
  $("s-totals").innerHTML =
    `<li><b>Items</b><span>${money(subtotal)}</span></li>` +
    `<li><b>Delivery</b><span>${method === "collection" ? "Free (collection)" : feeP ? money(feeP / 100) : "Free"}</span></li>` +
    `<li><b>Total</b><span>${money(grand)}</span></li>`;
  return grand;
}

/* Reads the choice and address. Returns {delivery} to send, or {error} to show. */
function readDelivery(){
  const method = deliveryMethod();
  if(method === "collection") return { delivery: { method } };
  const address = { line1: $("s-a1").value.trim(), town: $("s-a2").value.trim(), postcode: $("s-a3").value.trim() };
  if(address.line1.length < 3 || address.town.length < 2) return { error: "Enter your delivery address." };
  if(!/^[A-Za-z]{1,2}\d[A-Za-z\d]?\s*\d[A-Za-z]{2}$/.test(address.postcode)) return { error: "Check your postcode." };
  return { delivery: { method, address } };
}
