/* ============================================================
   page-shell.js — boots a page made in the admin (/p/<name>).
   functions/p/[slug].js sets <body data-page="p-<name>">; everything
   on the page (text, photos, added sections, order) is saved in
   ps_content under that page key, exactly like the built-in pages,
   so the whole inline editor works here unchanged.
   ============================================================ */
document.addEventListener("DOMContentLoaded", async () => {
  const page = document.body.getAttribute("data-page");
  if (!page) return;

  await loadContent(page);
  applyContent();

  // Placeholder text ("Click to write...") only exists to be clicked on.
  // Once something is saved there it stops being a placeholder; visitors
  // never see ones that were left empty.
  const admin = typeof psHasPin === "function" && psHasPin();
  document.querySelectorAll("[data-ph]").forEach(el => {
    const key = el.getAttribute("data-edit");
    if (key && typeof CONTENT !== "undefined" && CONTENT[key]) el.removeAttribute("data-ph");
    else if (!admin) el.remove();
  });

  psInitInlineEditor(page);
});
