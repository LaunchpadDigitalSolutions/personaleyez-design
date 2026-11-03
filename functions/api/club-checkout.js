/* ============================================================
   POST /api/club-checkout
   Club / team shop orders. Replaces the old browser-side order insert,
   which took no payment, sent no email and trusted prices from the
   browser.

   Body: { group: {slug, code},
           items: [{product_id, qty, size?, colour?}],
           customer: {name, phone, email?}, note? }

   - Club name + access code are checked here. Prices come from the
     database; any price or name from the browser is ignored.
   - Every item priced -> Square payment link, order saved as
     pending_payment, returns { checkout_url, order_ref }. The Square
     webhook marks it paid and emails Jo and the customer.
   - Any item without a price -> saved as an enquiry, Jo is emailed,
     returns { enquiry: true, order_ref }. Nothing is charged.
   Error codes PCC-xxx (010 club/code, 02x customer fixable, 03x server).
   ============================================================ */
import { OrderError, validateCustomer, clean } from "../_lib/pricing.js";
import { makeClubLookup, validateClub, priceClubBasket } from "../_lib/club-order.js";

const EMAIL_FROM = "Peach State <orders@peachstate.co.uk>";

function errorResponse(code, message, status) {
  return new Response(JSON.stringify({ error: code, message }), {
    status: status || 400, headers: { "Content-Type": "application/json" }
  });
}

function makeOrderRef() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let ref = "";
  for (let i = 0; i < 5; i++) ref += chars[Math.floor(Math.random() * chars.length)];
  return "PD-" + ref;
}

/* Email helpers are inlined (see webhooks/square.js for why). */
async function sendEmail(env, { to, subject, html }) {
  if (!env.RESEND_API_KEY) { console.error("PSE-001: RESEND_API_KEY not configured"); return false; }
  if (!to) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ from: EMAIL_FROM, to, subject, html })
    });
    if (!res.ok) { console.error("PSE-002", res.status, await res.text()); return false; }
    return true;
  } catch (e) { console.error("PSE-003", e.message); return false; }
}

const wrap = body => `
  <div style="font-family:Georgia,serif;max-width:480px;margin:0 auto;padding:24px;color:#3a3a2e">
    <h2 style="color:#8a9a7e;margin:0 0 16px">Peach State</h2>
    ${body}
    <p style="margin-top:32px;font-size:13px;color:#999">Personalised Design · peachstate.co.uk</p>
  </div>`;

async function emailEnquiry(env, order, clubName, customer) {
  const owner = env.OWNER_NOTIFY_EMAIL || "info@peachstate.co.uk";
  await sendEmail(env, {
    to: owner,
    subject: `New club enquiry — ${order.order_ref} (${clubName})`,
    html: wrap(`<p>New club enquiry, nothing paid yet (an item needs a price):</p>
      <p><strong>${order.order_ref}</strong> — ${clubName}</p>
      <p>${customer.name} (${customer.phone}${customer.email ? ", " + customer.email : ""})</p>
      <p>${order.description || ""}</p>
      ${customer.note ? `<p>Note: ${customer.note}</p>` : ""}`)
  });
  if (customer.email) {
    await sendEmail(env, {
      to: customer.email,
      subject: `Enquiry received — ${order.order_ref}`,
      html: wrap(`<p>Hi ${customer.name},</p>
        <p>Thanks — we've got your enquiry <strong>${order.order_ref}</strong>. Nothing has been charged.</p>
        <p>${order.description || ""}</p>
        <p>We'll confirm the price and send you a payment link.</p>`)
    });
  }
}

async function saveOrder(env, row) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/ps_club_create_order`, {
    method: "POST",
    headers: { "apikey": env.SUPABASE_SERVICE_ROLE_KEY, "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(row)
  });
  if (!res.ok) return null;
  return res.json();
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try { body = await request.json(); } catch { return errorResponse("PCC-001", "Invalid JSON body"); }
  if (!body || typeof body !== "object") return errorResponse("PCC-001", "Invalid JSON body");

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return errorResponse("PCC-006", "Database isn't configured", 503);

  let customer, club, result;
  try {
    customer = validateCustomer("PCC", body.customer, body.note);
    club = validateClub(body.group);
    result = await priceClubBasket(club, body.items, makeClubLookup(env, club.slug, club.code));
  } catch (e) {
    if (e instanceof OrderError) return errorResponse(e.code, e.message, e.status);
    return errorResponse("PCC-999", "That didn't go through - please ring us", 500);
  }

  const group = result.group;
  const clubName = clean(group.name);
  const orderRef = makeOrderRef();
  const notes = (customer.note ? customer.note + " · " : "") + clubName;
  const base = {
    p_order_ref: orderRef, p_customer_name: customer.name, p_customer_phone: customer.phone,
    p_customer_email: customer.email, p_notes: notes, p_group_id: group.id, p_group_slug: group.slug
  };

  /* Enquiry: some item has no price yet. Save, email Jo, nothing charged. */
  if (result.kind === "enquiry") {
    const description = `${clubName}: ${result.description}`;
    const order = await saveOrder(env, { ...base, p_status: "enquiry", p_description: description, p_quantity: result.quantity, p_total: null, p_square_order_id: null });
    if (!order) return errorResponse("PCC-009", "That didn't go through - please ring us", 500);
    await emailEnquiry(env, order, clubName, customer);
    return new Response(JSON.stringify({ enquiry: true, order_ref: orderRef }), { headers: { "Content-Type": "application/json" } });
  }

  /* Priced: Square payment link first, then the pending order. */
  if (!env.SQUARE_ACCESS_TOKEN || !env.SQUARE_LOCATION_ID) {
    return errorResponse("PCC-005", "Payments aren't configured yet - Square credentials are missing", 503);
  }
  const { totalPence, description, squareName } = result.priced;
  const fullDescription = `${clubName}: ${description}` + (customer.note ? ` — ${customer.note}` : "");

  let squareRes, squareData;
  try {
    squareRes = await fetch("https://connect.squareup.com/v2/online-checkout/payment-links", {
      method: "POST",
      headers: { "Square-Version": "2026-08-19", "Authorization": `Bearer ${env.SQUARE_ACCESS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        idempotency_key: crypto.randomUUID(),
        quick_pay: { name: squareName, price_money: { amount: totalPence, currency: "GBP" }, location_id: env.SQUARE_LOCATION_ID },
        payment_note: orderRef,
        checkout_options: { redirect_url: `https://peachstate.co.uk/track.html?ref=${orderRef}` }
      })
    });
    squareData = await squareRes.json();
  } catch { return errorResponse("PCC-007", "Couldn't reach Square", 502); }
  if (!squareRes.ok || !squareData.payment_link) {
    return errorResponse("PCC-008", squareData?.errors?.[0]?.detail || "Square rejected the payment link", 502);
  }

  const quantity = result.priced.lines.reduce((s, l) => s + l.qty, 0);
  const order = await saveOrder(env, { ...base, p_status: "pending_payment", p_description: fullDescription, p_quantity: quantity, p_total: totalPence / 100, p_square_order_id: squareData.payment_link.order_id });
  if (!order) return errorResponse("PCC-009", "Payment link created but the order couldn't be saved - contact the studio", 500);

  return new Response(JSON.stringify({ checkout_url: squareData.payment_link.url, order_ref: orderRef }), { headers: { "Content-Type": "application/json" } });
}
