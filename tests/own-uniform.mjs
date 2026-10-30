/* Job 22: own-uniform initials service. No network: Supabase and Square are stubbed.
   Run: node tests/own-uniform.mjs */
import { priceBasket, OrderError } from "../functions/_lib/pricing.js";
import { SERVICE_NAME, GARMENTS } from "../functions/_lib/own-uniform.js";
import { onRequestPost as checkout } from "../functions/api/checkout.js";
import { onRequestPost as instalments } from "../functions/api/checkout-instalments.js";

let pass = 0, fail = 0;
const check = (name, ok) => { ok ? pass++ : (fail++, console.log("FAIL", name)); };

const ID = n => "00000000-0000-4000-8000-00000000000" + n;
const DB = {
  initials_pence: 200,
  items: [
    { id: ID(1), name: SERVICE_NAME, price: 4, sizes: null, colours: null, active: true, is_school_item: false, crest: false },
    { id: ID(2), name: "Red Hoody", price: 25, sizes: "S, M, L", colours: null, active: true, is_school_item: true, crest: true },
    { id: ID(3), name: "Mug", price: 9.99, sizes: null, colours: null, active: true, is_school_item: false, crest: false },
    { id: ID(4), name: SERVICE_NAME, price: 4, sizes: null, colours: null, active: false, is_school_item: false, crest: false },
    { id: ID(5), name: SERVICE_NAME, price: null, sizes: null, colours: null, active: true, is_school_item: false, crest: false }
  ]
};
const lookup = async ids => ({ initials_pence: DB.initials_pence, items: DB.items.filter(r => ids.includes(r.id)) });
const code = async p => { try { await p; return null; } catch (e) { return e instanceof OrderError ? e.code : "THREW:" + e.message; } };
const basket = items => priceBasket("PSC", items, lookup);
const ok = { school: "Example School", garment: "Sweatshirt", initials: ["ABC"] };
const line = (qty, details, extra) => [{ product_id: ID(1), qty: qty, own_uniform: details, ...(extra || {}) }];

// normal order
{
  const r = await basket(line(2, { school: "Example School", garment: "sweatshirt", initials: ["abc", " de "] }));
  check("2 garments = £8.00", r.totalPence === 800);
  check("description carries school, garment and each garment's initials",
    r.description === "2 × " + SERVICE_NAME + " (Example School, Sweatshirt, initials ABC / DE) @ £4.00 = £8.00");
  check("single line -> Square name is the line label", r.squareName.startsWith(SERVICE_NAME));
  check("1 garment = £4.00", (await basket(line(1, ok))).totalPence === 400);
  check("max quantity accepted", (await basket(line(20, { ...ok, initials: Array(20).fill("AB") }))).totalPence === 8000);
  for (const g of GARMENTS) check("garment accepted: " + g, (await basket(line(1, { ...ok, garment: g }))).totalPence === 400);
}
// browser price and name ignored
{
  const r = await basket(line(1, ok, { price: 0.01, name: "Free", unit: 1 }));
  check("tampered price ignored (1p -> £4)", r.totalPence === 400);
}
// mixed basket
{
  const r = await basket([{ product_id: ID(2), qty: 1, size: "M", initials: true }, ...line(1, ok)]);
  check("hoody with shop initials (£27) + service (£4) = £31", r.totalPence === 3100);
}
// validation
check("missing details -> 040", await code(basket([{ product_id: ID(1), qty: 1 }])) === "PSC-040");
check("details not an object -> 040", await code(basket(line(1, "ABC"))) === "PSC-040");
check("null details -> 040", await code(basket(line(1, null))) === "PSC-040");
check("missing school -> 041", await code(basket(line(1, { ...ok, school: "" }))) === "PSC-041");
check("1-letter school -> 041", await code(basket(line(1, { ...ok, school: "A" }))) === "PSC-041");
check("81-char school -> 041", await code(basket(line(1, { ...ok, school: "x".repeat(81) }))) === "PSC-041");
check("garment not on the list -> 042", await code(basket(line(1, { ...ok, garment: "Tuxedo" }))) === "PSC-042");
check("no garment -> 042", await code(basket(line(1, { school: "Example School", initials: ["AB"] }))) === "PSC-042");
check("initials missing -> 043", await code(basket(line(1, { school: "S1", garment: "Coat" }))) === "PSC-043");
check("fewer initials than garments -> 043", await code(basket(line(2, ok))) === "PSC-043");
check("more initials than garments -> 043", await code(basket(line(1, { ...ok, initials: ["AB", "CD"] }))) === "PSC-043");
for (const bad of ["ABCD", "A1", "", "   ", "A B", "<b>", 5, null, ["A"]]) check("bad initials " + JSON.stringify(bad) + " -> 043", await code(basket(line(1, { ...ok, initials: [bad] }))) === "PSC-043");
check("initials not an array -> 043", await code(basket(line(1, { ...ok, initials: "ABC" }))) === "PSC-043");
{
  const r = await basket(line(1, { ...ok, school: "<b>St</b> Mary" }));
  check("angle brackets stripped from school", !r.description.includes("<") && !r.description.includes(">"));
}
// service rules
check("shop initials flag refused on the service -> 029", await code(basket(line(1, ok, { initials: true }))) === "PSC-029");
check("paused service refused -> 027", await code(basket([{ product_id: ID(4), qty: 1, own_uniform: ok }])) === "PSC-027");
check("service with no price refused -> 030", await code(basket([{ product_id: ID(5), qty: 1, own_uniform: ok }])) === "PSC-030");
check("details on a normal item refused -> 045", await code(basket([{ product_id: ID(3), qty: 1, own_uniform: ok }])) === "PSC-045");
check("normal items unchanged without details", (await basket([{ product_id: ID(3), qty: 2 }])).totalPence === 1998);
check("quantity rules still apply to the service", await code(basket(line(21, ok))) === "PSC-026");

// ---- handler level: what Square is asked to charge ----
const ENV = { SQUARE_ACCESS_TOKEN: "t", SQUARE_LOCATION_ID: "L", SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_ROLE_KEY: "k" };
function stubFetch() {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    const body = opts.body ? JSON.parse(opts.body) : null;
    calls.push({ url: String(url), body });
    const json = (o, good = true) => ({ ok: good, json: async () => o });
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
const cust = { customer: { name: "Jo Bloggs", phone: "01429866266" } };

for (const [label, handler, urlPart, amount] of [
  ["checkout", checkout, "payment-links", c => c.body.quick_pay.price_money.amount],
  ["instalments", instalments, "/orders", c => c.body.order.line_items[0].base_price_money.amount]
]) {
  let calls = stubFetch();
  let res = await handler(req({ ...cust, items: line(2, { school: "Example School", garment: "Polo shirt", initials: ["AB", "CDE"] }, { price: 0.01 }) }));
  const data = await res.json();
  check(label + ": service order returns a link", res.status === 200 && !!data.checkout_url);
  check(label + ": Square is asked for £8.00, not 2p", amount(calls.find(c => c.url.includes(urlPart))) === 800);
  const pending = calls.find(c => c.url.endsWith("ps_checkout_create_pending")).body;
  check(label + ": order record shows school, garment and initials", pending.p_total === 8 && pending.p_description.includes("Example School, Polo shirt, initials AB / CDE"));

  calls = stubFetch();
  res = await handler(req({ ...cust, items: line(1, { ...ok, initials: ["TOOLONG"] }) }));
  const err = await res.json();
  check(label + ": bad initials refused before Square", res.status === 400 && err.error.endsWith("-043") && !calls.some(c => c.url.includes("square")));

  calls = stubFetch();
  res = await handler(req({ ...cust, items: [{ product_id: ID(1), qty: 1 }] }));
  check(label + ": service with no details refused before Square", res.status === 400 && !calls.some(c => c.url.includes("square")));
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
