/* ============================================================
   admin-pages.js — create and remove pages, in the Edit site tab.

   "Your pages" lists pages made here (they live at /p/<name>, served
   by functions/p/[slug].js from page-shell.html). New page asks for a
   name and whether it shows in the site menu, then opens the new page
   straight in edit mode, where the normal Add button builds it.
   Remove hides the page and takes it out of the menu but keeps
   everything on it; "Removed pages" has Restore. The built-in pages
   below can be edited but not removed (they run the shop and orders).

   Hooks into the dashboard by wrapping editSitePanel / setTab / load,
   so admin.js and admin-edit-site.js stay untouched.
   Error codes: PS-32x
   ============================================================ */

let customPages = [], pagesLoaded = false, pagesView = "list", pageToRemove = null, npSlugTouched = false;

/* Same list the database refuses (ps_page_create_impl) - checked here too so the message is friendly. */
const PAGE_RESERVED = ["admin", "index", "shop", "clubs", "services", "schools", "contact", "track", "p", "api", "js", "css",
  "img", "functions", "privacy", "terms", "refund", "cookies", "maintenance", "schools-shop", "schools-checkout",
  "sitemap", "robots", "page", "page-shell", "new", "edit", "tests", "package"];

const pageApi = {
  list: () => adminRpc("ps_admin_list_pages", {}, "PS-320"),
  create: (title, slug, nav) => adminRpc("ps_admin_create_page", { p_title: title, p_slug: slug, p_show_in_nav: nav }, "PS-321"),
  update: (id, patch) => adminRpc("ps_admin_update_page", { p_id: id, ...patch }, "PS-322"),
  group: (id, group) => adminRpc("ps_admin_set_page_nav_group", { p_id: id, p_group: group }, "PS-722")   // "order" or "" (main menu)
};

/* Where a page sits in the menu. The dropdown's name is Jo's own wording when she has changed it. */
const orderLabel = () => (typeof siteGet === "function" && siteGet("site_nav_order_product")) || "Order a product";
const menuWhere = p => !p.show_in_nav ? "Not in menu" : p.nav_group === "order" ? "In menu under " + orderLabel() : "In menu";
const navRadio = (v, text, on) => '<label style="display:flex;align-items:center;gap:12px;min-height:44px;font-size:16px;cursor:pointer">'
  + '<input type="radio" name="pgn-menu" value="' + v + '"' + (on ? " checked" : "") + ' style="width:20px;height:20px;min-height:0;flex:none"> ' + text + '</label>';

async function loadPages() {
  try { customPages = await pageApi.list(); } catch (e) { customPages = []; }
  pagesLoaded = true;   // even on failure, so a broken call can't make the screen redraw forever
}

const pageSlug = s => String(s || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "").slice(0, 36).replace(/-+$/, "");

const PG_ROW = "border-top:1px solid rgba(0,0,0,.1);padding:12px 0";
const PG_BTN = "display:inline-flex;align-items:center;min-height:44px;padding:0 16px;border-radius:8px;font-weight:500;font-size:15px;"
  + "text-decoration:none;border:0;cursor:pointer;font-family:inherit;color:#2B2522;";

function pageButtons(p) {
  if (pageToRemove === p.id) {
    return '<div style="background:#fff;border-radius:12px;padding:14px;margin-top:10px;border:0.5px solid #E3D6CB">'
      + '<div style="font-size:15px;font-weight:500">Remove ' + esc(p.title) + '?</div>'
      + '<div style="font-size:13px;opacity:.75;margin:6px 0 12px;line-height:1.5">It will disappear from the site and the menu. You can restore it from Removed pages whenever you like.</div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap">'
      + '<button style="' + PG_BTN + 'background:#2B2522;color:#FBF5EE" onclick="removePage()">Remove page</button>'
      + '<button style="' + PG_BTN + 'background:#EADBCD" onclick="cancelRemovePage()">Cancel</button></div></div>';
  }
  return '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">'
    + '<a href="p/' + attr(p.slug) + '?edit=1" style="' + PG_BTN + 'background:#F6B49C">Edit</a>'
    + '<button style="' + PG_BTN + 'background:#EADBCD" onclick="toggleNavPage(\'' + p.id + '\')">' + (p.show_in_nav ? "Hide from menu" : "Add to menu") + '</button>'
    + (p.show_in_nav ? '<button style="' + PG_BTN + 'background:#EADBCD" onclick="moveNavPage(\'' + p.id + '\')">'
      + (p.nav_group === "order" ? "Move to main menu" : "Move under " + esc(orderLabel())) + '</button>' : '')
    + '<button style="' + PG_BTN + 'background:#EADBCD" onclick="askRemovePage(\'' + p.id + '\')">Remove</button></div>';
}

function pagesHtml() {
  if (pagesView === "new") return newPageHtml();
  if (!pagesLoaded) return '<div style="padding:4px 2px 18px;opacity:.7;font-size:14px">Loading your pages…</div>';
  const live = customPages.filter(p => p.published), gone = customPages.filter(p => !p.published);
  const liveRows = live.length ? live.map(p =>
    '<div style="' + PG_ROW + '"><div style="font-size:16px">' + esc(p.title) + '</div>'
    + '<div style="font-size:12px;opacity:.65;margin-top:2px">/p/' + esc(p.slug) + ' · ' + esc(menuWhere(p)) + '</div>'
    + pageButtons(p) + '</div>').join("")
    : '<div style="' + PG_ROW + ';opacity:.65;font-size:14px">No pages yet. Make one below.</div>';
  const goneRows = gone.length ? '<h2 style="margin:22px 0 4px;font-size:18px">Removed pages</h2>'
    + gone.map(p =>
      '<div style="' + PG_ROW + ';display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">'
      + '<div><div style="font-size:15px">' + esc(p.title) + '</div><div style="font-size:12px;opacity:.65;margin-top:2px">/p/' + esc(p.slug) + '</div></div>'
      + '<button style="' + PG_BTN + 'background:#F6B49C" onclick="restorePage(\'' + p.id + '\')">Restore</button></div>').join("") : "";
  return '<div style="padding:4px 2px 8px"><h2 style="margin:8px 0 4px;font-size:20px">Your pages</h2>'
    + '<p style="margin:0 0 6px;opacity:.75;font-size:14px;line-height:1.5">Pages you have made. Each one appears in the site menu if you choose.</p>'
    + liveRows
    + '<div style="margin:14px 0 0"><button style="' + PG_BTN + 'background:#2B2522;color:#FBF5EE" onclick="openNewPage()">+ New page</button></div>'
    + goneRows + '</div><hr style="border:0;border-top:1px solid rgba(0,0,0,.15);margin:18px 0 10px">';
}

function newPageHtml() {
  return '<div style="padding:4px 2px 24px">'
    + '<button class="ghost" onclick="cancelNewPage()" style="min-height:44px;padding:0 18px;border-radius:2px;background:var(--cream-deep);margin-bottom:16px">&larr; Pages</button>'
    + '<div class="newcard"><h2 style="font-size:20px;font-family:var(--display)">New page</h2>'
    + '<div class="fld"><label for="pgn-title">Page name</label>'
    + '<input id="pgn-title" type="text" placeholder="Spring offers" oninput="newPageAuto()" autocomplete="off"></div>'
    + '<div class="fld"><label for="pgn-slug">Web address</label>'
    + '<input id="pgn-slug" type="text" placeholder="spring-offers" oninput="newPageSlugTyped()" autocomplete="off" autocapitalize="none"></div>'
    + '<p id="pgn-url" style="font-size:12px;color:var(--muted);margin:-4px 0 14px">peachstate.co.uk/p/… Letters, numbers and dashes only.</p>'
    + '<div class="fld"><label>Where should it show in the menu?</label>'
    + navRadio("top", "In the main menu", true) + navRadio("order", "Under " + esc(orderLabel()), false) + navRadio("none", "Not in the menu", false) + '</div>'
    + '<div class="notice" id="pgn-notice"></div>'
    + '<button class="btn-solid" id="pgn-save" onclick="createNewPage()" style="margin-top:18px">Create page and start building</button>'
    + '</div></div>';
}

function openNewPage() { pagesView = "new"; npSlugTouched = false; pageToRemove = null; render(); $("pgn-title")?.focus(); }
function cancelNewPage() { pagesView = "list"; render(); }
function npShowUrl() {
  const el = $("pgn-url"), s = pageSlug($("pgn-slug").value);
  if (el) el.textContent = "peachstate.co.uk/p/" + (s || "…") + "  ·  letters, numbers and dashes only.";
}
function newPageAuto() {
  if (!npSlugTouched) $("pgn-slug").value = pageSlug($("pgn-title").value);
  npShowUrl();
}
function newPageSlugTyped() { npSlugTouched = true; npShowUrl(); }

function pageGoTo(url) { location.href = url; }

async function createNewPage() {
  const title = $("pgn-title").value.trim(), slug = pageSlug($("pgn-slug").value || title);
  const choice = ((document.querySelector('input[name="pgn-menu"]:checked') || {}).value) || "top", nav = choice !== "none";
  const n = $("pgn-notice"), btn = $("pgn-save"), err = m => { n.className = "notice show err"; n.textContent = m; };
  if (!title) return err("Give the page a name.");
  if (!slug) return err("The web address needs some letters or numbers.");
  if (PAGE_RESERVED.includes(slug)) return err("'" + slug + "' is used by the site itself. Choose a different web address.");
  const clash = customPages.find(p => p.slug === slug);
  if (clash) return err(clash.published ? "You already have a page at that address." : "That address belongs to a removed page. Restore it from Removed pages, or choose another.");
  btn.disabled = true; n.className = "notice show busy"; n.textContent = "Creating…";
  try {
    const p = await pageApi.create(title, slug, nav);
    if (choice === "order") { try { await pageApi.group(p.id, "order"); } catch (e) { /* page exists, in the main menu; "Move under" on the list fixes it */ } }
    pageGoTo("p/" + p.slug + "?edit=1");               // straight into the editor
  } catch (e) {
    err("Couldn't create that page (" + e.message + "). The web address may already be used.");
    btn.disabled = false;
  }
}

function askRemovePage(id) { pageToRemove = id; render(); }
function cancelRemovePage() { pageToRemove = null; render(); }

async function pageChange(id, patch, done) {
  try { await pageApi.update(id, patch); await loadPages(); toast(done); }
  catch (e) { toast("Couldn't do that (" + e.message + ")"); }
  pageToRemove = null; render();
}
const removePage = () => pageChange(pageToRemove, { p_published: false }, "Page removed");
const restorePage = id => pageChange(id, { p_published: true }, "Page restored");
function toggleNavPage(id) {
  const p = customPages.find(x => x.id === id);
  if (p) pageChange(id, { p_show_in_nav: !p.show_in_nav }, p.show_in_nav ? "Taken out of the menu" : "Added to the menu");
}

async function moveNavPage(id) {
  const p = customPages.find(x => x.id === id);
  if (!p) return;
  const to = p.nav_group === "order" ? "" : "order";
  try { await pageApi.group(id, to); await loadPages(); toast(to ? "Moved under " + orderLabel() : "Moved to the main menu"); }
  catch (e) { toast("Couldn't do that (" + e.message + ")"); }
  pageToRemove = null; render();
}

/* ---------- wiring into the dashboard ---------- */
(function () {
  if (typeof editSitePanel !== "function") return;

  const _panel = editSitePanel;
  editSitePanel = function () { return pagesHtml() + (pagesView === "new" ? "" : _panel.apply(this, arguments)); };

  // The 30s auto-refresh must not redraw underneath someone part-way through the form.
  const _load = load;
  load = function () {
    const t = $("pgn-title"), s = $("pgn-slug");
    return (t && t.value.trim()) || (s && s.value.trim()) ? Promise.resolve() : _load.apply(this, arguments);
  };

  const _setTab = setTab;
  setTab = function () {
    _setTab.apply(this, arguments);
    if (tab === "editsite") {                           // checked after, so the #editsite restore is covered too
      pagesView = "list"; pageToRemove = null;
      loadPages().then(() => { if (tab === "editsite" && pagesView === "list") render(); });
    }
  };
})();
