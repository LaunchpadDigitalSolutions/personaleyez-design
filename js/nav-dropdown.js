/* nav-dropdown.js - a grouped site menu: desktop dropdown, mobile accordion, footer group.
   Plain script, no import or export, so it works as <script src> and under require().
   Renders strings only; the host puts them in the page. Labels are escaped unless the host
   supplies o.label(item) (Peach State uses it to return editable <span data-edit> wording).
   Behaviour is delegated from the document, so re-rendering the header is safe. Errors: PS-720..PS-721. */
(function (root) {
  "use strict";
  var SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
  var ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ESC[c]; }); }

  /* Pages saved by the site owner. Accepts a JSON string or an array. Old caches have no nav_group and
     simply come back as top level; junk rows and repeats are dropped; nothing here throws. */
  function parsePages(raw, onError) {
    var rows = raw;
    if (typeof raw === "string") {
      try { rows = JSON.parse(raw || "[]"); }
      catch (e) { if (onError) onError("PS-721", "menu cache unreadable"); return []; }
    }
    if (!Array.isArray(rows)) return [];
    var seen = {}, out = [];
    rows.forEach(function (p) {
      if (!p || typeof p !== "object") return;
      var slug = typeof p.slug === "string" ? p.slug : "";
      var title = typeof p.title === "string" ? p.title.trim() : "";
      if (!SLUG.test(slug) || !title || seen[slug]) return;
      seen[slug] = 1;
      out.push({ slug: slug, title: title, group: typeof p.nav_group === "string" ? p.nav_group : null });
    });
    return out;
  }

  /* o: { links:[[href,label]], group:{key,label,labelKey,after,children:[[href,label]]}, pages, onError }
     Returns the flat model: links with the group placed after group.after, then top-level pages. */
  function build(o) {
    o = o || {};
    var g = o.group, pages = parsePages(o.pages, o.onError);
    var model = (o.links || []).map(function (l) { return { type: "link", href: l[0], key: l[0], label: l[1] }; });
    var kids = [], extra = [];
    if (g) {
      kids = (g.children || []).map(function (c) { return { href: c[0], key: c[0], label: c[1], custom: false }; });
      pages.forEach(function (p) {
        if (p.group === g.key) kids.push({ href: "p/" + p.slug, key: null, label: p.title, custom: true });
      });
    }
    pages.forEach(function (p) {
      if (g && p.group === g.key) return;
      extra.push({ type: "link", href: "p/" + p.slug, key: null, label: p.title, custom: true });
    });
    if (g && kids.length) {
      var at = -1;
      model.forEach(function (l, i) { if (l.href === g.after) at = i; });
      model.splice(at < 0 ? model.length : at + 1, 0,
        { type: "group", key: g.key, label: g.label, labelKey: g.labelKey || g.key, children: kids });
    }
    return model.concat(extra);
  }

  function isOn(it, here) {
    return it.type === "group" ? it.children.some(function (c) { return c.href === here; }) : it.href === here;
  }
  function lab(o, it) { return o && o.label ? o.label(it) : esc(it.label); }
  function chev() {
    return '<svg class="nd-chev" viewBox="0 0 12 12" width="10" height="10" aria-hidden="true" focusable="false">' +
      '<path d="M2 4.5 6 8.5 10 4.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  function item(c, cls, o, here) {
    return '<a href="' + esc(c.href) + '" class="' + cls + (c.href === here ? " on" : "") + '">' + lab(o, c) + "</a>";
  }

  function desktop(model, o) {
    var here = o && o.here;
    return model.map(function (it) {
      if (it.type === "link") return '<a href="' + esc(it.href) + '" class="' + (it.href === here ? "on" : "") + '">' + lab(o, it) + "</a>";
      var id = "nd-menu-" + esc(it.key);
      return '<div class="nd-group" data-nd="' + esc(it.key) + '"><button type="button" class="nd-parent' + (isOn(it, here) ? " on" : "") +
        '" aria-expanded="false" aria-haspopup="true" aria-controls="' + id + '">' + lab(o, it) + chev() + "</button>" +
        '<div class="nd-menu" id="' + id + '" hidden><div class="nd-panel">' +
        it.children.map(function (c) { return item(c, "nd-item", o, here); }).join("") + "</div></div></div>";
    }).join("");
  }

  function mobile(model, o) {
    var here = o && o.here;
    return model.map(function (it) {
      if (it.type === "link") return '<a class="navlink" href="' + esc(it.href) + '">' + lab(o, it) + "</a>";
      var id = "nd-kids-" + esc(it.key), open = isOn(it, here);
      return '<div class="nd-mgroup"><button type="button" class="navlink nd-mparent" aria-expanded="' + open + '" aria-controls="' + id + '">' +
        "<span>" + lab(o, it) + "</span>" + chev() + "</button>" +
        '<div class="nd-kids" id="' + id + '"' + (open ? "" : " hidden") + ">" +
        it.children.map(function (c) { return item(c, "nd-kid", o, here); }).join("") + "</div></div>";
    }).join("");
  }

  function footer(model, o) {
    var here = o && o.here;
    return model.map(function (it) {
      if (it.type === "link") return '<a href="' + esc(it.href) + '">' + lab(o, it) + "</a>";
      return '<span class="nd-fgroup">' + lab(o, it) + '</span><div class="nd-fsub">' +
        it.children.map(function (c) { return item(c, "nd-fitem", o, here); }).join("") + "</div>";
    }).join("");
  }

  /* ---- behaviour: call init(document) once; handlers are delegated ---- */
  function init(doc, o) {
    doc = doc || root.document;
    if (!doc || doc.__ndInit) return;
    doc.__ndInit = true;
    var fail = function (e) { if (o && o.onError) o.onError("PS-720", String((e && e.message) || e)); };
    var closeDelay = (o && o.closeDelay) || 140, quiet = false;

    function parts(g) { return { btn: g.querySelector(".nd-parent"), menu: g.querySelector(".nd-menu") }; }
    function open(g, byHover) {
      var p = parts(g); if (!p.btn || !p.menu) return;
      closeAll(g);
      clearTimeout(g._ndT);
      p.menu.hidden = false; p.btn.setAttribute("aria-expanded", "true");
      g.classList.add("nd-open"); g._ndHover = !!byHover;
    }
    function close(g) {
      var p = parts(g); if (!p.btn || !p.menu) return;
      clearTimeout(g._ndT);
      p.menu.hidden = true; p.btn.setAttribute("aria-expanded", "false");
      g.classList.remove("nd-open"); g._ndHover = false;
    }
    function closeAll(except) {
      Array.prototype.forEach.call(doc.querySelectorAll(".nd-group.nd-open"), function (g) { if (g !== except) close(g); });
    }
    function mouse(e) { return !e.pointerType || e.pointerType === "mouse"; }
    function focusVisible(el) { try { return el.matches(":focus-visible"); } catch (x) { return false; } }

    doc.addEventListener("click", function (e) {
      try {
        var t = e.target, mp = t.closest && t.closest(".nd-mparent");
        if (mp) {
          var on = mp.getAttribute("aria-expanded") === "true", kids = doc.getElementById(mp.getAttribute("aria-controls"));
          mp.setAttribute("aria-expanded", String(!on)); if (kids) kids.hidden = on;
          return;
        }
        var btn = t.closest && t.closest(".nd-parent");
        if (btn) {
          var g = btn.closest(".nd-group");
          if (g._ndHover) { g._ndHover = false; return; }
          g.classList.contains("nd-open") ? close(g) : open(g, false);
          return;
        }
        closeAll(t.closest && t.closest(".nd-group"));
      } catch (x) { fail(x); }
    });

    doc.addEventListener("keydown", function (e) {
      try {
        var t = e.target, g = t.closest && t.closest(".nd-group");
        if (e.key === "Escape") {
          var openG = doc.querySelector(".nd-group.nd-open");
          if (!openG) return;
          var inside = openG.contains(t); closeAll();
          if (inside) { quiet = true; openG.querySelector(".nd-parent").focus(); quiet = false; }
          return;
        }
        if (!g) return;
        var items = Array.prototype.slice.call(g.querySelectorAll(".nd-item")), i = items.indexOf(t);
        if (t.classList.contains("nd-parent") && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
          e.preventDefault(); open(g, false);
          if (items.length) items[e.key === "ArrowDown" ? 0 : items.length - 1].focus();
        } else if (i > -1 && (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Home" || e.key === "End")) {
          e.preventDefault();
          var next = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : (i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
          items[next].focus();
        }
      } catch (x) { fail(x); }
    });

    doc.addEventListener("focusin", function (e) {
      try {
        if (quiet) return;
        var t = e.target, g = t.closest && t.closest(".nd-group");
        if (g && t.classList.contains("nd-parent") && focusVisible(t) && !g.classList.contains("nd-open")) open(g, false);
        else closeAll(g);
      } catch (x) { fail(x); }
    });

    doc.addEventListener("pointerover", function (e) {
      try {
        if (!mouse(e)) return;
        var g = e.target.closest && e.target.closest(".nd-group");
        if (!g) return;
        clearTimeout(g._ndT);
        if (!g.classList.contains("nd-open")) open(g, true);
      } catch (x) { fail(x); }
    });
    doc.addEventListener("pointerout", function (e) {
      try {
        if (!mouse(e)) return;
        var g = e.target.closest && e.target.closest(".nd-group");
        if (!g || (e.relatedTarget && g.contains(e.relatedTarget))) return;
        if (g._ndHover) g._ndT = setTimeout(function () { close(g); }, closeDelay);
      } catch (x) { fail(x); }
    });
  }

  var api = { esc: esc, parsePages: parsePages, build: build, isOn: isOn, desktop: desktop, mobile: mobile, footer: footer, init: init };
  if (typeof module === "object" && module.exports) module.exports = api;
  root.NavDropdown = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
