/* ============================================================
   POST /api/notify-status
   Body: { order_id, status }
   Called by the admin dashboard right after it moves an order to
   in_production or ready. Looks the order up, emails the customer,
   and (for ready) marks ready_notified so it's never sent twice.

   Email helpers inlined (see webhooks/square.js note) - Cloudflare's
   zero-config Pages Functions build can't resolve imports to
   non-route sibling files.
   Error codes: PSE-1xx
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

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "PSE-101: expected JSON body" }, 400);
  }

  const { order_id, status } = body;
  if (!order_id || !status) return json({ error: "PSE-102: missing order_id or status" }, 400);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: "PSE-103: database not configured" }, 503);
  }

  const headers = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY,
    "Content-Type": "application/json"
  };

  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/ps_orders?id=eq.${order_id}&select=*`,
    { headers }
  );
  if (!res.ok) return json({ error: "PSE-104: couldn't load order" }, 502);
  const rows = await res.json();
  const order = rows[0];
  if (!order) return json({ error: "PSE-105: order not found" }, 404);

  if (status === "ready" && order.ready_notified) {
    return json({ sent: false, reason: "already notified" });
  }

  const tpl = customerEmailFor(status, order);
  if (!tpl || !order.customer_email) {
    return json({ sent: false, reason: "no template or no customer email" });
  }

  const sent = await sendEmail(env, { to: order.customer_email, ...tpl });

  if (sent && status === "ready") {
    await fetch(`${env.SUPABASE_URL}/rest/v1/ps_orders?id=eq.${order_id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ ready_notified: true })
    });
  }

  return json({ sent });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
