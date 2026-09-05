/* ============================================================
   config.js — brand, imagery and backend config.
   Trading as Personaleyez Design until the October 2026 rebrand;
   built in the Peach State identity ready for it.
   ============================================================ */

const BRAND = {
  name:      "Peach State",
  tagline:   "Personalised Design",
  legalName: "Personaleyez Design Ltd",
  strapline: "Personalised design, made in Hartlepool",

  phone:     "01429 866266",
  phoneLink: "tel:01429866266",
  email:     "hello@peachstate.co.uk",      // CONFIRM WITH CLIENT
  address1:  "184 York Road",
  address2:  "Hartlepool",
  postcode:  "TS26 9EA",

  hours: [
    ["Monday",    "10:00 – 18:00"],
    ["Tuesday",   "10:00 – 16:00"],
    ["Wednesday", "10:00 – 16:00"],
    ["Thursday",  "10:00 – 18:00"],
    ["Friday",    "10:00 – 16:00"],
    ["Saturday",  "10:00 – 16:00"],
    ["Sunday",    "Closed"]
  ],

  facebook: ""                              // CONFIRM WITH CLIENT
};

/* ---------- Supabase ---------- */
const SB_URL = "https://coiwwbroycaznkmhevde.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvaXd3YnJveWNhem5rbWhldmRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NzIwMjksImV4cCI6MjA5OTU0ODAyOX0.r-k8RjKqouqjekvEXSMKzJykKbtgpGLMZQXcXhAmRW8";
const CLIENT_REF  = "peachstate";
const APP_VERSION = "0.6.0";

/* ---------- Admin PIN ----------
   DEMO ONLY. This is client-side, so anyone who opens dev tools can read it.
   It stops a casual visitor poking around; it is NOT security.
   Before go-live: Cloudflare Access on /admin* AND lock ps_groups /
   ps_group_products down so the anon key cannot read access codes. */
const ADMIN_PIN = "2468";

/* ---------- Imagery ----------
   Placeholder art direction. Replace with the client's own
   photography before launch. */
const CDN = "https://d8j0ntlcm91z4.cloudfront.net/user_3F2zO4mnH1Ac9Z8aX9b4j07BQzs/";
const IMG = {
  store:   CDN + "hf_20260828_145831_88755680-3e40-4d55-808a-13906d4bfa96.png",
  wearing: CDN + "hf_20260828_145807_3416d778-15cb-407e-a7c4-50f9820b2e78.png",
  flatlay: CDN + "hf_20260828_145807_25a7fdee-d066-485e-9910-110927b5bae0.png",
  stitch:  CDN + "hf_20260828_145807_f251050b-0126-4106-b538-ea0a27944285.png",
  peaches: CDN + "hf_20260828_145807_1c5af848-d5d4-4cd2-98b1-c3787d188e66.png",
  rail:    CDN + "hf_20260828_145807_0261ae8a-0776-4421-828a-602a43239713.png",
  tote:    CDN + "hf_20260828_145807_4a884cc6-5570-4f00-bde9-636be67386c5.png",
  hands:   CDN + "hf_20260828_145807_917bb148-947a-4b8a-a10c-514c6bf9110a.png",
  flowers: CDN + "hf_20260828_145807_c4592690-01b2-439d-a1e8-97a3c8bc140b.png",
  folded:  CDN + "hf_20260828_145807_39c1e976-9f01-4c84-8841-438485e12003.png"
};

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-brand]").forEach(el => {
    const v = BRAND[el.dataset.brand]; if (v) el.textContent = v; });
  document.querySelectorAll("[data-brand-href]").forEach(el => {
    const v = BRAND[el.dataset.brandHref]; if (v) el.setAttribute("href", v); });
  document.querySelectorAll("[data-img]").forEach(el => {
    const v = IMG[el.dataset.img];
    if (v) { el.src = v; } else { el.style.background = "var(--cream-deep)"; }
    el.addEventListener("error", () => {
      el.style.background = "var(--cream-deep)";
      el.removeAttribute("alt");
    }, { once: true });
  });
});

/* ============================================================
   Site-wide error logging.
   Every JS error - caught or not - gets recorded with a code, so a
   bug like a missing function no longer depends on Jo happening to
   notice, screenshot it, and message Josh. Silent by design: never
   shows the person anything, never blocks what they were doing.
   window.__psRecentErrors also feeds the "Report a problem" button
   on admin.html, so a submitted report carries the actual errors
   that happened in that session, not just Jo's description of them.
   ============================================================ */
window.__psRecentErrors = [];

function logError(code, message, extra){
  window.__psRecentErrors.push({ code, message, at: new Date().toISOString() });
  if (window.__psRecentErrors.length > 10) window.__psRecentErrors.shift();
  try{
    fetch(SB_URL + "/rest/v1/rpc/ps_log_error", {
      method: "POST",
      headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        p_error_code: code, p_message: String(message).slice(0, 2000),
        p_stack: extra && extra.stack ? String(extra.stack).slice(0, 4000) : null,
        p_page_url: location.href,
        p_context: extra || null
      })
    }).catch(() => {});
  }catch(e){ /* logging must never itself break the page */ }
}

window.addEventListener("error", (e) => {
  logError("JS-ERR", e.message, { stack: e.error && e.error.stack, filename: e.filename, lineno: e.lineno });
});
window.addEventListener("unhandledrejection", (e) => {
  const reason = e.reason;
  logError("JS-REJ", reason && reason.message ? reason.message : String(reason),
    { stack: reason && reason.stack });
});
