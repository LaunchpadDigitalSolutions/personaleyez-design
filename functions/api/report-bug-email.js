/* ============================================================
   POST /api/report-bug-email
   Body: { message, page_url, recent_errors }
   Sends Josh an immediate email when Jo reports a problem. The
   report itself is already saved to ps_bug_reports by the client
   (via ps_report_bug) before this is called - this is purely the
   "don't let it sit unread" alert on top of that.
   Error codes: PSB-1xx
   ============================================================ */

const EMAIL_FROM = "Peach State <orders@peachstate.co.uk>";

async function sendEmail(env, { to, subject, html }) {
  if (!env.RESEND_API_KEY) { console.error("PSB-101: RESEND_API_KEY not configured"); return false; }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ from: EMAIL_FROM, to, subject, html })
    });
    if (!res.ok) { console.error("PSB-102", res.status, await res.text()); return false; }
    return true;
  } catch (e) { console.error("PSB-103", e.message); return false; }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try { body = await request.json(); }
  catch { return new Response("PSB-104: bad JSON", { status: 400 }); }

  const { message, page_url, recent_errors } = body;
  if (!message) return new Response("PSB-105: missing message", { status: 400 });

  const errorsHtml = (recent_errors || []).length
    ? "<p><strong>Recent errors that session:</strong></p><ul>" +
      recent_errors.map(e => `<li>${e.code}: ${e.message}</li>`).join("") + "</ul>"
    : "";

  const to = env.DEV_ALERT_EMAIL || "jscott55124@gmail.com";
  const sent = await sendEmail(env, {
    to,
    subject: "Bug report — Peach State",
    html: `
      <div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;padding:24px;color:#3a3a2e">
        <h2 style="color:#8a9a7e;margin:0 0 16px">Bug report from Jo</h2>
        <p>${message.replace(/\n/g, "<br>")}</p>
        <p style="font-size:13px;color:#999">Page: ${page_url || "unknown"}</p>
        ${errorsHtml}
      </div>`
  });

  return new Response(JSON.stringify({ sent }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
