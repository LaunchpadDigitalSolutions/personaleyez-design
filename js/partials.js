/* ============================================================
   partials.js — header and footer injected on every page so
   there's one place to change navigation.
   ============================================================ */

const NAV = [
  ["index.html",    "Home"],
  ["services.html", "What we do"],
  ["schools.html",  "Schools"],
  ["track.html",    "Track an order"],
  ["contact.html",  "Contact"]
];

function currentPage() {
  const p = location.pathname.split("/").pop();
  return p === "" ? "index.html" : p;
}

function logoHTML() {
  return BRAND.hasLogo
    ? `<img src="img/logo.png" alt="${BRAND.name}">`
    : `${BRAND.name}<span class="dot">.</span>`;
}

function renderHeader() {
  const here = currentPage();
  const links = NAV.map(([h, t]) =>
    `<a href="${h}" class="${h === here ? "on" : ""}">${t}</a>`).join("");

  document.getElementById("site-header").innerHTML = `
    <div class="header-inner">
      <a href="index.html" class="logo">${logoHTML()}</a>
      <nav class="nav-desktop">${links}</nav>
      <a href="${BRAND.phoneLink}" class="btn btn-dark header-cta">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>
        ${BRAND.phone}
      </a>
      <button class="burger" onclick="toggleNav()" aria-label="Menu">
        <svg id="burger-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
          <path d="M3 6h18M3 12h18M3 18h18"/></svg>
      </button>
    </div>
    <nav class="nav-mobile" id="nav-mobile">
      ${links}
      <a href="contact.html" class="btn btn-primary">Get a quote</a>
      <div class="navphone">Call the shop<strong>${BRAND.phone}</strong></div>
    </nav>`;
}

function toggleNav() {
  const n = document.getElementById("nav-mobile");
  const open = n.classList.toggle("open");
  document.getElementById("burger-icon").innerHTML = open
    ? '<path d="M18 6 6 18M6 6l12 12"/>'
    : '<path d="M3 6h18M3 12h18M3 18h18"/>';
  document.body.style.overflow = open ? "hidden" : "";
}

function renderFooter() {
  const y = new Date().getFullYear();
  document.getElementById("site-footer").innerHTML = `
    <div class="wrap">
      <div class="foot-grid">
        <div>
          <div class="logo">${logoHTML()}</div>
          <p>${BRAND.strapline}. Embroidery and print for schools, businesses and families across Hartlepool and Teesside.</p>
        </div>
        <div>
          <h4>Pages</h4>
          <nav>${NAV.map(([h, t]) => `<a href="${h}">${t}</a>`).join("")}</nav>
        </div>
        <div>
          <h4>Services</h4>
          <nav>
            <a href="services.html#embroidery">Embroidery</a>
            <a href="services.html#print">Printing</a>
            <a href="schools.html">School uniform</a>
            <a href="services.html#workwear">Workwear</a>
            <a href="services.html#personalised">Personalised gifts</a>
          </nav>
        </div>
        <div>
          <h4>Find us</h4>
          <p style="margin-top:0">${BRAND.address1}<br>${BRAND.address2}<br>${BRAND.postcode}</p>
          <p><a href="${BRAND.phoneLink}" style="color:#fff;font-weight:600">${BRAND.phone}</a></p>
        </div>
      </div>
      <div class="foot-bottom">
        © ${y} ${BRAND.legalName}. All rights reserved.
        &nbsp;·&nbsp; Website by <a href="https://launchpadme.co.uk">Launchpad Digital</a>
      </div>
    </div>`;
}

document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("site-header")) renderHeader();
  if (document.getElementById("site-footer")) renderFooter();
});

/* shared toast */
let _tt;
function toast(m) {
  let t = document.getElementById("toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; document.body.appendChild(t); }
  t.textContent = m; t.classList.add("show");
  clearTimeout(_tt); _tt = setTimeout(() => t.classList.remove("show"), 2600);
}

document.addEventListener("keydown", e => {
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "v")
    alert(BRAND.name + " website\nv" + APP_VERSION + "\nLaunchpad Digital Solutions");
});
