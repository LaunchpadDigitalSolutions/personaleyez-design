/* ============================================================
   nav-fit.js - keeps the header on one tidy row at every width.
   The desktop menu never wraps and its labels are never cut. When logo +
   menu + phone/Enquire do not fit, <body> gets .nav-compact and the header
   shows the burger (the same panel as on phones). The rules for that are
   in css/nav-dropdown-theme.css. Loaded after partials.js, which draws the
   header. Re-checks on resize, when fonts/images load, and when the header
   is redrawn or its wording is edited. Nothing here touches the labels.
   ============================================================ */
(function () {
  var MIN = 1000; /* below this width style.css already shows the burger */
  var timer = 0;

  function q(sel) { return document.querySelector(sel); }

  /* px the full desktop bar is too wide by; 0 or less means it fits. -1 if there is no header to measure. */
  function overflow() {
    var inner = q(".header-inner"), nav = q(".nav-desktop"), acts = q(".header-actions");
    if (!inner || !nav || !acts) return -1;
    var edge = inner.getBoundingClientRect().right - parseFloat(getComputedStyle(inner).paddingRight || "0");
    return Math.max(acts.getBoundingClientRect().right - edge, nav.scrollWidth - nav.clientWidth);
  }

  function closePanel() {
    var panel = document.getElementById("nav-mobile");
    if (panel && panel.classList.contains("open") && typeof toggleNav === "function") toggleNav();
  }

  function check() {
    var wide = window.matchMedia("(min-width:" + MIN + "px)").matches;
    document.body.classList.remove("nav-compact"); /* measure the full bar */
    if (!wide) return;
    var over = overflow();
    if (over > 0.5) document.body.classList.add("nav-compact");
    else if (over !== -1) closePanel(); /* full bar is showing: an open phone panel would be stuck */
  }

  function later() {
    if (timer) return;
    timer = setTimeout(function () { timer = 0; check(); }, 40);
  }

  function start() {
    check();
    window.addEventListener("resize", later);
    window.addEventListener("load", later);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(later).catch(function (e) { try { console.warn("PS-730", "fonts", e); } catch (x) { /* no console */ } });
    }
    var header = document.getElementById("site-header");
    if (header && window.MutationObserver) {
      new MutationObserver(later).observe(header, { childList: true, subtree: true, characterData: true });
    }
  }

  window.NavFit = { check: check, overflow: overflow };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
