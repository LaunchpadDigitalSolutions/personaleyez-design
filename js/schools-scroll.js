/* ============================================================
   schools-scroll.js — after a school crest is pressed on
   /schools-shop, scroll down so the uniform list is in view.
   Separate file so schools-shop.js stays untouched.
   ============================================================ */

document.addEventListener("click", e => {
  if (!e.target.closest("#su-tabs .su-school")) return;
  // Wait a tick so the page's own click handler has drawn the list first.
  setTimeout(() => {
    const list = document.getElementById("su-list");
    if (!list) return;
    const header = document.getElementById("site-header");
    const offset = (header ? header.offsetHeight : 0) + 16;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: list.getBoundingClientRect().top + window.scrollY - offset, behavior: calm ? "auto" : "smooth" });
  }, 60);
});
