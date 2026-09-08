/* ============================================================
   POST /api/checkout-instalments
   Same shape as /api/checkout, but instead of a single Square
   Checkout payment link, this creates a real Square Invoice split
   into 3 equal payments (today / +30 days / +60 days). Square emails
   the customer, reminds them automatically, and takes each payment
   through its own hosted page — nothing for us to chase manually.

   Body: { items: [{name, price, qty}], customer: {name, phone, email},
           note }

   Returns { checkout_url, order_ref } — checkout_url is the invoice's
   public payment page for the first instalment.
   ============================================================ */

function errorResponse(code, message, status) {
  return new Response(JSON.stringify({ error: code, message }), {
    status: status || 400,
    headers: { "Content-Type": "application/json" }
  });
}

function makeOrderRef() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let ref = "";
  for (let i = 0; i < 5; i++) ref += chars[Math.floor(Math.random() * chars.length)];
  return "PD-" + ref;
}

function isoDatePlusDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse("PSI-001", "Invalid JSON body");
  }

  const items = Array.isArray(body.items) ? body.items : [];
  const customer = body.customer || {};

  if (items.length === 0) return errorResponse("PSI-002", "Basket is empty");
  if (!customer.name || !customer.phone) return errorResponse("PSI-003", "Customer name and phone are required");

  let totalPence = 0;
  const lines = [];
  for (const item of items) {
    const price = Number(item.price);
    const qty = Number(item.qty) || 1;
    if (!item.name || !Number.isFinite(price) || price <= 0 || qty <= 0) {
      return errorResponse("PSI-004", "Every item needs a name, a positive price, and a quantity");
    }
    totalPence += Math.round(price * 100) * qty;
    lines.push(`${qty} x ${item.name}`);
  }
  // Square requires whole-percentage splits that sum to 100 exactly.
  // 34% + 33% + 33% avoids rounding leftovers.

  if (!env.SQUARE_ACCESS_TOKEN || !env.SQUARE_LOCATION_ID) {
    return errorResponse("PSI-005", "Payments aren't configured yet - Square credentials are missing", 503);
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return errorResponse("PSI-006", "Database isn't configured", 503);
  }

  const orderRef = makeOrderRef();
  const description = lines.join(", ");
  const squareName = items.length === 1
    ? items[0].name
    : `Peach State order (${items.length} items)`;

  const headers = {
    "Square-Version": "2026-08-19",
    "Authorization": `Bearer ${env.SQUARE_ACCESS_TOKEN}`,
    "Content-Type": "application/json"
  };

  try {
    // 1. Square customer record (so the invoice has someone to bill)
    const [firstName, ...rest] = customer.name.trim().split(/\s+/);
    const custRes = await fetch("https://connect.squareup.com/v2/customers", {
      method: "POST", headers,
      body: JSON.stringify({
        given_name: firstName,
        family_name: rest.join(" ") || undefined,
        phone_number: customer.phone,
        email_address: customer.email || undefined
      })
    });
    const custData = await custRes.json();
    if (!custRes.ok) return errorResponse("PSI-007", custData?.errors?.[0]?.detail || "Couldn't set up the invoice", 502);
    const customerId = custData.customer.id;

    // 2. Square order (the invoice needs one to attach to)
    const orderRes = await fetch("https://connect.squareup.com/v2/orders", {
      method: "POST", headers,
      body: JSON.stringify({
        idempotency_key: crypto.randomUUID(),
        order: {
          location_id: env.SQUARE_LOCATION_ID,
          line_items: [{ name: squareName, quantity: "1", base_price_money: { amount: totalPence, currency: "GBP" } }]
        }
      })
    });
    const orderData = await orderRes.json();
    if (!orderRes.ok) return errorResponse("PSI-008", orderData?.errors?.[0]?.detail || "Couldn't set up the invoice", 502);
    const squareOrderId = orderData.order.id;

    // 3. Invoice split into 3 payments: today, +30 days, +60 days
    const invRes = await fetch("https://connect.squareup.com/v2/invoices", {
      method: "POST", headers,
      body: JSON.stringify({
        idempotency_key: crypto.randomUUID(),
        invoice: {
          location_id: env.SQUARE_LOCATION_ID,
          order_id: squareOrderId,
          primary_recipient: { customer_id: customerId },
          payment_requests: [
            { request_type: "INSTALLMENT", due_date: isoDatePlusDays(0), percentage_requested: "34" },
            { request_type: "INSTALLMENT", due_date: isoDatePlusDays(30), percentage_requested: "33" },
            { request_type: "INSTALLMENT", due_date: isoDatePlusDays(60), percentage_requested: "33" }
          ],
          delivery_method: customer.email ? "EMAIL" : "SHARE_MANUALLY",
          accepted_payment_methods: { card: true },
          title: "Peach State — school uniform (3 payments)",
          description: description + (body.note ? ` — ${body.note}` : "")
        }
      })
    });
    const invData = await invRes.json();
    if (!invRes.ok) return errorResponse("PSI-009", invData?.errors?.[0]?.detail || "Couldn't set up the payment plan", 502);

    // 4. Publish it — this is what actually makes it payable/sendable
    const pubRes = await fetch(`https://connect.squareup.com/v2/invoices/${invData.invoice.id}/publish`, {
      method: "POST", headers,
      body: JSON.stringify({ version: invData.invoice.version, idempotency_key: crypto.randomUUID() })
    });
    const pubData = await pubRes.json();
    if (!pubRes.ok || !pubData.invoice?.public_url) {
      return errorResponse("PSI-010", pubData?.errors?.[0]?.detail || "Couldn't send the payment plan", 502);
    }

    // 5. Record the pending order, same as the normal checkout path
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
        p_customer_email: customer.email || null,
        p_description: description + (body.note ? ` — ${body.note}` : "") + " · 3-payment plan",
        p_total: totalPence / 100,
        p_square_order_id: squareOrderId
      })
    });
    if (!dbRes.ok) {
      return errorResponse("PSI-011", "Payment plan created but the order couldn't be saved - contact the studio", 500);
    }

    return new Response(JSON.stringify({
      checkout_url: pubData.invoice.public_url,
      order_ref: orderRef
    }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return errorResponse("PSI-999", "That didn't go through - please ring us", 502);
  }
}
// redeploy-trigger 2026-09-08T15:06:00Z
