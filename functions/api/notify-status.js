/* ============================================================
   POST /api/notify-status
   Body: { order_id, status }
   Called by the admin dashboard right after it moves an order to
   in_production or ready. Looks the order up, emails the customer,
   and (for ready) marks ready_notified so it's never sent twice.
   Never blocks the status change itself - admin.js fires this after
   the update already succeeded and ignores the result.
   Error codes: PSE-1xx
   ============================================================ */

import { sendEmail, customerEmailFor } from "../_lib/resend.js";

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

  // "ready" only ever fires once per order.
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
