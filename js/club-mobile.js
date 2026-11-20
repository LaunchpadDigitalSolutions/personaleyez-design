/* ============================================================
   club-mobile.js — phone layout helpers for club / school shops.
   Wraps renderProducts() and renderBasket() from clubs.js: adds
   plus/minus buttons beside each item, tap-a-circle to enlarge the
   photo, and a "N items - total - View order" bar. All of it is
   hidden on desktop by css/club-mobile.css.
   ============================================================ */
(function () {
  const phone = () => window.matchMedia("(max-width:699px)").matches;
  const baseProducts = window.renderProducts, baseBasket = window.renderBasket;

  // Add stepper + zoom to each item row after clubs.js draws them.
  function enhance() {
    document.querySelectorAll("#s-products .piece").forEach(piece => {
      const qty = piece.querySelector('input[id^="qt-"]');
      if (!qty || piece.dataset.pc) return;
      piece.dataset.pc = "1";
      const qtyFld = qty.closest(".fld");
      qtyFld.classList.add("pc-qty");

      const ctl = document.createElement("div");           // size + colour + stepper in one row
      ctl.className = "pc-ctl";
      piece.querySelectorAll(".fld").forEach(f => { if (f !== qtyFld) ctl.appendChild(f); });
      const step = document.createElement("div");
      step.className = "pc-step";
      step.innerHTML = '<button type="button" aria-label="Fewer" data-d="-1">&minus;</button>' +
        '<span aria-live="polite">' + (parseInt(qty.value) || 0) + '</span>' +
        '<button type="button" aria-label="More" data-d="1">+</button>';
      step.addEventListener("click", e => {
        const b = e.target.closest("button"); if (!b) return;
        qty.value = Math.max(0, Math.min(20, (parseInt(qty.value) || 0) + Number(b.dataset.d)));
        step.querySelector("span").textContent = qty.value;
        renderBasket();
      });
      ctl.appendChild(step);
      qtyFld.before(ctl);                                   // desktop order stays size, colour, qty

      const wrap = piece.querySelector(".imgwrap:not(.noimg)");
      if (wrap) wrap.addEventListener("click", () => zoom(wrap.querySelector("img")));
    });
    bar();
  }

  // Tap a circle: show the full photo, tap again to close.
  function zoom(img) {
    if (!phone() || !img) return;
    const o = document.createElement("div");
    o.id = "pc-zoom";
    o.innerHTML = '<img alt="' + (img.alt || "").replace(/"/g, "&quot;") + '" src="' + img.src + '">';
    o.addEventListener("click", () => o.remove());
    document.body.appendChild(o);
  }

  // Bottom bar: running count and total, jumps to the order box.
  function bar() {
    let b = document.getElementById("pc-bar");
    if (!b) {
      b = document.createElement("button");
      b.id = "pc-bar"; b.type = "button";
      b.addEventListener("click", () => {
        const box = document.getElementById("s-basketbox");
        if (box) box.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      document.body.appendChild(b);
    }
    const list = (typeof picks !== "undefined" && picks) || [];
    const count = list.reduce((s, p) => s + p.qty, 0);
    const total = list.reduce((s, p) => s + p.unit * p.qty, 0);
    const priced = list.every(p => p.unit > 0);
    b.textContent = count + (count === 1 ? " item" : " items") + (priced ? " · £" + total.toFixed(2) : "") + " · View order";
    b.classList.toggle("on", count > 0);
  }

  window.renderProducts = function () { baseProducts(); enhance(); };
  window.renderBasket = function () { baseBasket(); bar(); };
})();
