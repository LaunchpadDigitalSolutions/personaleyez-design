/* Tests for /api/club-checkout. Run: node tests/club-checkout.mjs
   fetch is stubbed: no network, no Supabase, no Square, no email. */
import assert from "node:assert/strict";
import { onRequestPost } from "../functions/api/club-checkout.js";

const G = "1c941438-b478-4bf2-9dd5-87a3c6783ad2";
const JACKET = "11111111-1111-4111-8111-111111111111";   // £28, sizes, Black
const TEE    = "22222222-2222-4222-8222-222222222222";   // £9
const TBC    = "33333333-3333-4333-8333-333333333333";   // no price
const OFF    = "44444444-4444-4444-8444-444444444444";   // not available
const OTHER  = "55555555-5555-4555-8555-555555555555";   // belongs to another club

const ROWS = [
  { id: JACKET, name: "Full Zip Dance Jacket", price: 28, sizes: "5-7, 7-9", colours: "Black", active: true, is_school_item: false, crest: false },
  { id: TEE, name: "Crested Tee", price: 9, sizes: "", colours: "", active: true, is_school_item: false, crest: false },
  { id: TBC, name: "Custom Show Jacket", price: null, sizes: "", colours: "", active: true, is_school_item: false, crest: false },
  { id: OFF, name: "Old Hoodie", price: 20, sizes: "", colours: "", active: false, is_school_item: false, crest: false }
];

const env = { SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_ROLE_KEY: "svc", SQUARE_ACCESS_TOKEN: "sq", SQUARE_LOCATION_ID: "loc", RESEND_API_KEY: "re", OWNER_NOTIFY_EMAIL: "jo@test" };
let calls, mode;
const realFetch = globalThis.fetch;

globalThis.fetch = async (url, opts = {}) => {
  const body = opts.body ? JSON.parse(opts.body) : null;
  calls.push({ url: String(url), body });
  const json = (o, status = 200) => ({ ok: status < 400, status, json: async () => o, text: async () => JSON.stringify(o) });
  if (String(url).includes("ps_club_checkout_lookup")) {
    if (mode.lookupDown) return json({}, 500);
    if (body.p_slug !== "lumsdale" || body.p_code !== "RIGHT") return json({ ok: false });
    const items = ROWS.filter(r => body.p_ids.includes(r.id));
    return json({ ok: true, group: { id: G, slug: "lumsdale", name: "Lumsdale Theatre Arts" }, initials_pence: null, items });
  }
  if (String(url).includes("ps_club_create_order")) {
    if (mode.saveFails) return json({}, 500);
    return json({ order_ref: body.p_order_ref, description: body.p_description, ...body });
  }
  if (String(url).includes("squareup.com")) {
    if (mode.squareFails) return json({ errors: [{ detail: "nope" }] }, 400);
    return json({ payment_link: { url: "https://square.test/pay", order_id: "SQ1" } });
  }
  if (String(url).includes("resend.com")) return json({ id: "e1" });
  throw new Error("unexpected fetch " + url);
};

const post = async payload => {
  const res = await onRequestPost({ env, request: { json: async () => payload } });
  return { status: res.status, data: await res.json() };
};
const cust = { name: "Jo Tapping", phone: "07700 900123", email: "p@test.com" };
const grp = { slug: "lumsdale", code: "RIGHT" };
const run = async (name, fn) => { calls = []; mode = {}; await fn(); console.log("ok  " + name); };
const sq = () => calls.find(c => c.url.includes("squareup"));
const saved = () => calls.find(c => c.url.includes("ps_club_create_order"))?.body;
const mails = () => calls.filter(c => c.url.includes("resend"));

await run("priced basket: price comes from the database, not the browser", async () => {
  const r = await post({ group: grp, customer: cust,
    items: [{ product_id: JACKET, qty: 2, size: "5-7", colour: "Black", price: 0.01, name: "FREE" }, { product_id: TEE, qty: 1 }] });
  assert.equal(r.status, 200);
  assert.equal(r.data.checkout_url, "https://square.test/pay");
  assert.equal(sq().body.quick_pay.price_money.amount, 6500);        // 2x28 + 9
  const s = saved();
  assert.equal(s.p_status, "pending_payment");
  assert.equal(s.p_total, 65);
  assert.equal(s.p_quantity, 3);
  assert.equal(s.p_group_id, G);
  assert.equal(s.p_square_order_id, "SQ1");
  assert.ok(s.p_description.startsWith("Lumsdale Theatre Arts: "));
  assert.ok(!s.p_description.includes("FREE"));
  assert.equal(mails().length, 0);                                    // webhook emails after payment
});

await run("wrong access code is refused before Square or the database", async () => {
  const r = await post({ group: { slug: "lumsdale", code: "WRONG" }, customer: cust, items: [{ product_id: JACKET, qty: 1, size: "5-7", colour: "Black" }] });
  assert.equal(r.status, 403); assert.equal(r.data.error, "PCC-010");
  assert.ok(!sq()); assert.ok(!saved());
});

await run("missing club details refused", async () => {
  const r = await post({ customer: cust, items: [{ product_id: TEE, qty: 1 }] });
  assert.equal(r.data.error, "PCC-010"); assert.ok(!sq());
});

await run("unpriced item becomes an enquiry: saved, Jo and customer emailed, nothing charged", async () => {
  const r = await post({ group: grp, customer: cust, note: "Initials EM", items: [{ product_id: TBC, qty: 1 }, { product_id: TEE, qty: 2 }] });
  assert.equal(r.status, 200); assert.equal(r.data.enquiry, true);
  assert.ok(!sq());
  const s = saved();
  assert.equal(s.p_status, "enquiry"); assert.equal(s.p_total, null); assert.equal(s.p_quantity, 3);
  assert.ok(s.p_description.includes("price to confirm")); assert.ok(s.p_description.includes("@ £9.00"));
  const m = mails();
  assert.equal(m.length, 2);
  assert.equal(m[0].body.to, "jo@test"); assert.ok(m[0].body.subject.includes("Lumsdale"));
  assert.equal(m[1].body.to, "p@test.com");
});

await run("enquiry without customer email emails Jo only", async () => {
  const r = await post({ group: grp, customer: { name: "Jo T", phone: "07700 900123" }, items: [{ product_id: TBC, qty: 1 }] });
  assert.equal(r.data.enquiry, true); assert.equal(mails().length, 1);
});

await run("item not available any more", async () => {
  const r = await post({ group: grp, customer: cust, items: [{ product_id: OFF, qty: 1 }] });
  assert.equal(r.data.error, "PCC-027"); assert.ok(!sq());
});

await run("item from another club is treated as unavailable", async () => {
  const r = await post({ group: grp, customer: cust, items: [{ product_id: OTHER, qty: 1 }] });
  assert.equal(r.data.error, "PCC-027"); assert.ok(!sq()); assert.ok(!saved());
});

await run("bad quantity, bad id, empty basket, missing size", async () => {
  assert.equal((await post({ group: grp, customer: cust, items: [{ product_id: TEE, qty: 999 }] })).data.error, "PCC-026");
  assert.equal((await post({ group: grp, customer: cust, items: [{ product_id: TEE, qty: 1.5 }] })).data.error, "PCC-026");
  assert.equal((await post({ group: grp, customer: cust, items: [{ product_id: "nope", qty: 1 }] })).data.error, "PCC-020");
  assert.equal((await post({ group: grp, customer: cust, items: [] })).data.error, "PCC-002");
  assert.equal((await post({ group: grp, customer: cust, items: [{ product_id: JACKET, qty: 1, colour: "Black" }] })).data.error, "PCC-028");
  assert.equal((await post({ group: grp, customer: cust, items: [{ product_id: JACKET, qty: 1, size: "99", colour: "Black" }] })).data.error, "PCC-028");
  assert.ok(!sq());
});

await run("enquiry still validates sizes", async () => {
  const r = await post({ group: grp, customer: cust, items: [{ product_id: TBC, qty: 1 }, { product_id: JACKET, qty: 1, size: "99", colour: "Black" }] });
  assert.equal(r.data.error, "PCC-028"); assert.ok(!saved());
});

await run("customer checks", async () => {
  const items = [{ product_id: TEE, qty: 1 }];
  assert.equal((await post({ group: grp, customer: { name: "", phone: "" }, items })).data.error, "PCC-003");
  assert.equal((await post({ group: grp, customer: { name: "Jo", phone: "12" }, items })).data.error, "PCC-022");
  assert.equal((await post({ group: grp, customer: { ...cust, email: "bad" }, items })).data.error, "PCC-023");
});

await run("angle brackets stripped from notes and names", async () => {
  await post({ group: grp, customer: { ...cust, name: "Jo <b>T</b>" }, note: "<script>x</script>", items: [{ product_id: TEE, qty: 1 }] });
  const s = saved();
  assert.ok(!/[<>]/.test(s.p_customer_name + s.p_notes + s.p_description));
});

await run("Square rejects: no order saved", async () => {
  mode.squareFails = true;
  const r = await post({ group: grp, customer: cust, items: [{ product_id: TEE, qty: 1 }] });
  assert.equal(r.data.error, "PCC-008"); assert.ok(!saved());
});

await run("order save fails after Square: clear error", async () => {
  mode.saveFails = true;
  const r = await post({ group: grp, customer: cust, items: [{ product_id: TEE, qty: 1 }] });
  assert.equal(r.status, 500); assert.equal(r.data.error, "PCC-009");
});

await run("price lookup down: PCC-032, nothing charged", async () => {
  mode.lookupDown = true;
  const r = await post({ group: grp, customer: cust, items: [{ product_id: TEE, qty: 1 }] });
  assert.equal(r.data.error, "PCC-032"); assert.ok(!sq());
});

await run("square not configured: priced basket refused, enquiry still works", async () => {
  const keep = env.SQUARE_ACCESS_TOKEN; delete env.SQUARE_ACCESS_TOKEN;
  assert.equal((await post({ group: grp, customer: cust, items: [{ product_id: TEE, qty: 1 }] })).data.error, "PCC-005");
  assert.equal((await post({ group: grp, customer: cust, items: [{ product_id: TBC, qty: 1 }] })).data.enquiry, true);
  env.SQUARE_ACCESS_TOKEN = keep;
});

await run("bad JSON body", async () => {
  const res = await onRequestPost({ env, request: { json: async () => { throw new Error("x"); } } });
  assert.equal((await res.json()).error, "PCC-001");
});

globalThis.fetch = realFetch;
console.log("\nall club-checkout tests passed");
