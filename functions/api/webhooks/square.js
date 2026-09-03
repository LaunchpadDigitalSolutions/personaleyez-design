/* ============================================================
   POST /api/webhooks/square
   Square calls this when a payment completes. We verify it's really
   Square before trusting a single word of it, then flip the matching
   pending order to a live one.

   Signature: base64(HMAC-SHA256(signature_key, notification_url + raw_body))
   https://developer.squareup.com/docs/webhooks/step3validate
   ============================================================ */

import { sendEmail, customerEmailFor, ownerNewOrderEmail, ownerEmail } from "../lib/resend.js";

async function isValidSignature(signatureKey, notificationUrl, rawBody, receivedSignature) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signatureKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(notificationUrl + rawBody));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));

  // Constant-time-ish compare - lengths must match first, then compare
  // every character rather than short-circuiting on the first mismatch.
  if (expected.length !== receivedSignature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ receivedSignature.charCodeAt(i);
  }
  return diff === 0;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.SQUARE_WEBHOOK_SIGNATURE_KEY) {
    return new Response("PSC-101: webhook not configured", { status: 503 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-square-hmacsha256-signature") || "";
  const notificationUrl = "https://peachstate.co.uk/api/webhooks/square";

  const valid = await isValidSignature(env.SQUARE_WEBHOOK_SIGNATURE_KEY, notificationUrl, rawBody, signature);
  if (!valid) {
    return new Response("PSC-102: bad signature", { status: 400 });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("PSC-103: bad JSON", { status: 400 });
  }

  // Only act on a completed payment - everything else (APPROVED, PENDING,
  // FAILED, CANCELED) is ignored here.
  const payment = event?.data?.object?.payment;
  if (event.type !== "payment.updated" || !payment || payment.status !== "COMPLETED") {
    return new Response("ok - ignored", { status: 200 });
  }

  const squareOrderId = payment.order_id;
  const amount = (payment.amount_money?.amount || 0) / 100;

  if (!squareOrderId) {
    return new Response("PSC-104: no order_id on payment", { status: 400 });
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return new Response("PSC-105: database not configured", { status: 503 });
  }

  const dbRes = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/ps_checkout_mark_paid`, {
    method: "POST",
    headers: {
      "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
      "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ p_square_order_id: squareOrderId, p_amount: amount })
  });

  if (!dbRes.ok) {
    // Square retries failed webhooks, so a 500 here means it'll try again
    // rather than silently losing the payment update.
    return new Response("PSC-106: couldn't update order", { status: 500 });
  }

  // Fire off both emails - these never affect whether the payment itself
  // succeeded, so failures here are logged and swallowed, not thrown.
  const order = await dbRes.json();
  if (order && order.order_ref) {
    const customerTpl = customerEmailFor("enquiry", order);
    if (customerTpl && order.customer_email) {
      await sendEmail(env, { to: order.customer_email, ...customerTpl });
    }
    const ownerTpl = ownerNewOrderEmail(order);
    await sendEmail(env, { to: ownerEmail(env), ...ownerTpl });
  }

  return new Response("ok", { status: 200 });
}
