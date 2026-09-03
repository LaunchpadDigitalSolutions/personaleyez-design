/* ============================================================
   Shared helper for sending transactional email via Resend.
   Not routable itself - imported by functions that need to email.
   Fails soft: a broken email should never break an order/payment.
   ============================================================ */

const FROM = "Peach State <orders@peachstate.co.uk>";

export async function sendEmail(env, { to, subject, html }) {
  if (!env.RESEND_API_KEY) {
    console.error("PSE-001: RESEND_API_KEY not configured");
    return false;
  }
  if (!to) return false;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + env.RESEND_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ from: FROM, to, subject, html })
    });
    if (!res.ok) {
      console.error("PSE-002", res.status, await res.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error("PSE-003", e.message);
    return false;
  }
}

// Jo's own notification address - separate from the customer-facing
// info@ inbox so order alerts don't get lost in general enquiries.
// Falls back to info@ if a dedicated address hasn't been set.
export function ownerEmail(env) {
  return env.OWNER_NOTIFY_EMAIL || "info@peachstate.co.uk";
}

const WRAP = body => `
  <div style="font-family:Georgia,serif;max-width:480px;margin:0 auto;padding:24px;color:#3a3a2e">
    <h2 style="color:#8a9a7e;margin:0 0 16px">Peach State</h2>
    ${body}
    <p style="margin-top:32px;font-size:13px;color:#999">Personalised Design · peachstate.co.uk</p>
  </div>`;

export function customerEmailFor(status, order) {
  const ref = order.order_ref;
  const templates = {
    enquiry: {
      subject: `Order received — ${ref}`,
      html: WRAP(`
        <p>Hi ${order.customer_name || "there"},</p>
        <p>Thanks — we've received your order <strong>${ref}</strong> and it's now in our queue.</p>
        <p>${order.description || ""}</p>
        <p>We'll email you again once it's in production, and again when it's ready to collect.</p>`)
    },
    in_production: {
      subject: `Your order is in production — ${ref}`,
      html: WRAP(`
        <p>Hi ${order.customer_name || "there"},</p>
        <p>Good news — order <strong>${ref}</strong> is now being made.</p>
        <p>We'll email you as soon as it's ready to collect.</p>`)
    },
    ready: {
      subject: `Ready to collect — ${ref}`,
      html: WRAP(`
        <p>Hi ${order.customer_name || "there"},</p>
        <p>Order <strong>${ref}</strong> is ready for collection whenever suits you.</p>`)
    }
  };
  return templates[status] || null;
}

export function ownerNewOrderEmail(order) {
  return {
    subject: `New order — ${order.order_ref}`,
    html: WRAP(`
      <p>New order paid and in the queue:</p>
      <p><strong>${order.order_ref}</strong> — ${order.customer_name || "unknown"} (${order.customer_phone || "no phone"})</p>
      <p>${order.description || ""}</p>
      <p>Deposit: £${order.deposit_paid ?? "0.00"}</p>`)
  };
}
