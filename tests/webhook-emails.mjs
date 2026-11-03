/* Square webhook: Jo's email shows notes (club + delivery address); the customer
   email wording follows delivery; a bad signature is still refused.
   Run: node tests/webhook-emails.mjs */
import assert from "node:assert/strict";
import { onRequestPost } from "../functions/api/webhooks/square.js";

const KEY = "sigkey", URL_ = "https://peachstate.co.uk/api/webhooks/square";
const env = { SQUARE_WEBHOOK_SIGNATURE_KEY: KEY, SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_ROLE_KEY: "svc", RESEND_API_KEY: "re", OWNER_NOTIFY_EMAIL: "jo@test" };
let order, mails;
globalThis.fetch = async (url, opts = {}) => {
  const ok = o => ({ ok: true, status: 200, json: async () => o, text: async () => "" });
  if (String(url).includes("ps_checkout_mark_paid")) return ok(order);
  if (String(url).includes("resend.com")) { mails.push(JSON.parse(opts.body)); return ok({}); }
  throw new Error("unexpected " + url);
};
async function sign(body) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(URL_ + body)))));
}
/* Sends a signed "payment completed" for this order and returns the HTTP status. */
async function pay(o, signature) {
  order = o; mails = [];
  const body = JSON.stringify({ type: "payment.updated", data: { object: { payment: { status: "COMPLETED", order_id: "SQ1", amount_money: { amount: 1799 } } } } });
  const sig = signature ?? await sign(body);
  const res = await onRequestPost({ env, request: { text: async () => body, headers: { get: () => sig } } });
  return res.status;
}
const base = { order_ref: "PD-AAAAA", customer_name: "Jo", customer_email: "c@test", customer_phone: "07700900123", deposit_paid: 17.99 };
const to = addr => mails.find(m => m.to === addr);
const run = async (name, fn) => { await fn(); console.log("ok  " + name); };

await run("delivery order: Jo sees the address, the customer email avoids 'collect' and the address", async () => {
  assert.equal(await pay({ ...base, description: "Lumsdale: 1 × Tee @ £13.00 = £13.00; Delivery £4.99", notes: "Lumsdale · Deliver to: 12 Example Street, Hartlepool, TS26 0AA" }), 200);
  assert.ok(to("jo@test").html.includes("Deliver to: 12 Example Street, Hartlepool, TS26 0AA"));
  assert.ok(!/collect/i.test(to("c@test").html)); assert.ok(!to("c@test").html.includes("Example Street"));
});
await run("collection order: unchanged wording, notes shown to Jo", async () => {
  await pay({ ...base, description: "Lumsdale: 1 × Tee; Collection (free)", notes: "Lumsdale" });
  assert.ok(to("c@test").html.includes("ready to collect")); assert.ok(to("jo@test").html.includes("Notes: Lumsdale"));
});
await run("order with no notes: no Notes line", async () => {
  await pay({ ...base, description: "Tee", notes: null });
  assert.ok(!to("jo@test").html.includes("Notes:"));
});
await run("bad signature is refused and nothing is emailed", async () => {
  assert.equal(await pay({ ...base, description: "Tee" }, "bogus"), 400); assert.equal(mails.length, 0);
});
console.log("\nall webhook email tests passed");
