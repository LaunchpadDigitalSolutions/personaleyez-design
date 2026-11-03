/* Status emails: delivery orders never say "collect". Run: node tests/delivery-emails.mjs */
import assert from "node:assert/strict";
import { onRequestPost } from "../functions/api/notify-status.js";

const env = { SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_ROLE_KEY: "svc", RESEND_API_KEY: "re" };
let row, sent;
globalThis.fetch = async (url, opts = {}) => {
  const ok = o => ({ ok: true, status: 200, json: async () => o, text: async () => "" });
  if (String(url).includes("/ps_orders?id=eq.") && !opts.method) return ok([row]);
  if (String(url).includes("resend.com")) { sent.push(JSON.parse(opts.body)); return ok({ id: "e" }); }
  return ok({});
};
const go = async (status, description) => {
  row = { id: "1", order_ref: "PD-AAAAA", customer_name: "Jo", customer_email: "j@test", description, ready_notified: false };
  sent = [];
  await onRequestPost({ env, request: { json: async () => ({ order_id: "1", status }) } });
  return sent[0];
};
const run = async (name, fn) => { await fn(); console.log("ok  " + name); };

await run("collection order keeps the collect wording", async () => {
  const r = await go("ready", "Club: 1 × Tee; Collection (free)");
  assert.ok(r.subject.startsWith("Ready to collect")); assert.ok(r.html.includes("ready for collection"));
  const p = await go("in_production", "Club: 1 × Tee; Collection (free)");
  assert.ok(p.html.includes("ready to collect"));
});
await run("delivery order: ready email says delivery, never collect", async () => {
  for (const d of ["Club: 1 × Tee; Delivery £4.99", "Club: 1 × Tee; Delivery (free, £150+)", "Club: 1 × Tee (price to confirm); Delivery requested (fee to confirm)"]) {
    const r = await go("ready", d);
    assert.ok(r.subject.startsWith("Ready for delivery")); assert.ok(!/collect/i.test(r.subject + r.html));
    const p = await go("in_production", d); assert.ok(!/collect/i.test(p.html));
    const e = await go("enquiry", d); assert.ok(!/collect/i.test(e.html));
  }
});
await run("orders with no description (older orders) still get the collect wording", async () => {
  const r = await go("ready", null); assert.ok(r.subject.startsWith("Ready to collect"));
});
console.log("\nall delivery email tests passed");
