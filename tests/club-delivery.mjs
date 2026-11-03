/* Tests for collection / delivery on /api/club-checkout.
   Run: node tests/club-delivery.mjs. fetch is stubbed (no network). */
import assert from "node:assert/strict";
import { onRequestPost } from "../functions/api/club-checkout.js";

const G = "1c941438-b478-4bf2-9dd5-87a3c6783ad2";
const id = n => `${n}${n}${n}${n}${n}${n}${n}${n}-${n}${n}${n}${n}-4${n}${n}${n}-8${n}${n}${n}-${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}`;
const P = { A: id("a"), B: id("b"), C: id("c"), D: id("d"), TBC: id("e") };
const ROWS = [
  { id: P.A, name: "Tee", price: 46, active: true },
  { id: P.B, name: "Big Bundle", price: 149.99, active: true },
  { id: P.C, name: "Team Bag Set", price: 150, active: true },
  { id: P.D, name: "Show Jacket", price: 100, active: true },
  { id: P.TBC, name: "Custom Piece", price: null, active: true }
].map(r => ({ sizes: "", colours: "", is_school_item: false, crest: false, ...r }));

const env = { SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_ROLE_KEY: "svc", SQUARE_ACCESS_TOKEN: "sq", SQUARE_LOCATION_ID: "loc", RESEND_API_KEY: "re", OWNER_NOTIFY_EMAIL: "jo@test" };
let calls;
globalThis.fetch = async (url, opts = {}) => {
  const body = opts.body ? JSON.parse(opts.body) : null;
  calls.push({ url: String(url), body });
  const json = (o, status = 200) => ({ ok: status < 400, status, json: async () => o, text: async () => JSON.stringify(o) });
  if (String(url).includes("ps_club_checkout_lookup")) {
    if (body.p_slug !== "lumsdale" || body.p_code !== "RIGHT") return json({ ok: false });
    return json({ ok: true, group: { id: G, slug: "lumsdale", name: "Lumsdale Theatre Arts" }, initials_pence: null, items: ROWS.filter(r => body.p_ids.includes(r.id)) });
  }
  if (String(url).includes("ps_club_create_order")) return json({ ...body, order_ref: body.p_order_ref, description: body.p_description });
  if (String(url).includes("squareup.com")) return json({ payment_link: { url: "https://square.test/pay", order_id: "SQ1" } });
  if (String(url).includes("resend.com")) return json({ id: "e1" });
  throw new Error("unexpected fetch " + url);
};

const cust = { name: "Jo Tapping", phone: "07700 900123" };
const grp = { slug: "lumsdale", code: "RIGHT" };
const addr = { line1: "12 Example Street", town: "Hartlepool", postcode: "ts26 0aa" };
const post = async payload => {
  const res = await onRequestPost({ env, request: { json: async () => ({ group: grp, customer: cust, ...payload }) } });
  return { status: res.status, data: await res.json() };
};
const run = async (name, fn) => { calls = []; await fn(); console.log("ok  " + name); };
const sqAmount = () => calls.find(c => c.url.includes("squareup")).body.quick_pay.price_money.amount;
const saved = () => calls.find(c => c.url.includes("ps_club_create_order")).body;
const hasSquare = () => calls.some(c => c.url.includes("squareup"));
const one = (p, qty = 1) => [{ product_id: p, qty }];

await run("collection is free", async () => {
  const r = await post({ items: one(P.A), delivery: { method: "collection" } });
  assert.equal(r.status, 200); assert.equal(sqAmount(), 4600);
  assert.ok(saved().p_description.includes("Collection (free)")); assert.equal(saved().p_total, 46);
});

await run("no delivery field means collection", async () => {
  await post({ items: one(P.A) });
  assert.equal(sqAmount(), 4600); assert.ok(saved().p_description.includes("Collection (free)"));
});

await run("delivery under £150 adds £4.99, address in notes only (never the public description)", async () => {
  const r = await post({ items: one(P.A), delivery: { method: "delivery", address: addr } });
  assert.equal(r.status, 200); assert.equal(sqAmount(), 5099);
  const s = saved();
  assert.equal(s.p_total, 50.99);
  assert.ok(s.p_description.includes("Delivery £4.99")); assert.ok(!s.p_description.includes("Example Street") && !s.p_description.includes("TS26"));
  assert.ok(s.p_notes.includes("Deliver to: 12 Example Street, Hartlepool, TS26 0AA"));
});

await run("£149.99 still pays delivery", async () => {
  await post({ items: one(P.B), delivery: { method: "delivery", address: addr } });
  assert.equal(sqAmount(), 14999 + 499);
});

await run("exactly £150.00 is free delivery", async () => {
  await post({ items: one(P.C), delivery: { method: "delivery", address: addr } });
  assert.equal(sqAmount(), 15000);
  assert.ok(saved().p_description.includes("Delivery (free, £150+)")); assert.ok(!saved().p_description.includes("Example Street"));
});

await run("over £150 is free delivery", async () => {
  await post({ items: one(P.D, 2), delivery: { method: "delivery", address: addr } });
  assert.equal(sqAmount(), 20000);
});

await run("fee sent by the browser is ignored", async () => {
  await post({ items: one(P.A), delivery: { method: "delivery", address: addr, fee: 0, feePence: 0, total: 1 }, deliveryFee: 0 });
  assert.equal(sqAmount(), 5099);
});

await run("delivery needs a full address and a real postcode", async () => {
  assert.equal((await post({ items: one(P.A), delivery: { method: "delivery" } })).data.error, "PCC-012");
  assert.equal((await post({ items: one(P.A), delivery: { method: "delivery", address: { ...addr, line1: "" } } })).data.error, "PCC-012");
  assert.equal((await post({ items: one(P.A), delivery: { method: "delivery", address: { ...addr, town: "" } } })).data.error, "PCC-012");
  assert.equal((await post({ items: one(P.A), delivery: { method: "delivery", address: { ...addr, postcode: "12345" } } })).data.error, "PCC-013");
  assert.ok(!hasSquare());
});

await run("unknown method refused", async () => {
  assert.equal((await post({ items: one(P.A), delivery: { method: "post" } })).data.error, "PCC-011");
  assert.ok(!hasSquare());
});

await run("collection ignores any address sent", async () => {
  await post({ items: one(P.A), delivery: { method: "collection", address: addr } });
  assert.equal(sqAmount(), 4600); assert.ok(!saved().p_notes.includes("Deliver to"));
});

await run("postcode is tidied, angle brackets removed", async () => {
  await post({ items: one(P.A), delivery: { method: "delivery", address: { line1: "<b>12</b> Example St", town: "Hartlepool", postcode: "ts260aa" } } });
  const s = saved();
  assert.ok(s.p_notes.includes("TS26 0AA")); assert.ok(!/[<>]/.test(s.p_description + s.p_notes));
});

await run("enquiry with delivery: no fee charged, address kept in notes and Jo's email only", async () => {
  const r = await post({ items: one(P.TBC), delivery: { method: "delivery", address: addr } });
  assert.equal(r.data.enquiry, true); assert.ok(!hasSquare());
  const s = saved();
  assert.equal(s.p_total, null);
  assert.ok(s.p_description.includes("Delivery requested (fee to confirm)")); assert.ok(!s.p_description.includes("Example Street"));
  const jo = calls.find(c => c.url.includes("resend") && c.body.to === "jo@test");
  assert.ok(jo); assert.ok(jo.body.html.includes("Deliver to: 12 Example Street, Hartlepool, TS26 0AA"));
});

await run("enquiry with collection", async () => {
  const r = await post({ items: one(P.TBC), delivery: { method: "collection" } });
  assert.equal(r.data.enquiry, true); assert.ok(saved().p_description.includes("Collection (free)"));
});

console.log("\nall club-delivery tests passed");
