/* ============================================================
   schools-scroll.js — after a school crest is pressed on
   /schools-shop, scroll down so the uniform list is in view.
   Also scrolls to the picker when an item in the list is selected.
   Separate file so schools-shop.js stays untouched.
   ============================================================ */

function suScrollTo(el) {
  if (!el) return;
  const header = document.getElementById("site-header");
  const offset = (header ? header.offsetHeight : 0) + 16;
  const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - offset, behavior: calm ? "auto" : "smooth" });
}

// Capture phase: check the target BEFORE the page redraws the crests
// (a redrawn button is detached and no longer matches #su-tabs).
document.addEventListener("click", e => {
  if (!e.target.closest("#su-tabs .su-school")) return;
  setTimeout(() => { suScrollTo(document.getElementById("su-list")); }, 60);
}, true);

// Scroll to the picker when an item in the list is selected.
// 80ms gives renderPicker() time to show the element before we measure it.
document.addEventListener("click", e => {
  if (!e.target.closest("#su-list .su-row")) return;
  setTimeout(() => { suScrollTo(document.getElementById("su-picker")); }, 80);
}, true);
