/* Job 06: per-school overrides on the shared pool.
   No network, no browser: scripts run in a vm with a tiny fake DOM.
   Run from the repo root: node tests/schools-overrides.mjs */
import vm from "node:vm";
import fs from "node:fs";

let pass = 0, fail = 0;
const check = (name, ok) => { ok ? pass++ : (fail++, console.log("FAIL", name)); };
const read = f => fs.readFileSync(f, "utf8");

await import(new URL("../js/pool-overrides.js", import.meta.url));
const PO = globalThis.PoolOverrides;

/* ---------- data: pool + raw school rows, merged the way the database does ---------- */
const POOL = [
  { id: "p-hoody", name: "Hoody", price: 18, sizes: "Age 3-4, Age 5-6", image_url: null, needs_own_photo: true },
  { id: "p-sweat", name: "Sweatshirt", price: 14, sizes: "22inch, 24inch", image_url: null, needs_own_photo: true }
];
const BLACK_PHOTO = "/api/product-photo/BLACK";
const RAW = [
  { id: "e-hoody", category: "Eldon Grove Academy", catalog_id: "p-hoody", colour: "Royal Blue", image_url: "/api/product-photo/EBLUE", sort_order: 3 },
  { id: "e-sweat", category: "Eldon Grove Academy", catalog_id: "p-sweat", colour: "Royal Blue", image_url: "/api/product-photo/ESWEAT", sort_order: 2 },
  { id: "r-hoody", category: "Rossmere Academy", catalog_id: "p-hoody", colour: "Red", image_url: "/api/product-photo/RRED", sort_order: 3 },
  { id: "n-black", category: "Needs Sorting", catalog_id: "p-hoody", colour: "Black", image_url: BLACK_PHOTO, sort_order: 5 },
  { id: "s1", category: "All Schools", name: "Grey Trousers", price: 22, sizes: "24in", image_url: "/api/product-photo/GREY", sort_order: 1 }
];
const merge = (raw, pools = POOL) => raw.map(r => {
  const c = pools.find(p => p.id === r.catalog_id);
  const m = PO.merge(c, r, { crestDefault: x => !["All Schools", "Needs Sorting"].includes(x.category) });
  return { ...m, pool_name: c && c.name, pool_price: c && c.price, is_school_item: true, active: true };
});

/* ---------- harness: fake DOM like tests/schools-shared-items.mjs ---------- */
function shopCtx() {
  const els = {};
  const PICKER = ["su-size", "su-colour", "su-qty", "su-initials"];
  const el = id => {
    if (PICKER.includes(id)) {
      const open = els["su-picker"] && els["su-picker"].innerHTML.includes(`id="${id}"`);
      if (!open) { delete els[id]; return null; }
    }
    return els[id] || (els[id] = { id, innerHTML: "", textContent: "", className: "", value: id === "su-qty" ? "1" : "", checked: false, style: {} });
  };
  const ctx = vm.createContext({
    document: { getElementById: el, addEventListener() {} },
    sessionStorage: { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } },
    toast() {}, healthCheck: async () => true, location: {}, console
  });
  vm.runInContext(read("js/escape.js"), ctx);
  vm.runInContext(read("js/schools-registry.js"), ctx);
  vm.runInContext(read("js/schools-shop.js"), ctx);
  return { ctx, els, run: code => vm.runInContext(code, ctx) };
}

/* ---------- A. storefront shows the merged value everywhere ---------- */
{
  const raw = RAW.map(r => r.id === "e-hoody" ? { ...r, colour: "Black", image_url: BLACK_PHOTO } : r);   // what Jo's change stores
  const merged = merge(raw);
  check("merge: Eldon hoody is Black Hoody", merged.find(m => m.id === "e-hoody").name === "Black Hoody");
  check("merge: Eldon hoody price follows pool", merged.find(m => m.id === "e-hoody").price === 18);
  check("merge: Eldon sweatshirt unchanged", merged.find(m => m.id === "e-sweat").name === "Royal Blue Sweatshirt");
  check("merge: Rossmere hoody unchanged", merged.find(m => m.id === "r-hoody").name === "Red Hoody");

  const { ctx: shopVm, els, run } = shopCtx();
  run(`ALL_PRODUCTS = ${JSON.stringify(merged)}; basket = [];`);
  run(`selectSchool("Eldon Grove Academy")`);
  const list = els["su-list"].innerHTML;
  check("storefront list: Black Hoody present", list.includes("Black Hoody"));
  check("storefront list: no Royal Blue Hoody", !list.includes("Royal Blue Hoody"));
  check("storefront list: Royal Blue Sweatshirt still there", list.includes("Royal Blue Sweatshirt"));
  check("storefront list: shared trousers still there", list.includes("Grey Trousers"));
  run(`selectItem("e-hoody")`);
  check("storefront preview: black photo", els["su-preview"].innerHTML.includes(BLACK_PHOTO));
  check("storefront picker: title Black Hoody", els["su-picker"].innerHTML.includes("<h3 style=\"font-size:19px\">Black Hoody</h3>"));
  check("storefront picker: crest offered (item is crested)", els["su-picker"].innerHTML.includes("su-initials"));
  shopVm.document.getElementById("su-qty").value = "2";
  run("addToBasket()");
  const basket = JSON.parse(run("JSON.stringify(basket)"));
  check("basket: line name Black Hoody", basket.length === 1 && basket[0].name === "Black Hoody");
  check("basket: price 18 x2", basket[0].unit === 18 && basket[0].qty === 2);
  run("goToUniformCheckout()");
  const co = shopCtx();
  co.ctx.sessionStorage._d = { su_basket: run("sessionStorage.getItem('su_basket')"), su_school: "Eldon Grove Academy" };
  const coEls = {};
  const coCtx = vm.createContext({
    document: { getElementById: id => coEls[id] || (coEls[id] = { id, innerHTML: "", textContent: "", className: "", value: "", style: {} }), addEventListener() {} },
    sessionStorage: co.ctx.sessionStorage, toast() {}, location: {}, console
  });
  vm.runInContext(read("js/escape.js"), coCtx);
  vm.runInContext(read("js/schools-checkout.js"), coCtx);
  vm.runInContext("basket = JSON.parse(sessionStorage.getItem('su_basket')); renderOrder()", coCtx);
  check("checkout summary: Black Hoody", coEls["suc-basket"].innerHTML.includes("Black Hoody"));
  check("checkout summary: not Royal Blue", !coEls["suc-basket"].innerHTML.includes("Royal Blue"));

  run(`selectSchool("Rossmere Academy")`);
  check("other school unchanged: Red Hoody", els["su-list"].innerHTML.includes("Red Hoody") && !els["su-list"].innerHTML.includes("Black Hoody"));
}

/* ---------- B. crest flag: boolean wins, old category rule is the fallback ---------- */
{
  const { els, run } = shopCtx();
  const rows = merge([{ ...RAW[0], crest: false }]);
  run(`ALL_PRODUCTS = ${JSON.stringify(rows)}; basket = [];`);
  run(`selectSchool("Eldon Grove Academy"); selectItem("e-hoody")`);
  check("crest off override: initials not offered", !els["su-picker"].innerHTML.includes("su-initials"));
  run(`ALL_PRODUCTS = [{id:"x", name:"Old row", category:"Fens Primary School", price:5, is_school_item:true}]; selectSchool("Fens Primary School"); selectItem("x")`);
  check("no crest field: category rule still crests school items", els["su-picker"].innerHTML.includes("su-initials"));
}

/* ---------- C. pool edit reaches only schools that have not overridden that field ---------- */
{
  const raw = RAW.map(r => r.id === "r-hoody" ? { ...r, price: 20 } : r);
  const before = merge(raw), after = merge(raw, POOL.map(p => p.id === "p-hoody" ? { ...p, price: 19 } : p));
  const price = (list, id) => list.find(x => x.id === id).price;
  check("pool price edit: Eldon follows", price(before, "e-hoody") === 18 && price(after, "e-hoody") === 19);
  check("pool price edit: overriding school keeps its price", price(before, "r-hoody") === 20 && price(after, "r-hoody") === 20);
}

/* ---------- D. public loader ---------- */
{
  const calls = [];
  const ctx = vm.createContext({ sb: async (path, opts, code) => { calls.push({ path, opts, code }); return []; }, console });
  vm.runInContext(read("js/schools-items.js"), ctx);
  await vm.runInContext("listSchoolItems()", ctx);
  check("loader: calls the merged rpc", calls.length === 1 && calls[0].path === "rpc/ps_school_items_json" && calls[0].opts.method === "POST" && calls[0].code === "PS-615");
}

/* ---------- E. admin Schools flow ---------- */
function adminCtx(overrides = {}) {
  const els = {}, rpc = [];
  const el = id => els[id] || (els[id] = { id, innerHTML: "", textContent: "", className: "", value: "", style: {}, dataset: {}, disabled: false, click() {}, querySelectorAll: () => [], insertAdjacentHTML() {} });
  const ITEMS = merge(RAW).map(m => m.id === "e-hoody" ? { ...m, overrides: ["colour"] } : m);
  const ctx = vm.createContext({
    document: { getElementById: el }, window: { scrollTo() {} }, console, PoolOverrides: undefined,
    toast: t => (ctx.__toast = t), sb: async () => [{ name: "Eldon Grove Academy" }, { name: "Rossmere Academy" }, { name: "Fens Primary School" }],
    adminRpc: async (name, params) => {
      rpc.push({ name, params });
      if (overrides[name]) return overrides[name](params);
      if (name === "ps_admin_list_school_items") return ITEMS;
      if (name === "ps_admin_list_pool") return POOL.map(p => ({ ...p, used_by: 2 }));
      return { added: 1 };
    },
    uploadItemPhoto: async () => "/api/product-photo/NEW",
    plural: (n, w) => n + " " + w + (n === 1 ? "" : "s"), catThumb: c => `<img src="${c.image_url || ""}">`,
    esc: v => String(v ?? ""), attr: v => String(v ?? "").replace(/"/g, "&quot;"), money: n => "£" + Number(n).toFixed(2),
    $: id => el(id)
  });
  vm.runInContext(read("js/pool-overrides.js"), ctx);
  vm.runInContext(`var tab = "schools"; function render(){} function load(){ return Promise.resolve("loaded"); }
    function setTab(t){ tab = t; } function suggestOpts(){ return [{ id: 1, tag: "School uniform" }, { id: 2, tag: "Dance" }]; }`, ctx);
  vm.runInContext(read("js/admin-schools.js"), ctx);
  const run = code => vm.runInContext(code, ctx);
  return { ctx, els, rpc, run, panel: () => els.panel.innerHTML };
}

{
  const a = adminCtx();
  await a.run("schLoad()"); a.run("render()");
  check("admin list: shows schools", a.panel().includes("Eldon Grove Academy") && a.panel().includes("Rossmere Academy"));
  check("admin list: counts items", a.panel().includes("2 items"));
  a.run("schOpen(0)");
  check("admin items: Eldon hoody listed", a.panel().includes("Royal Blue Hoody") && a.panel().includes("Change for this school"));
  check("admin items: Add from pool button", a.panel().includes("Add from pool"));
  check("admin items: does not list other schools' items", !a.panel().includes("Red Hoody"));

  a.run(`schEdit("e-hoody"); render()`);
  check("form: pool name heading, only-this-school note", a.panel().includes(">Hoody<") && a.panel().includes("Eldon Grove Academy only. Other schools stay the same."));
  check("form: colour list has Black and Red", a.panel().includes("<option>Black</option>") && a.panel().includes("<option>Red</option>"));
  check("form: photo list offers the Black Hoody photo", a.panel().includes("Black Hoody (Needs Sorting)"));
  a.run(`schColour("Black")`);
  check("form: shows as Black Hoody", a.els["sch-shown"].textContent === "Black Hoody");
  check("form: photo mismatch heads-up while photo unchanged", a.els["sch-photo-note"].innerHTML.includes("may not match black"));
  a.run(`schPhoto(String(schForm.alts.findIndex(x => x.label.startsWith("Black Hoody"))))`);
  check("form: picking the black photo clears the heads-up", a.els["sch-photo-note"].innerHTML === "");
  check("form: preview shows the black photo", a.panel().includes(BLACK_PHOTO));

  a.rpc.length = 0;
  await a.run("schSave()");
  const save = a.rpc.find(c => c.name === "ps_admin_set_school_item");
  check("save: one write only", a.rpc.filter(c => c.name === "ps_admin_set_school_item").length === 1);
  check("save: targets Eldon hoody", save && save.params.p_id === "e-hoody");
  check("save: colour Black + black photo", save && save.params.p_colour === "Black" && save.params.p_image_url === BLACK_PHOTO);
  check("save: pool price sent so the database stores null", save && save.params.p_price === 18 && save.params.p_name === null);
  check("saved: back on items with message", a.run("schView") === "items" && a.panel().includes("Saved for Eldon Grove Academy. Other schools are unchanged."));

  a.run(`schEdit("e-sweat"); schColour("__other"); schForm.other = "Bottle green"; render()`);
  a.rpc.length = 0;
  await a.run("schSave()");
  check("other colour: typed colour is sent", a.rpc.find(c => c.name === "ps_admin_set_school_item").params.p_colour === "Bottle green");

  a.run(`schEdit("e-sweat"); schColour("__other"); schForm.other = ""; render()`);
  a.rpc.length = 0;
  await a.run("schSave()");
  check("other colour blank: asks for it, no write", a.els["sch-notice"].textContent === "Type the colour." && a.rpc.length === 0);

  a.run(`schEdit("e-sweat"); schForm.price = "abc"; render()`);
  a.rpc.length = 0;
  await a.run("schSave()");
  check("bad price: error, no write", a.els["sch-notice"].textContent.includes("number") && a.rpc.length === 0);

  const up = a.run(`schEdit("e-hoody"); schUpload({ target: { files: [{}], value: "x" } })`);
  await up;
  check("upload: new photo selected", a.run("schForm.photo") === "new" && a.run("schForm.photoUrl") === "/api/product-photo/NEW");

  a.run(`schOpen(0); schGo("pool")`);
  check("pool: hoody already added, shows used-by count", a.panel().includes("Already added") && a.panel().includes("used by 2 schools"));
  check("pool: link to edit the pool", a.panel().includes("setTab('catalog')"));
  a.run(`schOpen(2)`);
  check("empty school: invitation", a.panel().includes("Start this school's uniform"));
  a.run(`schGo("pool")`); a.rpc.length = 0;
  await a.run(`schAddPool("p-hoody")`);
  const add = a.rpc.find(c => c.name === "ps_admin_add_pool_to_school");
  check("add from pool: right school and item", add && add.params.p_school === "Fens Primary School" && add.params.p_catalog_ids[0] === "p-hoody");

  check("30s refresh does nothing on the Schools tab", (await a.run("load()")) === undefined);
  a.run('tab = "live"');
  check("30s refresh still runs on other tabs", (await a.run("load()")) === "loaded");
  check("club picker hides school pool items", a.run("suggestOpts()").every(c => c.tag !== "School uniform") && a.run("suggestOpts()").length === 1);
}

{
  const a = adminCtx({ ps_admin_set_school_item: () => { throw new Error("PS-612"); } });
  await a.run("schLoad()"); a.run("schOpen(0); schEdit('e-hoody'); render()");
  await a.run("schSave()");
  check("save error: friendly message with code", a.els["sch-notice"].textContent.includes("Couldn't save your change") && a.els["sch-notice"].textContent.includes("PS-612"));
  check("save error: stays on the form, can retry", a.run("schView") === "form" && a.els["sch-save"].textContent === "Try again" && a.els["sch-save"].disabled === false);
}

{
  const a = adminCtx({ ps_admin_list_school_items: () => { throw new Error("PS-610"); } });
  await a.run("schLoad()"); a.run("render()");
  check("load error: message and retry button", a.panel().includes("Couldn't load the schools") && a.panel().includes("Try again"));
}

{
  const a = adminCtx();
  const rows = [{ t: "School uniform · Eldon" }, { t: "General shop · Gifts" }].map(x => ({ removed: false, remove() { this.removed = true; }, querySelector: () => ({ textContent: x.t }) }));
  const panel = { html: "", querySelectorAll: () => rows, insertAdjacentHTML(_, h) { this.html = h; } };
  a.run("schHideSchoolRows").call(null, panel);
  check("shop tab: school rows hidden, general kept", rows[0].removed && !rows[1].removed);
  check("shop tab: points to Schools tab", panel.html.includes("1 school uniform item is managed in the Schools tab") && panel.html.includes("setTab('schools')"));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
