/* Job 15: every checkout caller sends product ids and options, never prices.
   No network, no browser. Run: node tests/checkout-clients.mjs */
import fs from "node:fs";
import vm from "node:vm";
import { Basket, orderPayload } from "../js/category-page.js";

let pass = 0, fail = 0;
const check = (name, ok) => { ok ? pass++ : (fail++, console.log("FAIL", name)); };

// category pages
const b = new Basket().add({ id: "id-1", name: "Apron", price: 12 }, { size: "M", colour: "Navy", qty: 2 });
const payload = orderPayload(b, { name: "Jo", phone: "01429866266" }, "");
check("category basket sends product_id/qty/size/colour", JSON.stringify(payload.items) === JSON.stringify([{ product_id: "id-1", qty: 2, size: "M", colour: "Navy" }]));
check("category payload has no price", !JSON.stringify(payload).includes("price"));

// shop.js, schools-checkout.js: payload code must not mention a price
for (const f of ["js/shop.js", "js/schools-checkout.js"]) {
  const src = fs.readFileSync(f, "utf8");
  const at = src.search(/\bitems: (picks|basket)\./);
  const body = src.slice(at, at + 260);
  check(`${f}: items payload sends product_id`, body.includes("product_id"));
  check(`${f}: items payload sends no price`, !/price|unit/.test(body.split("\n")[0]));
}

// school basket lines carry what the server needs
{
  const els = {};
  const el = id => els[id] || (els[id] = { id, innerHTML: "", textContent: "", className: "", value: "", checked: false, style: {} });
  const ctx = vm.createContext({ document: { getElementById: el, addEventListener(){}, querySelector(){ return null; } }, sessionStorage: { getItem(){ return null; }, setItem(){} }, toast(){}, console });
  vm.runInContext(fs.readFileSync("js/schools-shop.js", "utf8"), ctx);
  const run = c => vm.runInContext(c, ctx);
  run(`activeItem = { id: "p-1", name: "Red Hoody", price: 25, category: "Fens Primary School", crest: true }; activeSchool = "Fens Primary School"; ALL_PRODUCTS = [activeItem]`);
  els["su-size"] = { value: "M" }; els["su-colour"] = { value: "Red" }; els["su-qty"] = { value: "2" }; els["su-initials"] = { checked: true };
  els["su-sticky"] = els["su-sticky"] || el("su-sticky");
  try { run("addToBasket()"); } catch (e) { console.log("addToBasket threw", e.message); }
  const line = run("basket[0]");
  check("school basket line has id/size/colour/initials", line && line.id === "p-1" && line.size === "M" && line.colour === "Red" && line.initials === true && line.qty === 2);
  check("school display price includes initials add-on (27)", line && line.unit === 27);
}
// stale basket without ids is emptied, not sent
{
  const src = fs.readFileSync("js/schools-checkout.js", "utf8");
  check("stale basket (no id) is emptied with a message", src.includes("basket.some(b => !b || !b.id)") && src.includes("STALE_MSG"));
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
