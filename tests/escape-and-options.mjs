/* Job 18: nothing from product/school data may break or inject into the page,
   and checkout never shows empty brackets. No network, vm + tiny fake DOM.
   Run: node tests/escape-and-options.mjs */
import vm from "node:vm";
import fs from "node:fs";

let pass = 0, fail = 0;
const check = (name, ok) => { ok ? pass++ : (fail++, console.log("FAIL", name)); };

const NASTY = `Tom & Jerry "Hoodie" <b>`;
const NASTY_ID = `x'"><img src=x onerror=alert(1)>`;
const NASTY_SCHOOL = `St Mary's "Academy" <i>`;

function makeCtx(files, extra = {}){
  const els = {};
  const el = id => els[id] || (els[id] = {
    id, innerHTML: "", textContent: "", className: "", value: id === "su-qty" ? "1" : "", checked: false, style: {},
    _h: {}, addEventListener(t, fn){ (this._h[t] = this._h[t] || []).push(fn); },
    contains(){ return false; }
  });
  const ctx = vm.createContext({
    document: { getElementById: el, addEventListener(){}, activeElement: null, querySelector: () => null },
    sessionStorage: { _d: {}, getItem(k){ return this._d[k] ?? null; }, setItem(k, v){ this._d[k] = String(v); }, removeItem(k){ delete this._d[k]; } },
    toast(){}, healthCheck: async () => true, location: {}, console, ...extra
  });
  for(const f of files) vm.runInContext(fs.readFileSync(f, "utf8"), ctx, { filename: f });
  // click on a rendered element: finds the data-* attribute in its HTML and calls the delegated handler
  const click = (box, attr) => {
    const m = els[box].innerHTML.match(new RegExp(`${attr}="([^"]*)"`));
    const val = m && m[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
    const key = attr.replace("data-", "");
    const t = { dataset: { [key]: val }, closest(sel){ return sel === `[${attr}]` ? t : null; } };
    for(const h of els[box]._h.click || []) h({ target: t });
    return val;
  };
  return { ctx, els, run: code => vm.runInContext(code, ctx), click };
}

const SHOP = ["js/escape.js", "js/schools-registry.js", "js/schools-shop.js"];
const mk = (id, name, category, o = {}) => ({ id, name, category, price: 10, is_school_item: true, sizes: "4-5,6-7", colours: "Grey", description: "", ...o });
const literal = (html, s) => html.includes(s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"));
const noRaw = html => !html.includes(NASTY) && !html.includes(NASTY_SCHOOL) && !/<img src=x|<i>/.test(html);

/* ---- helper itself ---- */
{
  const { run } = makeCtx(["js/escape.js"]);
  check("escHtml escapes & < > \" '", run(`escHtml(${JSON.stringify(`&<>"'`)})`) === "&amp;&lt;&gt;&quot;&#39;");
  check("escHtml(null) is empty", run("escHtml(null)") === "" && run("escHtml(undefined)") === "");
  check("lineName: no options -> name alone", run(`lineName("Skort", [])`) === "Skort");
  check("lineName: options -> brackets", run(`lineName("Skort", ["4-5","Grey"])`) === "Skort (4-5, Grey)");
}

/* ---- school shop: list, picker, preview, tabs ---- */
{
  const P = [mk(NASTY_ID, NASTY, NASTY_SCHOOL, { image_url: `a.jpg" onerror="alert(1)`, sizes: `4"5,<6>`, description: "d" })];
  const { ctx, els, run, click } = makeCtx(SHOP);
  run(`ALL_PRODUCTS = ${JSON.stringify(P)}; SCHOOLS = [${JSON.stringify(NASTY_SCHOOL)}]; SCHOOL_REGISTRY = [{name:${JSON.stringify(NASTY_SCHOOL)},phase:"primary",crest_url:"c.png\\" onerror=\\"alert(1)"}]; activePhase = "primary"; basket = [];`);
  run(`bindSchoolShopEvents()`);
  run(`renderTabs()`);
  check("tabs: school name literal, no raw tags", literal(els["su-tabs"].innerHTML, NASTY_SCHOOL) && noRaw(els["su-tabs"].innerHTML));
  check("tabs: no inline onclick", !/onclick=/.test(els["su-tabs"].innerHTML));
  check("tabs: crest attr cannot break out", !/onerror="alert/.test(els["su-tabs"].innerHTML));
  const school = click("su-tabs", "data-school");
  check("tabs: click selects the nasty school", school === NASTY_SCHOOL && run("activeSchool") === NASTY_SCHOOL);
  const list = els["su-list"].innerHTML;
  check("list: name literal, no raw tags", literal(list, NASTY) && noRaw(list));
  check("list: no inline onclick", !/onclick=/.test(list));
  check("list: sizes escaped", !list.includes("<6>"));
  const id = click("su-list", "data-item");
  check("list: nasty id round-trips and row is clickable", id === NASTY_ID && run("activeItem && activeItem.id") === NASTY_ID);
  const pick = els["su-picker"].innerHTML;
  check("picker: name literal, no raw tags", literal(pick, NASTY) && noRaw(pick));
  check("picker: size options escaped", !pick.includes("<option>4\"5") && !pick.includes("<6>"));
  const prev = els["su-preview"].innerHTML;
  check("preview: alt/src cannot break out", !/onerror="alert/.test(prev) && literal(prev, NASTY) && noRaw(prev));
  run("addToBasket()");
  check("basket keeps the literal name", JSON.parse(run("JSON.stringify(basket)"))[0].name === NASTY);
}

/* ---- school shop: no image -> name shown literally in preview ---- */
{
  const { els, run } = makeCtx(SHOP);
  run(`ALL_PRODUCTS = ${JSON.stringify([mk("p1", NASTY, "Alpha")])}; activeSchool = "Alpha"; activeItem = null; renderPreview();`);
  check("preview (no image): name literal", literal(els["su-preview"].innerHTML, NASTY) && noRaw(els["su-preview"].innerHTML));
}

/* ---- checkout: escape, no empty brackets, remove button, payload names ---- */
{
  const basket = [
    { name: NASTY, qty: 1, unit: 10, opts: ["4-5", "Grey"] },
    { name: "Pinafore", qty: 2, unit: 5, opts: [] }
  ];
  let sent = [];
  const fetch = async (u, o) => { sent.push(JSON.parse(o.body)); return { ok: true, json: async () => ({ checkout_url: "https://sq/x" }) }; };
  const { ctx, els, run, click } = makeCtx(["js/escape.js", "js/schools-checkout.js"], { fetch, BRAND: { phone: "1" } });
  const $e = id => ctx.document.getElementById(id);
  run(`basket = ${JSON.stringify(basket)}; renderOrder(); bindCheckoutEvents();`);
  const html = els["suc-basket"].innerHTML;
  check("checkout: name literal, no raw tags", literal(html, NASTY) && noRaw(html));
  check("checkout: no empty brackets on screen", !/\(\)/.test(html));
  check("checkout: no dangling separator for no-option line", !/Pinafore\s*·\s*<\/b>/.test(html));
  check("checkout: no inline onclick", !/onclick=/.test(html));
  $e("suc-cname").value = "A"; $e("suc-cphone").value = "0123456789"; $e("suc-consent").checked = true;
  await run("startUniformCheckout()");
  const names = sent[0].items.map(i => i.name);
  check("payload: no '()' anywhere", names.every(n => !/\(\)/.test(n)));
  check("payload: no-option line is the bare name", names[1] === "Pinafore");
  check("payload: option line keeps brackets", names[0] === `${NASTY} (4-5, Grey)`);
  sent = [];
  $e("suc-spread").disabled = false;
  await run("startInstalmentCheckout()");
  check("instalment payload: bare name for no-option line", sent[0].items[1].name === "Pinafore");
  click("suc-basket", "data-remove");
  check("checkout: Remove button works via delegation", run("basket.length") === 1);
}

/* ---- main shop + club shop ---- */
for(const [file, boxId, setup] of [
  ["js/shop.js", "p-products", `PRODUCTS = ${JSON.stringify([{ id: "1", name: NASTY, category: `Tops "<b>`, price: 5, sizes: `S",<M>`, colours: "Red", description: NASTY, image_url: `i.jpg" x="` }, { id: "2", name: "Plain", category: "Other", price: 1 }])}; renderProducts();`],
  ["js/clubs.js", "s-products", `PRODUCTS = ${JSON.stringify([{ id: "1", name: NASTY, price: 5, sizes: `S",<M>`, colours: "Red", description: NASTY, image_url: `i.jpg" x="`, range_name: NASTY }])}; renderProducts();`]
]){
  const { els, run } = makeCtx(["js/escape.js", file]);
  run(setup);
  const html = els[boxId].innerHTML;
  check(`${file}: name literal, no raw tags`, literal(html, NASTY) && noRaw(html));
  check(`${file}: image/option attrs cannot break out`, !html.includes(`x="`) && !html.includes("<M>"));
}
{
  const { ctx, els, run } = makeCtx(["js/escape.js", "js/shop.js"]);
  run(`PRODUCTS=[{id:"1",name:${JSON.stringify(NASTY)},price:5}]; renderProducts();`);
  ctx.document.getElementById("qt-0").value = "1";
  run("renderBasket()");
  check("shop basket line: literal, no raw tags", literal(els["p-basket"].innerHTML, NASTY) && noRaw(els["p-basket"].innerHTML));
}

/* ---- admin (Jo's dashboard): shop list and club buttons ---- */
{
  const esc = v => v == null ? "" : String(v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const { els, run } = makeCtx(["js/admin-shop.js"], { esc, money: n => "£" + n, shopTab: "x" });
  const src = fs.readFileSync("js/admin-shop.js", "utf8");
  check("admin-shop: name, description, sizes escaped in source",
    src.includes("${esc(pr.name)}") && src.includes("${esc(pr.description)}") && src.includes("esc(pr.sizes)") && src.includes("esc(pr.colours)") && src.includes("esc(pr.category)"));
  const sq = fs.readFileSync("js/admin-square.js", "utf8");
  check("admin-square: item name and photo escaped in source", sq.includes("${esc(item.name)}") && sq.includes("${esc(item.photo_url)}"));
  const ad = fs.readFileSync("js/admin.js", "utf8");
  check("admin: club link no longer puts slug/code inside JS string", !ad.includes("copyClubLink('${") && ad.includes('data-slug="${esc(g.slug)}"'));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
