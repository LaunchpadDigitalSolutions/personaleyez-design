/* ============================================================
   partials.js — header and footer, one place to change nav.

   EVERYTHING here is editable by Jo on the live site:
   - every hardcoded string goes through T(key, default), which renders
     a <span data-edit="site_<key>"> - the inline editor picks those up
     and saves them under the sitewide page "global", so one edit shows
     on every page.
   - phone / address / postcode / legal name / company number come from
     BRAND (config.js) and can be overridden by site_brand_<field>.
   - opening hours: site_hours_<row>_d (day) and site_hours_<row>_t (time).
   - logos: data-img slots site_mark / site_wordmark / site_logo.
   Saved site values are also cached in localStorage so the header and
   footer render with Jo's wording on first paint, not after a flicker.
   ============================================================ */
/* Grouped menu: js/nav-dropdown.js (a copy of launchpad-features nav-dropdown) and its two stylesheets are loaded by each page with ordinary
   <script>/<link> tags. If a page lacks them the menu falls back to a flat list (see navHtml). */
const NAV = [
  ["index.html",    "Home"],
  ["services.html", "What We Make"],
  ["clubs.html",    "Club Shops"],
  ["track.html",    "Track Order"],
  ["contact.html",  "Contact"]
];
/* "Order a product" dropdown; wording editable (site_nav_order_product, one key per item). Admin pages with
   ps_pages.nav_group = "order" join it. School Uniform replaced the top-level Schools link (it goes to the shop). */
const NAV_GROUP = { key: "order", label: "Order a product", labelKey: "nav_order_product", after: "services.html",
  children: [["schools-shop.html", "School Uniform"], ["workwear.html", "Workwear"],
             ["sportswear.html", "Sportswear"], ["gifts.html", "Gifts & Accessories"]] };
// "Shop" is deliberately left out of NAV - shop.html still works, it's
// just empty right now. Every product currently in ps_products carries a
// `category`, and category means "which school" there (see shop.js),
// not a general-shop section. Re-add it here once real, non-uniform
// stock exists to list.

/* ---------- sitewide saved values (text, brand, hours, logos) ---------- */
const SITE_CACHE_KEY = "ps_site_v1";
let _siteCache = null;
function siteCache(){
  if (_siteCache) return _siteCache;
  try { _siteCache = JSON.parse(localStorage.getItem(SITE_CACHE_KEY) || "{}") || {}; } catch (e) { _siteCache = {}; }
  return _siteCache;
}
function saveSiteCache(obj){
  _siteCache = obj;
  try { localStorage.setItem(SITE_CACHE_KEY, JSON.stringify(obj)); } catch (e) { /* private mode: fine */ }
}
function siteGet(fullKey){
  const live = (typeof CONTENT !== "undefined" && CONTENT) ? CONTENT[fullKey] : "";
  return live || siteCache()[fullKey] || "";
}
const navEsc = s => String(s).replace(/[&<>"']/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[c]));
/* T(key, default): an editable, sitewide piece of wording. */
const T = (k, d) => '<span data-edit="site_' + k + '">' + navEsc(siteGet("site_" + k) || d) + '</span>';
const siteImg = (slot, d) => siteGet("img_" + slot) || d;

/* ---------- brand (config.js BRAND) with Jo's overrides on top ---------- */
const BRAND_FIELDS = ["name", "tagline", "legalName", "strapline", "phone", "email", "address1", "address2", "postcode", "companyNo", "facebook"];
BRAND.companyNo = BRAND.companyNo || "08673579";
const BRAND_DEFAULT_HOURS = BRAND.hours.map(r => r.slice());
const telLink = p => "tel:" + String(p).replace(/[^\d+]/g, "");
function syncBrand(){
  BRAND_FIELDS.forEach(f => { const v = siteGet("site_brand_" + f); if (v) BRAND[f] = v; });
  const ph = siteGet("site_brand_phone");
  if (ph) BRAND.phoneLink = telLink(ph);
  BRAND.hours = BRAND_DEFAULT_HOURS.map((r, i) => [
    siteGet("site_hours_" + i + "_d") || r[0],
    siteGet("site_hours_" + i + "_t") || r[1]
  ]);
}
function applyBrandToDom(){
  document.querySelectorAll("[data-brand]").forEach(el => {
    const v = BRAND[el.dataset.brand];
    if (v && !el.classList.contains("ps-active")) el.textContent = v;
  });
  document.querySelectorAll("[data-brand-href]").forEach(el => {
    const v = BRAND[el.dataset.brandHref];
    if (v) el.setAttribute("href", v);
  });
}
function hoursHtml(){
  return BRAND.hours.map(([d, t], i) =>
    '<li><span data-edit="site_hours_' + i + '_d">' + navEsc(d) + '</span><span data-edit="site_hours_' + i + '_t">' + navEsc(t) + '</span></li>').join("");
}
function renderHours(){
  document.querySelectorAll("ul.hours").forEach(u => { u.innerHTML = hoursHtml(); });
}

/* Pages made in the admin (Edit site > New page, shown at /p/<n>) are
   added after the built-in ones when "show in menu" is ticked. The list is
   cached in the browser so the menu doesn't flicker, and refreshed in the
   background on every page view. If anything goes wrong the menu simply
   keeps what it already has. */
const NAV_PAGES_KEY = "ps_nav_pages";
function extraNav(){
  try {
    const rows = JSON.parse(localStorage.getItem(NAV_PAGES_KEY) || "[]");
    return rows.filter(p => p && /^[a-z0-9-]+$/.test(p.slug) && p.title).map(p => ["p/" + p.slug, p.title]);
  } catch (e) { return []; }
}
/* Built-in menu labels are editable (same key in header, mobile menu and
   footer); labels of admin-made pages come from that page's own title. */
const navKey = h => "nav_" + h.replace(/\W+/g, "_");
const navLabel = (h, t) => NAV.concat(NAV_GROUP.children).some(n => n[0] === h) ? T(navKey(h), t) : navEsc(t);
const navLabelOf = it => it.type === "group" ? T(it.labelKey, it.label) : (it.custom ? navEsc(it.label) : T(navKey(it.href), it.label));
const navWarn = (code, msg) => { try { console.warn(code, msg); } catch (e) { /* no console */ } };
/* kind: "desktop" | "mobile" | "footer". Without the module the menu is flat: same links, no dropdown. */
function navHtml(kind, here){
  if (window.NavDropdown) {
    let raw = "[]";
    try { raw = localStorage.getItem(NAV_PAGES_KEY) || "[]"; } catch (e) { /* private mode: no saved pages */ }
    const model = NavDropdown.build({ links: NAV, group: NAV_GROUP, pages: raw, onError: navWarn });
    return NavDropdown[kind](model, { here, label: navLabelOf });
  }
  return NAV.concat(NAV_GROUP.children, extraNav()).map(([h, t]) => `<a href="${h}" class="${kind==="mobile"?"navlink":h===here&&kind==="desktop"?"on":""}">${navLabel(h,t)}</a>`).join("");
}
async function refreshNavPages(){
  if (typeof sb !== "function") return;
  try {
    const rows = await sb("ps_pages?select=slug,title,nav_group&published=eq.true&show_in_nav=eq.true&order=sort_order,created_at", {}, "PS-510");
    const next = JSON.stringify(rows || []);
    if (next === (localStorage.getItem(NAV_PAGES_KEY) || "[]")) return;
    localStorage.setItem(NAV_PAGES_KEY, next);
    if (document.getElementById("site-header")) renderHeader();
    if (document.getElementById("site-footer")) renderFooter();
  } catch (e) { /* keep the current menu */ }
}

const currentPage = () => location.pathname.indexOf("/p/") === 0
  ? "p/" + location.pathname.slice(3).replace(/\/$/, "")
  : (location.pathname.split("/").pop() || "index.html");

function renderHeader(){
  const here = currentPage();
  const links = navHtml("desktop", here);
  document.getElementById("site-header").innerHTML = `
    <div class="header-inner">
      <a href="index.html" class="brandlink">
        <img class="bm-mark" data-img="site_mark" src="${siteImg("site_mark", "img/mark-only.png?v=" + APP_VERSION)}" alt="">
        <img class="bm-word" data-img="site_wordmark" src="${siteImg("site_wordmark", "img/wordmark.png?v=" + APP_VERSION)}" alt="Peach State — Personalised Design">
      </a>
      <nav class="nav-desktop">${links}</nav>
      <div class="header-actions">
        <a href="${BRAND.phoneLink}" data-brand-href="phoneLink"><span data-edit="site_brand_phone">${navEsc(BRAND.phone)}</span></a>
        <a href="contact.html" class="link tera">${T("hdr_enquire", "Enquire")} <span class="arrow">&rarr;</span></a>
      </div>
      <button class="burger" onclick="toggleNav()" aria-label="Menu">
        <svg id="burger-icon" viewBox="0 0 24 24" fill="none" stroke-width="1.4" stroke-linecap="round">
          <path d="M3 8h18M3 16h18"/></svg>
      </button>
    </div>`;

  // The header uses backdrop-filter, which creates a containing block for
  // fixed-position children. The nav panel must live on <body> or it will
  // position against the header instead of the viewport.
  let nav = document.getElementById("nav-mobile");
  if (!nav) {
    nav = document.createElement("nav");
    nav.className = "nav-mobile";
    nav.id = "nav-mobile";
    document.body.appendChild(nav);
  }
  nav.innerHTML = `
      ${navHtml("mobile", here)}
      <div class="navfoot">
        <span class="label">${T("nav_callus", "Call the studio")}</span>
        <a href="${BRAND.phoneLink}" data-brand-href="phoneLink"><span data-edit="site_brand_phone">${navEsc(BRAND.phone)}</span></a>
      </div>`;
}

function toggleNav(){
  const n = document.getElementById("nav-mobile");
  const open = n.classList.toggle("open");
  document.getElementById("burger-icon").innerHTML =
    open ? '<path d="M6 6l12 12M18 6 6 18"/>' : '<path d="M3 8h18M3 16h18"/>';
  document.body.style.overflow = open ? "hidden" : "";
}

function renderFooter(){
  const y = new Date().getFullYear();
  document.getElementById("site-footer").innerHTML = `
    <div class="footmark"><img data-img="site_logo" src="${siteImg("site_logo", "img/logo.png?v=" + APP_VERSION)}" alt="Peach State — Personalised Design"></div>
    <div class="wrap">
      <div class="foot-grid">
        <div>
          <p>${T("foot_blurb", "Personalised embroidery and print, made by hand in Hartlepool. Schools, businesses, and the things people keep.")}</p>
        </div>
        <div>
          <span class="label">${T("foot_explore", "Explore")}</span>
          <nav>${navHtml("footer", currentPage())}</nav>
        </div>
        <div>
          <span class="label">${T("foot_make", "We Make")}</span>
          <nav>
            <a href="services.html#embroidery">${T("foot_make_1", "Embroidery")}</a>
            <a href="services.html#print">${T("foot_make_2", "Print & vinyl")}</a>
            <a href="schools-shop.html">${T("foot_make_3", "School uniform")}</a>
            <a href="workwear.html">${T("foot_make_4", "Workwear")}</a>
            <a href="sportswear.html">${T("foot_make_6", "Sportswear")}</a>
            <a href="gifts.html">${T("foot_make_5", "Personalised gifts")}</a>
          </nav>
        </div>
        <div>
          <span class="label">${T("foot_find", "Find Us")}</span>
          <p style="color:rgba(251,245,238,.8)"><span data-edit="site_brand_address1">${navEsc(BRAND.address1)}</span><br><span data-edit="site_brand_address2">${navEsc(BRAND.address2)}</span><br><span data-edit="site_brand_postcode">${navEsc(BRAND.postcode)}</span></p>
          <p style="margin-top:14px"><a href="${BRAND.phoneLink}" data-brand-href="phoneLink" style="color:var(--peach);font-size:17px"><span data-edit="site_brand_phone">${navEsc(BRAND.phone)}</span></a></p>
        </div>
      </div>
      <div class="foot-legal">
        <a href="privacy.html">${T("foot_legal_privacy", "Privacy Policy")}</a>
        <a href="terms.html">${T("foot_legal_terms", "Terms & Conditions")}</a>
        <a href="refund.html">${T("foot_legal_refund", "Refund Policy")}</a>
        <a href="cookies.html">${T("foot_legal_cookies", "Cookie Policy")}</a>
      </div>
      <div class="foot-bottom">
        ${T("foot_copy", "© " + y)} <span data-edit="site_brand_legalName">${navEsc(BRAND.legalName)}</span> (${T("foot_co", "Company No.")} <span data-edit="site_brand_companyNo">${navEsc(BRAND.companyNo)}</span>) &nbsp;·&nbsp; ${T("foot_by", "Website by")}
        <a href="https://launchpadme.co.uk">${T("foot_by_name", "Launchpad Digital")}</a>
        &nbsp;·&nbsp; <a href="admin.html">${T("foot_staff", "Staff login")}</a>
      </div>
    </div>`;
}

document.addEventListener("DOMContentLoaded", () => {
  // Jo's saved sitewide values (from the browser cache) are applied before
  // the first render; the editor re-applies the live ones once they load.
  syncBrand();
  applyBrandToDom();
  renderHours();
  if (document.getElementById("site-header")) renderHeader();
  if (document.getElementById("site-footer")) renderFooter();
  if (window.NavDropdown) NavDropdown.init(document, { onError: navWarn });
  refreshNavPages();
});

let _tt;
function toast(m){
  let t = document.getElementById("toast");
  if(!t){ t=document.createElement("div"); t.id="toast"; t.className="toast"; document.body.appendChild(t); }
  t.textContent=m; t.classList.add("show");
  clearTimeout(_tt); _tt=setTimeout(()=>t.classList.remove("show"),2600);
}
document.addEventListener("keydown", e => {
  if(e.ctrlKey && e.shiftKey && e.key.toLowerCase()==="v")
    alert("Peach State website\nv"+APP_VERSION+"\nLaunchpad Digital Solutions");
});

/* ============================================================
   LocalBusiness structured data (SEO) — one place, driven by the
   same BRAND object everything else uses, so it can never drift
   out of sync with the real address/hours/phone. Re-run whenever
   Jo edits hours or contact details; tolerant of free-text times.
   ============================================================ */
const LD_DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
function parseTimes(t){
  const m = String(t).match(/(\d{1,2})(?:[:.](\d{2}))?\s*(?:–|—|-|to)\s*(\d{1,2})(?:[:.](\d{2}))?/i);
  if (!m) return null;
  const f = (h, mi) => String(h).padStart(2, "0") + ":" + (mi || "00");
  return [f(m[1], m[2]), f(m[3], m[4])];
}
function injectLocalBusinessSchema(){
  const openingHours = [];
  BRAND.hours.forEach(([, t], i) => {
    const p = parseTimes(t);
    if (p && LD_DAYS[i]) openingHours.push({ "@type":"OpeningHoursSpecification", dayOfWeek: LD_DAYS[i], opens: p[0], closes: p[1] });
  });

  const data = {
    "@context":"https://schema.org",
    "@type":"ClothingStore",
    "name": BRAND.name,
    "alternateName": BRAND.legalName,
    "image":"https://peachstate.co.uk/img/logo.png",
    "telephone": BRAND.phone,
    "email": BRAND.email,
    "address":{
      "@type":"PostalAddress",
      "streetAddress": BRAND.address1,
      "addressLocality": BRAND.address2,
      "postalCode": BRAND.postcode,
      "addressCountry":"GB"
    },
    "url":"https://peachstate.co.uk/",
    "openingHoursSpecification": openingHours,
    "priceRange":"££"
  };

  document.getElementById("ps-ld")?.remove();
  const s = document.createElement("script");
  s.type = "application/ld+json";
  s.id = "ps-ld";
  s.textContent = JSON.stringify(data);
  document.head.appendChild(s);
}
document.addEventListener("DOMContentLoaded", injectLocalBusinessSchema);
