/* ============================================================
   admin-edit-site.js - the "Edit site" tab on the admin dashboard.

   Lists the public pages. Each Edit button opens that page already in
   edit mode, in the same browser tab: the staff PIN is already in this
   tab's session storage from the unlock screen, so there is no second
   prompt. The "Edit this page" pill on the public pages only exists in
   a tab with that admin session (see js/inline-edit.js), so visitors
   never see it. The real lock is still the PIN, which the server checks
   on every save.
   Error codes: PS-420
   ============================================================ */

const EDIT_PAGES = [
  ["Home", "index.html"], ["What we make", "services.html"], ["Schools", "schools.html"],
  ["Club shops", "clubs.html"], ["Shop", "shop.html"], ["Track order", "track.html"], ["Contact", "contact.html"]
];

/* The panel: one row per page with an Edit button. */
function editSitePanel() {
  const rows = EDIT_PAGES.map(([name, file]) =>
    '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;min-height:56px;border-top:1px solid rgba(0,0,0,.1)">'
    + '<span style="font-size:16px">' + name + '</span>'
    + '<a href="' + file + '?edit=1" style="display:inline-flex;align-items:center;min-height:44px;padding:0 18px;border-radius:8px;background:#F6B49C;color:#2B2522;font-weight:500;font-size:15px;text-decoration:none">Edit</a></div>'
  ).join("");
  return '<div style="padding:4px 2px 24px"><h2 style="margin:8px 0 4px;font-size:20px">Edit the live site</h2>'
    + '<p style="margin:0 0 12px;opacity:.75;font-size:14px;line-height:1.5">Pick a page. It opens ready to edit, and changes go live as you save them. Use Back to admin at the top to return here.</p>'
    + rows + '</div>';
}

/* Show this panel instead of the order list when the Edit site tab is selected. */
(function () {
  if (typeof render !== "function") return;
  const _render = render;
  render = function () {
    const stats = document.getElementById("stats");
    const panel = document.getElementById("panel");
    if (typeof tab !== "undefined" && tab === "editsite" && panel) {
      if (stats) stats.style.display = "none";
      panel.innerHTML = editSitePanel();
      return;
    }
    if (stats) stats.style.display = "";
    return _render.apply(this, arguments);
  };
})();

/* Back to admin from the editor lands here (#editsite). The dashboard's own hash restore only knows its original
   tabs, so it would drop us on Live: turn that restore into Edit site, until the user taps a tab themselves. */
(function () {
  if (typeof setTab !== "function" || location.hash !== "#editsite") return;
  let touched = false;
  document.addEventListener("pointerdown", e => { if (e.target.closest(".tab")) touched = true; }, true);
  const _setTab = setTab;
  setTab = function (t) {
    if (!touched && t === "live") t = "editsite";
    return _setTab.call(this, t);
  };
  /* If the dashboard never calls setTab on load, do it once it is unlocked. */
  let tries = 0;
  const go = () => {
    if (touched || (typeof tab !== "undefined" && tab === "editsite")) return;
    const gate = document.getElementById("pingate");
    if (gate && getComputedStyle(gate).display !== "none") { if (++tries < 120) setTimeout(go, 250); return; }
    setTab("editsite");
  };
  document.addEventListener("DOMContentLoaded", () => setTimeout(go, 600));
})();
