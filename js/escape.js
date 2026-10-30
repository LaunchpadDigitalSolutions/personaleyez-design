/* ============================================================
   escape.js — the one HTML-escape helper for public pages.
   Anything from the database (product names, descriptions, school
   names, sizes, colours, image links) goes through escHtml() before
   it is put into a template string. It escapes quotes too, so it is
   safe inside attribute values as well as between tags.
   Classic script: loads before schools-shop.js, schools-checkout.js,
   shop.js and clubs.js. (js/category-page.js is an ES module with
   its own copy by design: no host globals.)
   ============================================================ */
const _ESC_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escHtml = v => v == null ? "" : String(v).replace(/[&<>"']/g, c => _ESC_MAP[c]);

