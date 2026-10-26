/* ============================================================
   editor-sheets.js — the two panels that slide up above the bar:
   "Add to this page" (layouts, brand colours, items inside a
   section) and "Removed" (restore anything taken off the page).
   Error codes: PS-412
   ============================================================ */

const PSS = (() => {
  const LAYOUTS = [
    ["pair", "Text and photo", "Heading, text, link, photo"], ["center", "Heading and text", "Centred statement"],
    ["rows", "List of details", "Label and value rows"], ["photo", "Photo banner", "Full-width image"],
    ["quote", "Quote", "Big line and credit"], ["cta", "Call to action", "Heading and button"]];
  const COLOURS = [["cream", "#FCF5EE"], ["peach", "#FADCCF"], ["terra", "#C45530"], ["sage", "#6B7B5E"]];
  const ITEMS = [["p", "Paragraph"], ["row", "Row"], ["btn", "Button"], ["img", "Photo"]];
  let mode = null, pick = null, col = "cream", note = "";
  const host = () => PSB.bar && PSB.bar.querySelector(".ps-sheet");

  function render() {
    const s = host(); if (!s) return;
    if (!mode) { s.hidden = true; s.innerHTML = ""; return; }
    s.hidden = false;
    if (mode === "tray") {
      const list = PSL.removed;
      s.innerHTML = '<div class="ps-sh-t">Removed from this page</div>' + (list.length
        ? list.map(r => '<div class="ps-rm"><span>' + esc(PSL.label(r)) + '</span><button data-s="restore" data-r="' + esc(r) + '">Restore</button></div>').join("")
        : '<div class="ps-sh-n">Nothing removed.</div>') + '<button data-s="close" class="ps-sh-x">Close</button>';
      return;
    }
    const where = PSB.sel ? "after " + PSL.label("s:" + PSB.sel) : "at the end of the page";
    s.innerHTML = '<div class="ps-sh-t">Add to this page</div><div class="ps-grid">'
      + LAYOUTS.map(l => '<button data-s="pick" data-v="' + l[0] + '" class="ps-card' + (pick === l[0] ? " on" : "") + '"><b>' + l[1] + '</b><small>' + l[2] + '</small></button>').join("")
      + '</div><div class="ps-sh-n">Background colour</div><div class="ps-cols">'
      + COLOURS.map(c => '<button data-s="col" data-v="' + c[0] + '" aria-label="' + c[0] + '" class="ps-col' + (col === c[0] ? " on" : "") + '" style="background:' + c[1] + '"></button>').join("")
      + '</div><div class="ps-sh-n">New section goes ' + where + '</div><div class="ps-two"><button data-s="go" class="ps-go">' + (pick ? "Add section" : "Choose a layout") + '</button><button data-s="close">Cancel</button></div>'
      + '<div class="ps-sh-n">Or add inside the selected section</div><div class="ps-chips">'
      + ITEMS.map(i => '<button data-s="item" data-v="' + i[0] + '">+ ' + i[1] + '</button>').join("") + '</div><div class="ps-sh-n ps-note">' + esc(note) + '</div>';
  }
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function open(m) { mode = mode === m ? null : m; pick = null; note = ""; PSB.setRm(false); render(); }
  function close() { mode = null; render(); }

  async function onClick(e) {
    const b = e.target.closest("[data-s]"); if (!b || !PSB.bar || !PSB.bar.contains(b)) return;
    e.preventDefault(); e.stopPropagation();
    const a = b.dataset.s, v = b.dataset.v;
    if (a === "close") return close();
    if (a === "pick") { pick = v; return render(); }
    if (a === "col") { col = v; return render(); }
    if (a === "restore") { const r = b.dataset.r; await PSB.act("restored " + PSL.label(r), () => PSL.restore(r)); if (!PSL.removed.length) close(); else render(); return; }
    if (a === "go") {
      if (!pick) { note = "Choose a layout first."; return render(); }
      const id = await PSB.act("added " + pick + " section", () => PSL.addBlock(pick, col, PSB.sel));
      close(); if (id) { PSB.sel = id; const n = PSL.el(id); if (n) n.scrollIntoView({ behavior: "smooth", block: "center" }); }
      return;
    }
    if (a === "item") {
      if (!PSB.sel) { note = "Tap Move on a section first, then choose what to add."; return render(); }
      const r = await PSB.act("added " + v, () => PSL.addItem(PSB.sel, v));
      note = r === false ? "That section has no list to add a row to." : "Added. Tap it to write."; render();
    }
  }
  document.addEventListener("click", onClick, true);
  return { open, close, refresh: () => { if (mode === "tray" && !PSL.removed.length) mode = null; if (mode) render(); else if (host()) render(); } };
})();
