/* ============================================================
   partials.js — header and footer, one place to change nav.
   ============================================================ */
const NAV = [
  ["index.html",    "Home"],
  ["shop.html",     "Shop"],
  ["services.html", "What We Make"],
  ["schools.html",  "Schools"],
  ["clubs.html",    "Club Shops"],
  ["track.html",    "Track Order"],
  ["contact.html",  "Contact"]
];

const currentPage = () => (location.pathname.split("/").pop() || "index.html");

function renderHeader(){
  const here = currentPage();
  const links = NAV.map(([h,t]) =>
    `<a href="${h}" class="${h===here?"on":""}">${t}</a>`).join("");
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
  if (!document.getElementById("nav-mobile")) {
    const nav = document.createElement("nav");
    nav.className = "nav-mobile";
    nav.id = "nav-mobile";
    nav.innerHTML = `
      ${NAV.map(([h,t]) => `<a class="navlink" href="${h}">${t}</a>`).join("")}
      <div class="navfoot">
        <span class="label">Call the studio</span>
        <a href="${BRAND.phoneLink}">${BRAND.phone}</a>
      </div>`;
    document.body.appendChild(nav);
  }
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
          <nav>${NAV.map(([h,t]) => `<a href="${h}">${t}</a>`).join("")}</nav>
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
      <div class="foot-bottom">
        © ${y} ${BRAND.legalName} &nbsp;·&nbsp; Website by
        <a href="https://launchpadme.co.uk">Launchpad Digital</a>
        &nbsp;·&nbsp; <a href="admin.html">Staff login</a>
      </div>
    </div>`;
}

document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("site-header")) renderHeader();
  if (document.getElementById("site-footer")) renderFooter();
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
