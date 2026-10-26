/* ============================================================
   partials.js — header and footer, one place to change nav.
   ============================================================ */
const NAV = [
  ["index.html",    "Home"],
  ["services.html", "What We Make"],
  ["schools.html",  "Schools"],
  ["clubs.html",    "Club Shops"],
  ["track.html",    "Track Order"],
  ["contact.html",  "Contact"]
];
// "Shop" is deliberately left out of NAV - shop.html still works, it's
// just empty right now. Every product currently in ps_products carries a
// `category`, and category means "which school" there (see shop.js),
// not a general-shop section. Re-add it here once real, non-uniform
// stock exists to list.

/* Pages made in the admin (Edit site > New page, shown at /p/<name>) are
   added after the built-in ones when "show in menu" is ticked. The list is
   cached in the browser so the menu doesn't flicker, and refreshed in the
   background on every page view. If anything goes wrong the menu simply
   keeps what it already has. */
const NAV_PAGES_KEY = "ps_nav_pages";
const navEsc = s => String(s).replace(/[&<>"']/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[c]));
function extraNav(){
  try {
    const rows = JSON.parse(localStorage.getItem(NAV_PAGES_KEY) || "[]");
    return rows.filter(p => p && /^[a-z0-9-]+$/.test(p.slug) && p.title).map(p => ["p/" + p.slug, p.title]);
  } catch (e) { return []; }
}
const allNav = () => NAV.concat(extraNav());
async function refreshNavPages(){
  if (typeof sb !== "function") return;
  try {
    const rows = await sb("ps_pages?select=slug,title&published=eq.true&show_in_nav=eq.true&order=sort_order,created_at", {}, "PS-510");
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
  const links = allNav().map(([h,t]) =>
    `<a href="${h}" class="${h===here?"on":""}">${navEsc(t)}</a>`).join("");
  document.getElementById("site-header").innerHTML = `
    <div class="header-inner">
      <a href="index.html" class="brandlink">
        <img class="bm-mark" src="img/mark-only.png?v=${APP_VERSION}" alt="">
        <img class="bm-word" src="img/wordmark.png?v=${APP_VERSION}" alt="Peach State — Personalised Design">
      </a>
      <nav class="nav-desktop">${links}</nav>
      <div class="header-actions">
        <a href="${BRAND.phoneLink}">${BRAND.phone}</a>
        <a href="contact.html" class="link tera">Enquire <span class="arrow">&rarr;</span></a>
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
      ${allNav().map(([h,t]) => `<a class="navlink" href="${h}">${navEsc(t)}</a>`).join("")}
      <div class="navfoot">
        <span class="label">Call the studio</span>
        <a href="${BRAND.phoneLink}">${BRAND.phone}</a>
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
    <div class="footmark"><img src="img/logo.png?v=${APP_VERSION}" alt="Peach State — Personalised Design"></div>
    <div class="wrap">
      <div class="foot-grid">
        <div>
          <p>Personalised embroidery and print, made by hand in Hartlepool. Schools, businesses, and the things people keep.</p>
        </div>
        <div>
          <span class="label">Explore</span>
          <nav>${allNav().map(([h,t]) => `<a href="${h}">${navEsc(t)}</a>`).join("")}</nav>
        </div>
        <div>
          <span class="label">We Make</span>
          <nav>
            <a href="services.html#embroidery">Embroidery</a>
            <a href="services.html#print">Print &amp; vinyl</a>
            <a href="schools.html">School uniform</a>
            <a href="services.html#workwear">Workwear</a>
            <a href="services.html#gifts">Personalised gifts</a>
          </nav>
        </div>
        <div>
          <span class="label">Find Us</span>
          <p style="color:rgba(251,245,238,.8)">${BRAND.address1}<br>${BRAND.address2}<br>${BRAND.postcode}</p>
          <p style="margin-top:14px"><a href="${BRAND.phoneLink}" style="color:var(--peach);font-size:17px">${BRAND.phone}</a></p>
        </div>
      </div>
      <div class="foot-legal">
        <a href="privacy.html">Privacy Policy</a>
        <a href="terms.html">Terms &amp; Conditions</a>
        <a href="refund.html">Refund Policy</a>
        <a href="cookies.html">Cookie Policy</a>
      </div>
      <div class="foot-bottom">
        © ${y} ${BRAND.legalName} (Company No. 08673579) &nbsp;·&nbsp; Website by
        <a href="https://launchpadme.co.uk">Launchpad Digital</a>
        &nbsp;·&nbsp; <a href="admin.html">Staff login</a>
      </div>
    </div>`;
}

document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("site-header")) renderHeader();
  if (document.getElementById("site-footer")) renderFooter();
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
   out of sync with the real address/hours/phone.
   ============================================================ */
function injectLocalBusinessSchema(){
  const days = {
    Monday:"Monday", Tuesday:"Tuesday", Wednesday:"Wednesday", Thursday:"Thursday",
    Friday:"Friday", Saturday:"Saturday", Sunday:"Sunday"
  };
  const openingHours = BRAND.hours
    .filter(([,t]) => t !== "Closed")
    .map(([d,t]) => {
      const [open, close] = t.split("–").map(s => s.trim());
      return { "@type":"OpeningHoursSpecification", dayOfWeek: days[d], opens: open, closes: close };
    });

  const data = {
    "@context":"https://schema.org",
    "@type":"ClothingStore",
    "name":"Peach State",
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

  const s = document.createElement("script");
  s.type = "application/ld+json";
  s.textContent = JSON.stringify(data);
  document.head.appendChild(s);
}
document.addEventListener("DOMContentLoaded", injectLocalBusinessSchema);
