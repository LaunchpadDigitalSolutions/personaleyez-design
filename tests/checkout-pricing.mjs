/* Job 15: checkout prices come from the server. No network: fetch is stubbed.
   Run: node tests/checkout-pricing.mjs */
import fs from "node:fs";
import { onRequestPost as checkout } from "../functions/api/checkout.js";
import { onRequestPost as instalments } from "../functions/api/checkout-instalments.js";
import { INITIALS_PENCE, MAX_QTY } from "../lib/price-basket.js";

let pass = 0, fail = 0;
const check = (name, ok) => { ok ? pass++ : (fail++, console.log("FAIL", name)); };

const ID = { hoody: "11111111-1111-4111-8111-111111111111", crest: "22222222-2222-4222-8222-222222222222",
             trousers: "33333333-3333-4333-8333-333333333333", paused: "44444444-4444-4444-8444-444444444444",
             nullprice: "55555555-5555-4555-8555-555555555555", unknown: "99999999-9999-4999-8999-999999999999" };
const ROWS = [
  { id: ID.hoody, name: "Workwear Hoody", price: 25, active: true, is_school_item: false, crest: false, sizes: "S, M, L", colours: "Black, Navy" },
  { id: ID.crest, name: "Red Hoody", price: 18, active: true, is_school_item: true, crest: true, sizes: "4-5, 6-7", colours: null },
  { id: ID.trousers, name: "Grey Trousers", price: 9.99, active: true, is_school_item: true, crest: false, sizes: "4-5", colours: null },
  { id: ID.paused, name: "Old Thing", price: 10, active: false, is_school_item: false, crest: false, sizes: null, colours: null },
  { id: ID.nullprice, name: "No Price", price: null, active: true, is_school_item: true, crest: true, sizes: null, colours: null }
];

let square, pending, rpcCalls;
function stub({ rpcOk = true } = {}) {
  square = []; pending = []; rpcCalls = 0;
  globalThis.fetch = async (url, opts) => {
    const body = opts && opts.body ? JSON.parse(opts.body) : {};
    const j = (o, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => o });
    if (url.endsWith("/rpc/ps_checkout_price_items")) { rpcCalls++; return rpcOk ? j(ROWS.filter(r => body.p_ids.includes(r.id))) : j({}, false); }
    if (url.includes("/rpc/ps_checkout_create_pending")) { pending.push(body); return j({}); }
    if (url.includes("online-checkout/payment-links")) { square.push(body); return j({ payment_link: { url: "https://square.test/pay", order_id: "SQ1" } }); }
    if (url.endsWith("/v2/customers")) return j({ customer: { id: "C1" } });
    if (url.endsWith("/v2/orders")) { square.push(body); return j({ order: { id: "SQ1" } }); }
    if (url.endsWith("/v2/invoices")) { square.push(body); return j({ invoice: { id: "I1", version: 0 } }); }
    if (url.endsWith("/publish")) return j({ invoice: { public_url: "https://square.test/inv" } });
    throw new Error("unexpected fetch " + url);
  };
}
const env = { SQUARE_ACCESS_TOKEN: "t", SQUARE_LOCATION_ID: "L", SUPABASE_URL: "https://db.test", SUPABASE_SERVICE_ROLE_KEY: "k" };
const CUST = { name: "Test Parent", phone: "01429 866266", email: "a@b.co" };
const post = (fn, body, e = env) => fn({ env: e, request: new Request("https://x/api", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }) });
const run = async (fn, body) => { const r = await post(fn, body); return { status: r.status, data: await r.json() }; };
const amount = () => square[0].quick_pay ? square[0].quick_pay.price_money.amount : square[0].order.line_items[0].base_price_money.amount;
const L = (o) => ({ product_id: ID.hoody, qty: 1, size: "M", colour: "Black", ...o });

for (const [label, fn, P] of [["checkout", checkout, "PSC"], ["instalments", instalments, "PSI"]]) {
  const t = (n, ok) => check(`${label}: ${n}`, ok);
  const go = items => run(fn, { items, customer: CUST });

  // normal basket
  stub(); let r = await go([L({ qty: 2 }), { product_id: ID.trousers, qty: 1, size: "4-5" }]);
  t("normal basket is 200", r.status === 200 && r.data.checkout_url && r.data.order_ref);
  t("total is server maths (2 x 25.00 + 9.99 = 5999p)", amount() === 5999 && pending[0].p_total === 59.99);
  t("order record is itemised with server prices", pending[0].p_description.includes("2 x Workwear Hoody (M, Black) @ £25.00 = £50.00") && pending[0].p_description.includes("Grey Trousers (4-5) @ £9.99 = £9.99"));

  // THE ATTACK: browser says 1p
  stub(); r = await go([L({ price: 0.01, name: "Free hoodie", unit: 0.01 })]);
  t("tampered 1p price: charged the real price", r.status === 200 && amount() === 2500);
  t("tampered name never reaches the order record", !pending[0].p_description.includes("Free hoodie"));
  stub(); r = await go([{ name: "Hoody", price: 0.01, qty: 1 }]);
  t("old payload shape (no product_id) refused, refresh message, no Square call", r.status === 400 && r.data.error === `${P}-010` && r.data.refresh === true && square.length === 0 && pending.length === 0);

  // quantities
  for (const q of [0, -1, 1.5, MAX_QTY + 1, 999, "2", null, NaN]) { stub(); r = await go([L({ qty: q })]); t(`qty ${JSON.stringify(q)} rejected`, r.status === 400 && r.data.error === `${P}-012` && square.length === 0); }
  stub(); r = await go([L({ qty: MAX_QTY })]); t("qty at cap accepted", r.status === 200 && amount() === 2500 * MAX_QTY);

  // products
  stub(); r = await go([L({ product_id: ID.unknown })]); t("unknown product rejected", r.data.error === `${P}-011` && r.data.refresh === true);
  stub(); r = await go([L({ product_id: ID.paused })]); t("paused product rejected", r.data.error === `${P}-011`);
  stub(); r = await go([L({ product_id: ID.nullprice })]); t("product with no price rejected", r.data.error === `${P}-011`);
  stub(); r = await go([L({ product_id: "not-a-uuid" })]); t("malformed product_id rejected", r.data.error === `${P}-010`);
  stub(); r = await go([L({ product_id: "1' or 1=1--" })]); t("injection-shaped product_id rejected", r.data.error === `${P}-010` && rpcCalls === 0);
  stub(); r = await go([L({ size: "XXL" })]); t("size not on the product rejected", r.data.error === `${P}-013`);
  stub(); r = await go([L({ colour: undefined })]); t("missing required colour rejected", r.data.error === `${P}-013`);

  // add-ons
  stub(); r = await go([{ product_id: ID.crest, qty: 2, size: "4-5", initials: true }]);
  t("initials priced server-side (2 x (1800 + 200))", r.status === 200 && amount() === 4000 && INITIALS_PENCE === 200);
  t("crested item notes logo + initials", pending[0].p_description.includes("logo embroidered, initials +£2.00"));
  stub(); r = await go([{ product_id: ID.crest, qty: 1, size: "4-5", initials: true, initials_price: 0, addon: 0 }]);
  t("add-on price tampering ignored", r.status === 200 && amount() === 2000);
  stub(); r = await go([{ product_id: ID.crest, qty: 1, size: "4-5", initials: "yes" }]);
  t("non-boolean initials flag does not add the add-on", r.status === 200 && amount() === 1800);
  stub(); r = await go([{ product_id: ID.trousers, qty: 1, size: "4-5", initials: true }]);
  t("initials on an uncrested item rejected", r.data.error === `${P}-014`);
  stub(); r = await go([L({ initials: true })]);
  t("initials on a non-school item rejected", r.data.error === `${P}-014`);

  // basket shape
  for (const [n, items] of [["empty", []], ["missing", undefined], ["not an array", "x"]]) { stub(); r = await run(fn, { items, customer: CUST }); t(`${n} basket rejected`, r.status === 400 && r.data.error === `${P}-002`); }
  stub(); r = await go(Array.from({ length: 31 }, () => L({}))); t("31 lines rejected", r.data.error === `${P}-016`);
  stub(); r = await go([null]); t("null item rejected", r.data.error === `${P}-010`);

  // customer + strings
  const bad = async (c, note) => { stub(); return run(fn, { items: [L({})], customer: c, note }); };
  r = await bad({ ...CUST, name: "x".repeat(101) }); t("101-char name rejected", r.data.error === `${P}-015`);
  r = await bad({ ...CUST, phone: "abc" }); t("bad phone rejected", r.data.error === `${P}-015`);
  r = await bad({ ...CUST, phone: "1".repeat(21) }); t("21-char phone rejected", r.data.error === `${P}-015`);
  r = await bad({ ...CUST, email: "nope" }); t("bad email rejected", r.data.error === `${P}-015`);
  r = await bad({ ...CUST, email: "a@b.co" + "x".repeat(260) }); t("oversized email rejected", r.data.error === `${P}-015`);
  r = await bad({ name: "", phone: "" }); t("missing name/phone rejected", r.data.error === `${P}-003`);
  r = await bad(CUST, "n".repeat(501)); t("501-char note rejected", r.data.error === `${P}-016`);
  r = await bad({ ...CUST, name: "<b>Ann</b>\n\u0000" }); t("tags and control chars stripped from name", r.status === 200 && pending[0].p_customer_name === "b Ann /b");
  r = await bad(CUST, "<script>alert(1)</script>"); t("angle brackets stripped from note", r.status === 200 && !pending[0].p_description.includes("<"));
  stub(); r = await run(fn, "not json"); t("invalid JSON rejected", r.data.error === `${P}-001`);
  stub(); r = await run(fn, JSON.stringify({ items: [L({})], customer: CUST, junk: "x".repeat(21000) })); t("oversized body rejected", r.status === 413);

  // failures
  stub({ rpcOk: false }); r = await go([L({})]); t("price lookup down: 503, no Square call, no order", r.status === 503 && r.data.error === `${P}-017` && square.length === 0 && pending.length === 0);
  stub(); const r2 = await post(fn, { items: [L({})], customer: CUST }, { ...env, SQUARE_ACCESS_TOKEN: "" }); t("Square not configured: 503", r2.status === 503);
}

// one source of truth for the initials amount: client label must equal the server constant
const m = fs.readFileSync("js/schools-shop.js", "utf8").match(/const INITIALS_PRICE = ([\d.]+);/);
check("client INITIALS_PRICE matches server INITIALS_PENCE", m && Math.round(Number(m[1]) * 100) === INITIALS_PENCE);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
