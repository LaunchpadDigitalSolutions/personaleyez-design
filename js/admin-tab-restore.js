/* ============================================================
   admin-tab-restore.js — refresh keeps you on the tab you were on.
   admin.js restored from a fixed list of tab names that was missing
   Catalog, Schools and Edit site, so a refresh dropped back to Live.
   This builds the list from the tab buttons in admin.html instead, so
   any tab added later works without touching this file.
   Replaces restoreTabFromHash (called by name from unlockAdmin).
   Error codes: none (no async work of its own beyond openGroupPanel).
   ============================================================ */

restoreTabFromHash = async function () {
  const hash = location.hash.replace(/^#/, "");
  if (!hash) return;
  const [wantedTab, groupId] = hash.split(":");
  const valid = [...document.querySelectorAll(".tab[data-tab]")].map(b => b.dataset.tab);
  if (!valid.includes(wantedTab)) return;

  if (wantedTab === "groups" && groupId) {
    tab = "groups";
    document.querySelectorAll(".tab").forEach(x => x.classList.toggle("on", x.dataset.tab === "groups"));
    await openGroupPanel(groupId);
  } else {
    setTab(wantedTab);
  }
};
