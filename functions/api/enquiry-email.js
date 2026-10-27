/* ============================================================
   POST /api/enquiry-email
   Body: { name, phone, email, category, message }
   The enquiry is already saved to ps_enquiries by the client (via
   ps_create_enquiry) before this is called. This is the alert on top:
   without it Jo only found enquiries by opening the admin dashboard.
   Always sends to the shop owner address, never to a caller-supplied
   one, so it can't be used to email other people.
   Error codes: PSQ-1xx
   ============================================================ */

const EMAIL_FROM = "Peach State <orders@peachstate.co.uk>";

const esc = s => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const CATEGORY_LABELS = {
  school: "School uniform",
  workwear: "Workwear or team kit",
  personalised: "Personalised gift",
  other: "Something else"
};

async function sendEmail(env, { to, subject, html, replyTo }) {
  if (!env.RESEND_API_KEY) { console.error("PSQ-101: RESEND_API_KEY not configured"); return false; }
  try {
    const payload = { from: EMAIL_FROM, to, subject, html };
    if (replyTo) payload.reply_to = replyTo;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) { console.error("PSQ-102", res.status, await res.text()); return false; }
    return true;
  } catch (e) { console.error("PSQ-103", e.message); return false; }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try { body = await request.json(); }
  catch { return new Response("PSQ-104: bad JSON", { status: 400 }); }

  const name = String(body.name || "").slice(0, 200);
  const phone = String(body.phone || "").slice(0, 50);
  const email = String(body.email || "").slice(0, 200);
  const category = String(body.category || "").slice(0, 50);
  const message = String(body.message || "").slice(0, 4000);
  if (!name || !message) return new Response("PSQ-105: missing name or message", { status: 400 });

  const to = env.OWNER_NOTIFY_EMAIL || "info@peachstate.co.uk";
  const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const sent = await sendEmail(env, {
    to,
    replyTo: looksLikeEmail ? email : undefined,
    subject: `New enquiry — ${name}`,
    html: `
      <div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;padding:24px;color:#3a3a2e">
        <h2 style="color:#8a9a7e;margin:0 0 16px">New enquiry</h2>
        <p><strong>${esc(name)}</strong></p>
        <p>Phone: ${esc(phone) || "not given"}<br>Email: ${esc(email) || "not given"}<br>For: ${esc(CATEGORY_LABELS[category] || category)}</p>
        <p>${esc(message).replace(/\n/g, "<br>")}</p>
        <p style="margin-top:28px;font-size:13px;color:#999">Also in your admin dashboard under Enquiries.${looksLikeEmail ? " Hit reply to answer them directly." : ""}</p>
      </div>`
  });

  return new Response(JSON.stringify({ sent }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
