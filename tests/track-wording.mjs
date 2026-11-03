/* Track page wording: unknown / pending_payment never crash, delivery orders
   don't say "collect". Run: node tests/track-wording.mjs */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const src = fs.readFileSync(new URL("../js/track.js", import.meta.url), "utf8");
const els = {};
const el = id => els[id] || (els[id] = { id, textContent: "", innerHTML: "", className: "", style: {}, value: "" });
const ctx = vm.createContext({
  document: { getElementById: el, addEventListener() {} },
  location: { search: "" }, URLSearchParams,
  findOrder: async () => null, healthCheck: async () => true, console
});
vm.runInContext(src + "\nthis.render = render; this.isDelivery = isDelivery;", ctx);
const show = o => { vm.runInContext("render(" + JSON.stringify(o) + ")", ctx); return { pill: els["r-pill"].textContent, tl: els["r-timeline"].innerHTML }; };
const run = (name, fn) => { fn(); console.log("ok  " + name); };

const collect = d => ({ order_ref: "PD-AAAAA", description: "Lumsdale: 1 × Tee (S); Collection (free)", ...d });
const deliver = d => ({ order_ref: "PD-BBBBB", description: "Lumsdale: 1 × Tee (S) @ £13.00 = £13.00; Delivery £4.99", ...d });

run("pending_payment shows a message instead of crashing", () => {
  const r = show(collect({ status: "pending_payment" }));
  assert.equal(r.pill, "Confirming your payment"); assert.ok(r.tl.includes("Refresh this page"));
});
run("unknown status falls back instead of crashing", () => {
  const r = show(collect({ status: "something_new" })); assert.equal(r.pill, "Order received");
});
run("collection order: ready says collection, collected says collected", () => {
  assert.equal(show(collect({ status: "ready" })).pill, "Ready for collection");
  assert.equal(show(collect({ status: "collected" })).pill, "Collected");
  assert.ok(show(collect({ status: "ready" })).tl.includes("184 York Road"));
});
run("delivery order: ready says delivery, collected says delivered, no 'collect' anywhere", () => {
  const ready = show(deliver({ status: "ready" })), done = show(deliver({ status: "collected" }));
  assert.equal(ready.pill, "Ready for delivery"); assert.equal(done.pill, "Delivered");
  assert.ok(!/collect|York Road/i.test(ready.tl + done.tl));
});
run("delivery detection: free, requested, none, item named Delivery", () => {
  const d = x => vm.runInContext("isDelivery(" + JSON.stringify({ description: x }) + ")", ctx);
  assert.equal(d("A: 1 × Tee; Delivery (free, £150+)"), true);
  assert.equal(d("A: 1 × Tee (price to confirm); Delivery requested (fee to confirm)"), true);
  assert.equal(d("A: 1 × Tee; Collection (free)"), false);
  assert.equal(d("A: 1 × Delivery Bag; Collection (free)"), false);
  assert.equal(d(""), false); assert.equal(d(undefined), false);
});
run("cancelled and the normal flow still work", () => {
  assert.equal(show(collect({ status: "cancelled" })).pill, "Cancelled");
  assert.ok(show(collect({ status: "in_production" })).tl.includes("Being stitched"));
});
console.log("\nall track wording tests passed");
