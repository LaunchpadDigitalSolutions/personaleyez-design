/* ============================================================
   editor-bar.js — the editing toolbar (edit mode only): undo/redo,
   move, remove, add, and save status. History is in memory for the
   session and covers text, photos, order, removals and additions.
   Error codes: PS-411 (undo/redo), PS-410 (layout save)
   ============================================================ */

const PSB = (() => {
  const H = { undo: [], redo: [], replay: false };
  let bar, sel = null, rmMode = false, status = "idle", msg = "", timer = null;
  const $ = s => bar.querySelector(s);

  function setStatus(s, m) {
    status = s; msg = m || ""; clearTimeout(timer); refresh();
    if (s === "saved") timer = setTimeout(() => { status = "idle"; refresh(); }, 1800);
  }
  async function saveLayout() {
    setStatus("saving");
    try { await PSL.save(); setStatus("saved"); } catch (e) { console.error("PS-410", e); setStatus("error"); }
  }

  /* ---------- history ---------- */
  function push(label, undoFn, redoFn) { if (H.replay) return; H.undo.push({ label, undoFn, redoFn }); H.redo = []; refresh(); }
  async function replay(from, to, key, verb) {
    const e = from.pop();
    if (!e) { setStatus(status, "Nothing to " + verb); return; }
    H.replay = true; setStatus("saving");
    try { await e[key](); to.push(e); setStatus("saved", (verb === "undo" ? "Undone: " : "Redone: ") + e.label); }
    catch (err) { console.error("PS-411", err); from.push(e); setStatus("error"); }
    H.replay = false; refresh();
  }
  /* a layout change: run it, record how to undo/redo it, save */
  async function act(label, fn) {
    const before = PSL.snap();
    const r = fn();
    if (r === false) return false;
    const after = PSL.snap();
    const go = s => () => { PSL.restoreSnap(s); return PSL.save(); };
    push(label, go(before), go(after));
    PSL.apply(); await saveLayout(); return r;
  }

  /* text and photo edits (made by inline-edit.js) get undo too */
  const _rawSave = saveContent;
  async function setKey(key, val) {
    await _rawSave(PSL.page, key, val); CONTENT[key] = val;
    if (key.startsWith("img_")) document.querySelectorAll('[data-img="' + key.slice(4) + '"]').forEach(i => { i.src = val + (val.includes("?") ? "&" : "?") + "v=" + Date.now(); });
    else document.querySelectorAll('[data-edit="' + key + '"]').forEach(t => { t.textContent = val; delete t.dataset.ph; });
  }
  saveContent = async function (page, key, value) {
    const prev = CONTENT[key] !== undefined ? CONTENT[key] : PSL.orig[key];
    const r = await _rawSave(page, key, value);
    if (key !== "_layout" && !H.replay && prev !== undefined && prev !== value) {
      push(key.startsWith("img_") ? "photo change" : "text edit", () => setKey(key, prev), () => setKey(key, value));
    }
    return r;
  };

  /* ---------- toolbar ---------- */
  const PATHS = {   // inline icons (the site doesn't load an icon font)
    "arrow-back-up": '<path d="M9 14l-4 -4l4 -4"/><path d="M5 10h11a4 4 0 1 1 0 8h-1"/>',
    "arrow-forward-up": '<path d="M15 14l4 -4l-4 -4"/><path d="M19 10h-11a4 4 0 1 0 0 8h1"/>',
    "arrow-up": '<path d="M12 5l0 14"/><path d="M18 11l-6 -6"/><path d="M6 11l6 -6"/>',
    "arrow-down": '<path d="M12 5l0 14"/><path d="M18 13l-6 6"/><path d="M6 13l6 6"/>',
    "trash": '<path d="M4 7l16 0"/><path d="M10 11l0 6"/><path d="M14 11l0 6"/><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12"/><path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3"/>',
    "plus": '<path d="M12 5l0 14"/><path d="M5 12l14 0"/>',
    "grip-vertical": '<circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/>'
  };
  const ic = n => '<svg class="ps-ic" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + PATHS[n] + '</svg>';
  function btn(a, icon, label, on) { return '<button data-a="' + a + '" aria-label="' + label + '" class="ps-b' + (on === false ? " dim" : "") + (a === "rm" && rmMode ? " on" : "") + '">' + ic(icon) + '</button>'; }
  function refresh() {
    if (!bar) return;
    if (sel && !PSL.el(sel)) sel = null;           // the selected section is gone (e.g. its add was undone)
    const vis = PSL.visible(), p = sel ? vis.indexOf(sel) : -1;
    const info = rmMode ? "Tap anything to remove it" : sel ? PSL.label("s:" + sel) + " · " + (p + 1) + " of " + vis.length
      : (msg || "Tap Move on a section to reorder it");
    const st = { idle: H.undo.length ? H.undo.length + " change" + (H.undo.length > 1 ? "s" : "") + " this session" : "No changes yet",
      saving: "Saving…", saved: "Saved · live now", error: "Couldn’t save that." }[status];
    $(".ps-info").textContent = info + (sel && msg ? " — " + msg : "");
    $(".ps-st").innerHTML = st + (status === "error" ? ' <a href="#" data-a="retry">Retry</a>' : "");
    $(".ps-st").dataset.s = status;
    const n = PSL.removed.length;
    $(".ps-row").innerHTML = btn("undo", "arrow-back-up", "Undo", H.undo.length > 0) + btn("redo", "arrow-forward-up", "Redo", H.redo.length > 0)
      + '<span class="ps-sep"></span>' + btn("up", "arrow-up", "Move section up", !!sel && p > 0) + btn("down", "arrow-down", "Move section down", !!sel && p < vis.length - 1)
      + btn("rm", "trash", "Remove", true)
      + '<button data-a="add" class="ps-pill">' + ic("plus") + ' Add</button>'
      + (n ? '<button data-a="tray" class="ps-pill alt">Removed (' + n + ')</button>' : "");
    document.querySelectorAll("[data-sec]").forEach(s => s.classList.toggle("ps-sel", s.dataset.sec === sel));
    document.querySelectorAll(".ps-movetab").forEach(t => { const on = t.dataset.for === sel; t.innerHTML = ic("grip-vertical") + (on ? " Selected" : " Move"); t.classList.toggle("on", on); });
    typeof PSS !== "undefined" && PSS.refresh();
  }
  function tabs() {                         // a Move tab on every section
    PSL.ids().forEach(id => {
      const s = PSL.el(id); if (!s || s.querySelector(":scope > .ps-movetab")) return;
      const t = document.createElement("button"); t.className = "ps-movetab"; t.dataset.for = id; t.setAttribute("aria-label", "Select section to move");
      s.appendChild(t);
    });
  }

  async function onAct(a) {
    const vis = PSL.visible();
    if (a === "undo") return replay(H.undo, H.redo, "undoFn", "undo");
    if (a === "redo") return replay(H.redo, H.undo, "redoFn", "redo");
    if (a === "retry") return saveLayout();
    if (a === "done") { const d = document.getElementById("ps-editbar-done"); if (d) d.click(); return; }
    if (a === "add") return PSS.open("add");
    if (a === "tray") return PSS.open("tray");
    if ((a === "up" || a === "down") && !sel) { setStatus(status, "Pick a section first"); return; }
    if (a === "up" || a === "down") {
      const ok = await act("moved " + PSL.label("s:" + sel) + " " + a, () => PSL.move(sel, a === "up" ? -1 : 1));
      if (ok === false) setStatus(status, a === "up" ? "Already at the top" : "Already at the bottom");
      else PSL.el(sel).scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (a === "rm") {
      if (sel) { const s = sel; sel = null; await act("removed " + PSL.label("s:" + s), () => PSL.remove("s:" + s)); }
      else { rmMode = !rmMode; setStatus(status, ""); }
    }
  }

  /* ---------- clicks ---------- */
  function onClick(e) {
    if (!document.body.classList.contains("ps-edit-on")) return;
    const t = e.target;
    if (t.closest(".ps-bar")) { const b = t.closest("[data-a]"); if (b) { e.preventDefault(); onAct(b.dataset.a); } return; }
    const tab = t.closest(".ps-movetab");
    if (tab) { e.preventDefault(); e.stopPropagation(); sel = sel === tab.dataset.for ? null : tab.dataset.for; rmMode = false; refresh(); return; }
    if (t.closest(".ps-edit-toggle,.ps-editbar,.ps-pin-pop")) return;
    if (rmMode) {                            // tap-to-remove mode
      e.preventDefault(); e.stopPropagation();
      const ref = PSL.refFor(t);
      if (ref) act("removed " + PSL.label(ref), () => PSL.remove(ref));
      return;
    }
    if (t.closest("a") && !t.closest("[data-edit]")) e.preventDefault();   // links don't navigate while editing
  }

  function init() {
    if (bar) { tabs(); return; }
    bar = document.createElement("div"); bar.className = "ps-bar";
    bar.innerHTML = '<div class="ps-sheet" hidden></div><div class="ps-line"><span class="ps-info"></span><span class="ps-st"></span></div><div class="ps-row"></div>';
    document.body.appendChild(bar);
    document.addEventListener("click", onClick, true);
    tabs(); refresh();
  }
  return { init, refresh: () => { if (bar) { tabs(); refresh(); } }, act, setStatus, saveLayout, get sel() { return sel; }, set sel(v) { sel = v; refresh(); },
           get bar() { return bar; }, hist: H, setRm: v => { rmMode = v; refresh(); } };
})();
