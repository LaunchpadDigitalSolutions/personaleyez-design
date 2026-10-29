/* Regression test: shared "All Schools" items (trousers, pinafores, skirts...)
   must be selectable, previewable and orderable for every school.
   No network, no browser: schools-shop.js / schools-checkout.js run in a vm
   with a tiny fake DOM. Run: node tests/schools-shared-items.mjs
   (SHOP_JS=path overrides the file under test, to prove it fails on old code.) */
import vm from "node:vm";
import fs from "node:fs";

let pass = 0, fail = 0;
const check = (name, ok) => { ok ? pass++ : (fail++, console.log("FAIL", name)); };

function makeCtx(file, extra = {}){
  const els = {};
  const PICKER_FIELDS = ["su-size", "su-colour", "su-qty", "su-initials"];
  const el = id => {
    // picker fields only exist while the picker markup contains them (like the real DOM)
    if(PICKER_FIELDS.includes(id)){
      const open = els["su-picker"] && els["su-picker"].innerHTML.includes(`id="${id}"`);
      if(!open){ delete els[id]; return null; }
    }
    return els[id] || (els[id] = { id, innerHTML: "", textContent: "", className: "", value: id === "su-qty" ? "1" : "", checked: false, style: {} });
  };
  const ctx = vm.createContext({
    document: { getElementById: el, addEventListener(){} },
    sessionStorage: { _d: {}, getItem(k){ return this._d[k] ?? null; }, setItem(k, v){ this._d[k] = String(v); }, removeItem(k){ delete this._d[k]; } },
    toast(){}, healthCheck: async () => true, location: {}, console, ...extra
  });
  vm.runInContext(fs.readFileSync(file, "utf8"), ctx, { filename: file });
  return { ctx, els, run: code => vm.runInContext(code, ctx) };
}

const mk = (id, name, category, o = {}) => ({ id, name, category, price: 10, is_school_item: true, sizes: "4-5,6-7", colours: "Grey,Black", ...o });
const PRODUCTS = [
  mk("a1", "Alpha Sweatshirt", "Alpha School", { image_url: "a1.jpg", price: 12 }),
  mk("a2", "Alpha Polo",       "Alpha School", { price: 8 }),
  mk("b1", "Beta Cardigan",    "Beta School",  { price: 15 }),
  mk("s1", "Grey Trousers",    "All Schools",  { image_url: "s1.jpg", price: 9.5 }),
  mk("s2", "Pinafore",         "All Schools",  { price: 11, colours: "" }),
  mk("s3", "Skort",            "All Schools",  { price: 7.25, sizes: "" })
];

const file = process.env.SHOP_JS || "js/schools-shop.js";
const rowIds = html => [...html.matchAll(/selectItem\('([^']+)'\)/g)].map(m => m[1]);
const optionCount = (html, sel) => { const m = html.match(new RegExp(`id="${sel}">([\\s\\S]*?)</select>`)); return m ? (m[1].match(/<option>/g) || []).length : 0; };

for(const school of ["Alpha School", "Beta School"]){
  const { ctx, els, run } = makeCtx(file);
  run(`ALL_PRODUCTS = ${JSON.stringify(PRODUCTS)}; basket = [];`);
  ctx.document.getElementById("su-picker");
  run(`selectSchool(${JSON.stringify(school)})`);
  const own = PRODUCTS.filter(p => p.category === school).map(p => p.id);
  const shared = PRODUCTS.filter(p => p.category === "All Schools").map(p => p.id);
  const ids = rowIds(els["su-list"].innerHTML);
  check(`${school}: list = own then shared`, JSON.stringify(ids) === JSON.stringify(own.concat(shared)));

  let expectedTotal = 0, expectedLines = 0;
  for(const id of ids){
    const p = PRODUCTS.find(x => x.id === id);
    run(`selectItem(${JSON.stringify(id)})`);
    const picker = els["su-picker"];
    check(`${school}/${p.name}: picker opens`, picker.style.display === "block" && picker.innerHTML.includes(p.name));
    check(`${school}/${p.name}: size select`, optionCount(picker.innerHTML, "su-size") === (p.sizes ? 2 : 0));
    check(`${school}/${p.name}: colour select`, optionCount(picker.innerHTML, "su-colour") === (p.colours ? 2 : 0));
    const crestOffered = picker.innerHTML.includes("su-initials");
    check(`${school}/${p.name}: crest/initials only for school's own items`, crestOffered === (p.category !== "All Schools"));
    const prev = els["su-preview"].innerHTML;
    check(`${school}/${p.name}: preview`, p.image_url ? prev.includes(p.image_url) : prev.includes(p.name));
    if(picker.style.display !== "block") continue;   // dead row: already failed above, nothing to add
    const set = (id, v) => { const e = ctx.document.getElementById(id); if(e) e.value = v; };
    set("su-qty", "2"); set("su-size", "4-5"); set("su-colour", "Grey");
    run("addToBasket()");
    expectedTotal += p.price * 2; expectedLines++;
    check(`${school}/${p.name}: picker closes after add`, picker.style.display === "none");
  }
  const basket = JSON.parse(run("JSON.stringify(basket)"));
  check(`${school}: basket has every line`, basket.length === expectedLines);
  check(`${school}: basket total`, Math.abs(basket.reduce((s, b) => s + b.unit * b.qty, 0) - expectedTotal) < 1e-9);
  check(`${school}: shared lines have no logo note`, basket.filter(b => /Trousers|Pinafore|Skort/.test(b.name)).every(b => !b.opts.includes("logo embroidered")));

  // hand off to checkout exactly as goToUniformCheckout() does, render its summary
  run("goToUniformCheckout()");
  const co = makeCtx("js/schools-checkout.js");
  co.ctx.sessionStorage._d = { su_basket: run("sessionStorage.getItem('su_basket')"), su_school: school };
  co.run("basket = JSON.parse(sessionStorage.getItem('su_basket')); renderOrder()");
  const lines = (co.els["suc-basket"].innerHTML.match(/<li /g) || []).length;
  check(`${school}: checkout shows every line`, lines === expectedLines);
  check(`${school}: checkout lists Grey Trousers`, co.els["suc-basket"].innerHTML.includes("Grey Trousers"));
  check(`${school}: checkout total`, co.els["suc-total"].textContent === "£" + expectedTotal.toFixed(2));
}

// a school with no own items still lists (and can order) the shared ones
{
  const { ctx, els, run } = makeCtx(file);
  run(`ALL_PRODUCTS = ${JSON.stringify(PRODUCTS)}; basket = [];`);
  ctx.document.getElementById("su-picker");
  run(`selectSchool("Gamma School")`);
  check("school with no own items still lists shared items", rowIds(els["su-list"].innerHTML).length === 3);
  run(`selectItem("s1")`);
  check("...and the shared item opens", els["su-picker"].style.display === "block");
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
