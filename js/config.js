/* ============================================================
   config.js — EVERYTHING BRAND-SPECIFIC LIVES HERE.

   The business rebrands to Peach State in October. When that
   happens, change BRAND below and the whole site follows —
   name, logo, colours, contact details. No other file needs
   touching.
   ============================================================ */

const BRAND = {
  // --- switch this line in October ---
  name:        "Personaleyez Design",
  legalName:   "Personaleyez Design Ltd",
  strapline:   "Embroidery, print and personalisation in Hartlepool",

  // Contact
  phone:       "01429 866266",
  phoneLink:   "tel:01429866266",
  email:       "hello@personaleyez.co.uk",     // confirm with client
  address1:    "184 York Road",
  address2:    "Hartlepool",
  postcode:    "TS26 9EA",

  // Opening hours — confirm with client
  hours: [
    ["Monday – Friday", "9:00am – 5:00pm"],
    ["Saturday",        "9:00am – 1:00pm"],
    ["Sunday",          "Closed"]
  ],

  // Logo: drop a file at img/logo.png and set this to true
  hasLogo: false,

  facebook: ""   // add the page URL when confirmed
};

/* ---------- Supabase ---------- */
const SB_URL = "https://coiwwbroycaznkmhevde.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvaXd3YnJveWNhem5rbWhldmRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NzIwMjksImV4cCI6MjA5OTU0ODAyOX0.r-k8RjKqouqjekvEXSMKzJykKbtgpGLMZQXcXhAmRW8";
const CLIENT_REF  = "personaleyez";
const APP_VERSION = "0.1.0";

/* ---------- Imagery ---------- */
const CDN = "https://d8j0ntlcm91z4.cloudfront.net/user_3F2zO4mnH1Ac9Z8aX9b4j07BQzs/";
const IMG = {
  machine:  CDN + "hf_20260828_144812_01664052-ca45-4019-8d36-e0171f0288b4.png",
  school:   CDN + "hf_20260828_144813_0c980c52-a5e8-4ee5-ba03-93e79438b175.png",
  workwear: CDN + "hf_20260828_144813_68091ac8-69a4-44f4-b65e-8fd0557929c6.png",
  gifts:    CDN + "hf_20260828_144834_372d7cf1-f773-4437-b94e-d9194430fb1d.png",
  stitch:   CDN + "hf_20260828_144812_2dee6268-45fd-4661-b9ba-43bd2536ceea.png",
  shop:     CDN + "hf_20260828_144813_33f4ec57-c5a2-4baa-816e-14d92034c3a6.png",
  press:    CDN + "hf_20260828_144812_871489ea-069a-4513-9432-09d1fc69b672.png",
  threads:  CDN + "hf_20260828_144834_26bcaaf6-7a35-4c33-83ea-ed92d0141736.png"
};

/* Fill brand text into any [data-brand="key"] element on load */
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-brand]").forEach(el => {
    const v = BRAND[el.dataset.brand];
    if (v) el.textContent = v;
  });
  document.querySelectorAll("[data-brand-href]").forEach(el => {
    const v = BRAND[el.dataset.brandHref];
    if (v) el.setAttribute("href", v);
  });
});
