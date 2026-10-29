/* ============================================================
   POST /api/checkout
   Turns a cart into a Square-hosted payment page.

   Body: { items: [{product_id, qty, size?, colour?, initials?}],
           customer: {name, phone, email}, note }

   - PRICES NEVER COME FROM THE BROWSER. The browser sends which
     product, how many and which options; every price, name and
     add-on amount is looked up here (lib/price-basket.js).
   - A pending order (PD-XXXXX) is created in ps_orders before we ever
     talk to Square, so nothing is lost if the customer abandons payment
     partway through.
   - Returns { checkout_url, order_ref } for the caller to redirect to.
   ============================================================ */

import { priceBasket, cleanCustomer, priceErrorResponse, PriceError } from "../../lib/price-basket.js";

function errorResponse(code, message, status) {
  return new Response(JSON.stringify({ error: code, message }), {
    status: status || 400,
    headers: { "Content-Type": "application/json" }
  });
}

function makeOrderRef() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I - matches admin's existing refs
  let ref = "";
  for (let i = 0; i < 5; i++) ref += chars[Math.floor(Math.random() * chars.length)];
  return "PD-" + ref;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    const raw = await request.text();
    if (raw.length > 20000) return errorResponse("PSC-018", "That order is too large", 413);
    body = JSON.parse(raw);
  } catch {
    return errorResponse("PSC-001", "Invalid JSON body");
  }
  if (!body || typeof body !== "object") return errorResponse("PSC-001", "Invalid JSON body");

  if (!env.SQUARE_ACCESS_TOKEN || !env.SQUARE_LOCATION_ID) {
    return errorResponse("PSC-005", "Payments aren't configured yet - Square credentials are missing", 503);
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return errorResponse("PSC-006", "Database isn't configured", 503);
  }

  let customer, priced;
  try {
    customer = cleanCustomer(body.customer, body.note, "PSC");
    priced = await priceBasket(body.items, env, "PSC", fetch);
  } catch (e) {
    if (e instanceof PriceError) return priceErrorResponse(e);
    return errorResponse("PSC-999", "That didn't go through - please ring us", 500);
  }
  const totalPence = priced.totalPence;

  const orderRef = makeOrderRef();
  const description = priced.description;

  // Square Payment Links - quick_pay only takes one name+price, so a
  // multi-item cart is summarised as one line; the itemised breakdown
  // lives in our own order record for Jo to see in admin.
  const squareName = priced.squareName;

  let squareRes, squareData;
  try {
    squareRes = await fetch("https://connect.squareup.com/v2/online-checkout/payment-links", {
      method: "POST",
      headers: {
        "Square-Version": "2026-08-19",
        "Authorization": `Bearer ${env.SQUARE_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        idempotency_key: crypto.randomUUID(),
        quick_pay: {
          name: squareName,
          price_money: { amount: totalPence, currency: "GBP" },
          location_id: env.SQUARE_LOCATION_ID
        },
        payment_note: orderRef,
        checkout_options: {
          redirect_url: `https://peachstate.co.uk/track.html?ref=${orderRef}`
        }
      })
    });
    squareData = await squareRes.json();
  } catch {
    return errorResponse("PSC-007", "Couldn't reach Square", 502);
  }

  if (!squareRes.ok || !squareData.payment_link) {
    return errorResponse("PSC-008", squareData?.errors?.[0]?.detail || "Square rejected the payment link", 502);
  }

  const squareOrderId = squareData.payment_link.order_id;

  // Now record the pending order - after Square succeeds, so we always
  // have a real checkout_url to store it against.
  const dbRes = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/ps_checkout_create_pending`, {
    method: "POST",
    headers: {
      "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
      "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      p_order_ref: orderRef,
      p_customer_name: customer.name,
      p_customer_phone: customer.phone,
      p_customer_email: customer.email,
      p_description: description + (customer.note ? ` — ${customer.note}` : ""),
      p_total: totalPence / 100,
      p_square_order_id: squareOrderId
    })
  });

  if (!dbRes.ok) {
    return errorResponse("PSC-009", "Payment link created but the order couldn't be saved - contact the studio", 500);
  }

  return new Response(JSON.stringify({
    checkout_url: squareData.payment_link.url,
    order_ref: orderRef
  }), { headers: { "Content-Type": "application/json" } });
}
