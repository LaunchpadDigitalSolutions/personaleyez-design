/* ============================================================
   POST /api/webhooks/square
   Square calls this when a payment completes. We verify it's really
   Square before trusting a single word of it, then flip the matching
   pending order to a live one.

   Signature: base64(HMAC-SHA256(signature_key, notification_url + raw_body))
   https://developer.squareup.com/docs/webhooks/step3validate

   Email-sending helpers are inlined here (and in notify-status.js)
   rather than imported from a shared file - Cloudflare's zero-config
   Pages Functions build can't resolve imports to non-route sibling
   files, so a shared module silently breaks every deploy.
   ============================================================ */

const EMAIL_FROM = "Peach State <orders@peachstate.co.uk>";

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

function ownerEmail(env) {
  return env.OWNER_NOTIFY_EMAIL || "info@peachstate.co.uk";
}

const EMAIL_WRAP = body => `
  <div style="font-family:Georgia,serif;max-width:480px;margin:0 auto;padding:24px;color:#3a3a2e">
    <h2 style="color:#8a9a7e;margin:0 0 16px">Peach State</h2>
    ${body}
    <p style="margin-top:32px;font-size:13px;color:#999">Personalised Design · peachstate.co.uk</p>
  </div>`;

function customerEmailFor(status, order) {
  const ref = order.order_ref;
  const templates = {
    enquiry: {
      subject: `Order received — ${ref}`,
      html: EMAIL_WRAP(`
        <p>Hi ${order.customer_name || "there"},</p>
        <p>Thanks — we've received your order <strong>${ref}</strong> and it's now in our queue.</p>
        <p>${order.description || ""}</p>
        <p>We'll email you again once it's in production, and again when it's ready to collect.</p>`)
    },
    in_production: {
      subject: `Your order is in production — ${ref}`,
      html: EMAIL_WRAP(`
        <p>Hi ${order.customer_name || "there"},</p>
        <p>Good news — order <strong>${ref}</strong> is now being made.</p>
        <p>We'll email you as soon as it's ready to collect.</p>`)
    },
    ready: {
      subject: `Ready to collect — ${ref}`,
      html: EMAIL_WRAP(`
        <p>Hi ${order.customer_name || "there"},</p>
        <p>Order <strong>${ref}</strong> is ready for collection whenever suits you.</p>`)
    }
  };
  return templates[status] || null;
}

function ownerNewOrderEmail(order) {
  return {
    subject: `New order — ${order.order_ref}`,
    html: EMAIL_WRAP(`
      <p>New order paid and in the queue:</p>
      <p><strong>${order.order_ref}</strong> — ${order.customer_name || "unknown"} (${order.customer_phone || "no phone"})</p>
      <p>${order.description || ""}</p>
      <p>Deposit: £${order.deposit_paid ?? "0.00"}</p>`)
  };
}

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
    return new Response("PSC-106: couldn't update order", { status: 500 });
  }

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
