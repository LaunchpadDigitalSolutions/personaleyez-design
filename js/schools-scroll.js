/* ============================================================
   schools-scroll.js — after a school crest is pressed on
   /schools-shop, scroll down so the uniform list is in view.
   Separate file so schools-shop.js stays untouched.
   ============================================================ */

// Capture phase: check the target BEFORE the page redraws the crests
// (a redrawn button is detached and no longer matches #su-tabs).
document.addEventListener("click", e => {
  if (!e.target.closest("#su-tabs .su-school")) return;
  setTimeout(() => {
    const list = document.getElementById("su-list");
    if (!list) return;
    const header = document.getElementById("site-header");
    const offset = (header ? header.offsetHeight : 0) + 16;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: list.getBoundingClientRect().top + window.scrollY - offset, behavior: calm ? "auto" : "smooth" });
  }, 60);
}, true);
