/* Job 15: checkout prices come from the server. No network: Supabase and Square are stubbed.
   Run: node tests/checkout-pricing.mjs */
import { priceBasket, validateCustomer, OrderError, LIMITS, clean } from "../functions/_lib/pricing.js";
import { onRequestPost as checkout } from "../functions/api/checkout.js";
import { onRequestPost as instalments } from "../functions/api/checkout-instalments.js";

let pass = 0, fail = 0;
const check = (name, ok) => { ok ? pass++ : (fail++, console.log("FAIL", name)); };

const ID = n => `00000000-0000-4000-8000-00000000000${n}`;
const DB = {
  initials_pence: 200,
  items: [
    { id: ID(1), name: "Red Hoody", price: 25, sizes: "S, M, L", colours: null, active: true, is_school_item: true, crest: true },
    { id: ID(2), name: "Grey Trousers", price: 8.5, sizes: "4-5, 6-7", colours: "Grey", active: true, is_school_item: true, crest: false },
    { id: ID(3), name: "Mug", price: 9.99, sizes: null, colours: "White, Black", active: true, is_school_item: false, crest: false },
    { id: ID(4), name: "Paused Polo", price: 11, sizes: "M", colours: null, active: false, is_school_item: true, crest: true },
    { id: ID(5), name: "No Price", price: null, sizes: null, colours: null, active: true, is_school_item: false, crest: false }
  ]
};
const lookup = async ids => ({ initials_pence: DB.initials_pence, items: DB.items.filter(r => ids.includes(r.id)) });
const code = async p => { try { await p; return null; } catch (e) { return e instanceof OrderError ? e.code : "THREW:" + e.message; } };
const basket = items => priceBasket("PSC", items, lookup);

// normal basket
{
  const r = await basket([{ product_id: ID(1), qty: 2, size: "M" }, { product_id: ID(3), qty: 1, colour: "black" }]);
  check("normal basket total = 2x25 + 9.99", r.totalPence === 5999);
  check("order description is itemised with server prices", r.description.includes("2 × Red Hoody (M, logo embroidered) @ £25.00 = £50.00") && r.description.includes("Mug (Black) @ £9.99 = £9.99"));
  check("two items -> summary name", r.squareName === "Peach State order (2 items)");
}
// browser price/name are ignored
{
  const r = await basket([{ product_id: ID(1), qty: 1, size: "M", price: 0.01, name: "<b>Free</b>", unit: 1 }]);
  check("tampered price ignored (1p -> £25)", r.totalPence === 2500);
  check("tampered name ignored", r.lines[0].label.startsWith("Red Hoody"));
}
// quantity
for (const q of [0, -1, 1.5, 999, 21, "2", null, NaN]) check(`qty ${JSON.stringify(q)} rejected`, await code(basket([{ product_id: ID(1), qty: q, size: "M" }])) === "PSC-026");
check("qty at cap accepted", (await basket([{ product_id: ID(1), qty: LIMITS.maxQty, size: "M" }])).totalPence === 25 * 100 * 20);
// product problems
check("missing product_id -> refresh error", await code(basket([{ qty: 1, size: "M", price: 0.01, name: "Hoodie" }])) === "PSC-020");
check("bad product_id -> refresh error", await code(basket([{ product_id: "1; drop table", qty: 1 }])) === "PSC-020");
check("unknown product rejected", await code(basket([{ product_id: ID(9), qty: 1 }])) === "PSC-027");
check("paused product rejected", await code(basket([{ product_id: ID(4), qty: 1, size: "M" }])) === "PSC-027");
check("product with no price rejected", await code(basket([{ product_id: ID(5), qty: 1 }])) === "PSC-030");
check("empty basket", await code(basket([])) === "PSC-002");
check("non-array basket", await code(basket({ a: 1 })) === "PSC-002");
check("too many lines", await code(basket(Array(31).fill({ product_id: ID(1), qty: 1, size: "M" }))) === "PSC-025");
// options
check("missing size rejected", await code(basket([{ product_id: ID(1), qty: 1 }])) === "PSC-028");
check("invalid size rejected", await code(basket([{ product_id: ID(1), qty: 1, size: "XXXL" }])) === "PSC-028");
check("size on sizeless item rejected", await code(basket([{ product_id: ID(3), qty: 1, size: "M", colour: "White" }])) === "PSC-028");
check("invalid colour rejected", await code(basket([{ product_id: ID(3), qty: 1, colour: "Pink" }])) === "PSC-028");
// initials add-on
{
  const r = await basket([{ product_id: ID(1), qty: 2, size: "L", initials: true }]);
  check("initials = +£2 per item from server (2 x 27)", r.totalPence === 5400 && r.lines[0].label.includes("initials stitched on"));
  check("initials amount sent by browser ignored", (await basket([{ product_id: ID(1), qty: 1, size: "L", initials: true, initials_price: 0, initialsPrice: 0.01, addon: 0 }])).totalPence === 2700);
  check("initials must be literally true", (await basket([{ product_id: ID(1), qty: 1, size: "L", initials: "true" }])).totalPence === 2500);
  check("initials refused on uncrested item", await code(basket([{ product_id: ID(2), qty: 1, size: "4-5", colour: "Grey", initials: true }])) === "PSC-029");
  check("initials refused on non-school item", await code(basket([{ product_id: ID(3), qty: 1, colour: "White", initials: true }])) === "PSC-029");
  DB.initials_pence = null;
  check("missing add-on price config refuses initials", await code(basket([{ product_id: ID(1), qty: 1, size: "L", initials: true }])) === "PSC-031");
  check("missing add-on config does not affect plain items", (await basket([{ product_id: ID(1), qty: 1, size: "L" }])).totalPence === 2500);
  DB.initials_pence = 200;
}
// money rounding
check("pence rounding: 8.50 x 3 = 2550", (await basket([{ product_id: ID(2), qty: 3, size: "6-7", colour: "grey" }])).totalPence === 2550);
// customer validation
const cust = (c, n) => { try { return validateCustomer("PSC", c, n); } catch (e) { return e.code; } };
check("good customer", cust({ name: "Jo Bloggs", phone: "01429 866266", email: "jo@example.com" }, "hello").name === "Jo Bloggs");
check("missing name -> 003", cust({ phone: "01429866266" }) === "PSC-003");
check("short phone -> 022", cust({ name: "Jo", phone: "12345" }) === "PSC-022");
check("letters in phone -> 022", cust({ name: "Jo", phone: "call me maybe now" }) === "PSC-022");
check("bad email -> 023", cust({ name: "Jo", phone: "01429866266", email: "nope" }) === "PSC-023");
check("oversized name -> 021", cust({ name: "x".repeat(81), phone: "01429866266" }) === "PSC-021");
check("oversized note -> 024", cust({ name: "Jo", phone: "01429866266" }, "n".repeat(501)) === "PSC-024");
check("angle brackets stripped", cust({ name: "Jo <script>", phone: "01429866266" }, "<b>x</b>").name === "Jo script" && clean("<b>x</b>") === "bx/b");
check("customer not an object", cust("x") === "PSC-003");

// ---- handler level: what Square is actually asked to charge ----
const ENV = { SQUARE_ACCESS_TOKEN: "t", SQUARE_LOCATION_ID: "L", SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_ROLE_KEY: "k" };
function stubFetch() {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    const body = opts.body ? JSON.parse(opts.body) : null;
    calls.push({ url: String(url), body });
    const json = (o, ok = true) => ({ ok, json: async () => o });
    if (String(url).endsWith("ps_checkout_lookup")) return json({ initials_pence: 200, items: DB.items.filter(r => body.p_ids.includes(r.id)) });
    if (String(url).includes("payment-links")) return json({ payment_link: { url: "https://square.test/pay", order_id: "SQ1" } });
    if (String(url).endsWith("/customers")) return json({ customer: { id: "C1" } });
    if (String(url).endsWith("/orders")) return json({ order: { id: "SQ1" } });
    if (String(url).endsWith("/publish")) return json({ invoice: { public_url: "https://square.test/inv" } });
    if (String(url).endsWith("/invoices")) return json({ invoice: { id: "I1", version: 0 } });
    if (String(url).endsWith("ps_checkout_create_pending")) return json({});
    throw new Error("unexpected fetch " + url);
  };
  return calls;
}
const req = b => ({ request: { json: async () => b }, env: ENV });
const good = { customer: { name: "Jo Bloggs", phone: "01429866266" } };

for (const [label, handler, urlPart, amount] of [
  ["checkout", checkout, "payment-links", c => c.body.quick_pay.price_money.amount],
  ["instalments", instalments, "/orders", c => c.body.order.line_items[0].base_price_money.amount]
]) {
  // THE attack: the old payload (1p hoodie, no product_id)
  let calls = stubFetch();
  let res = await handler(req({ ...good, items: [{ name: "Red Hoody (M)", price: 0.01, qty: 1 }] }));
  check(`${label}: old 1p payload refused`, res.status === 400 && (await res.json()).error.endsWith("-020"));
  check(`${label}: old payload never reached Square`, !calls.some(c => c.url.includes("square")));

  // attack with a real product_id and a 1p price
  calls = stubFetch();
  res = await handler(req({ ...good, items: [{ product_id: ID(1), name: "Hoodie", price: 0.01, qty: 1, size: "M" }] }));
  const data = await res.json();
  check(`${label}: tampered price still returns a link`, res.status === 200 && !!data.checkout_url);
  check(`${label}: Square is asked for £25.00, not 1p`, amount(calls.find(c => c.url.includes(urlPart))) === 2500);
  const pending = calls.find(c => c.url.endsWith("ps_checkout_create_pending")).body;
  check(`${label}: order record has server price + itemised line`, pending.p_total === 25 && pending.p_description.includes("@ £25.00 = £25.00"));

  calls = stubFetch();
  res = await handler(req({ ...good, items: [{ product_id: ID(1), qty: 3, size: "M", initials: true, price: 1 }] }));
  await res.json();
  check(`${label}: add-on priced server-side (3 x £27)`, amount(calls.find(c => c.url.includes(urlPart))) === 8100);

  calls = stubFetch();
  res = await handler(req({ ...good, items: [{ product_id: ID(1), qty: 999, size: "M" }] }));
  check(`${label}: qty 999 refused before Square`, res.status === 400 && !calls.some(c => c.url.includes("square")));
  res = await handler({ request: { json: async () => { throw new Error("x"); } }, env: ENV });
  check(`${label}: bad JSON -> 001`, (await res.json()).error.endsWith("-001"));
  res = await handler({ request: { json: async () => null }, env: ENV });
  check(`${label}: null body -> 001`, res.status === 400);
  // lookup failure must fail closed
  globalThis.fetch = async () => ({ ok: false, json: async () => ({}) });
  res = await handler(req({ ...good, items: [{ product_id: ID(1), qty: 1, size: "M" }] }));
  check(`${label}: price lookup down -> 502, no charge`, res.status === 502 && (await res.json()).error.endsWith("-032"));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
