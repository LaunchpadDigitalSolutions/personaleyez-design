/* Admin login must not use up Cloudflare's free KV delete limit (1,000 a day), and a refused delete must never
   keep out a right PIN. KV is faked; no network. Run: node tests/kv-delete-limit.mjs */
import { onRequest } from "../functions/_middleware.js";
import { onRequestPost as admin } from "../functions/api/admin.js";

let pass = 0, fail = 0;
const check = (name, ok) => { ok ? pass++ : (fail++, console.log("FAIL", name)); };

function fakeKV({ deleteLimit = Infinity } = {}) {
  const m = new Map(); const kv = { m, deletes: 0, puts: 0 };
  kv.get = async k => (m.has(k) ? m.get(k) : null);
  kv.put = async (k, v) => { kv.puts++; m.set(k, v); };
  kv.delete = async k => { kv.deletes++; if (kv.deletes > deleteLimit) { const e = new Error("KV delete() limit exceeded for the day."); e.status = 429; throw e; } m.delete(k); };
  kv.list = async ({ prefix }) => ({ keys: [...m.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })), list_complete: true });
  return kv;
}
const PIN = "4821";
const mkEnv = (kv, extra) => ({ STAFF_PIN: PIN, ADMIN_PASSPHRASE: "long-passphrase", RATE_LIMIT_KV: kv, ...extra });
const req = (body, ip = "1.1.1.1") => new Request("https://x.test/api/admin", { method: "POST", headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip }, body: JSON.stringify(body) });
const NEXT = async () => new Response("through", { status: 200 });
const mw = (env, r) => onRequest({ request: r, env, next: NEXT });
// middleware first, then the real admin function, like Cloudflare does
async function full(env, body, ip) {
  const r = req(body, ip), blocked = await mw(env, r.clone());
  if (blocked.status !== 200 || (await blocked.clone().text()) !== "through") return blocked;
  return admin({ request: r, env });
}
const j = async r => JSON.parse(await r.text());

// 1. 200 successful admin calls: no KV deletes at all (this was one per call)
{ const kv = fakeKV(), env = mkEnv(kv); let ok = 0;
  for (let i = 0; i < 200; i++) { const r = await full(env, { pin: PIN, rpc: "ping" }); if (r.status === 200) ok++; }
  check("200 right-PIN pings all succeed", ok === 200); check("200 right-PIN pings use 0 KV deletes", kv.deletes === 0);
}
// 2. the daily delete limit is already used up: a right PIN still gets in, with and without earlier wrong tries
{ const kv = fakeKV({ deleteLimit: 0 }), env = mkEnv(kv);
  let r = await full(env, { pin: PIN, rpc: "ping" }); check("delete limit hit, clean slate: right PIN works", r.status === 200);
  r = await full(env, { pin: "0000", rpc: "ping" }); check("wrong PIN still 401 with 2 left", r.status === 401 && (await j(r)).tries_left === 2);
  r = await full(env, { pin: PIN, rpc: "ping" }); check("delete limit hit, after a wrong try: right PIN works", r.status === 200 && (await r.json()) === true);
  r = await full(env, { pin: PIN, rpc: "ping" }); check("and keeps working", r.status === 200);
}
// 3. admin.js alone with a leftover counter and deletes refused
{ const kv = fakeKV({ deleteLimit: 0 }), env = mkEnv(kv); kv.m.set("pin_attempts:1.1.1.1", "2");
  const r = await admin({ request: req({ pin: PIN, rpc: "ping" }), env }); check("admin.js: refused delete does not block the right PIN", r.status === 200);
}
// 4. admin.js still clears a leftover counter when it can
{ const kv = fakeKV(), env = mkEnv(kv); kv.m.set("pin_attempts:1.1.1.1", "2");
  const r = await admin({ request: req({ pin: PIN, rpc: "ping" }), env }); check("admin.js: right PIN with a leftover counter clears it", r.status === 200 && kv.deletes === 1 && !kv.m.has("pin_attempts:1.1.1.1"));
}
// 5. wrong-PIN protection is unchanged
{ const kv = fakeKV(), env = mkEnv(kv);
  let r = await full(env, { pin: "1", rpc: "ping" }); check("1st wrong: 401, 2 left", r.status === 401 && (await j(r)).tries_left === 2);
  r = await full(env, { pin: "2", rpc: "ping" }); check("2nd wrong: 401, 1 left", r.status === 401 && (await j(r)).tries_left === 1);
  r = await full(env, { pin: "3", rpc: "ping" }); const b = await j(r); check("3rd wrong: locked 900s", r.status === 429 && b.error === "PS-ADMIN-LOCKED" && b.retry_after === 900);
  r = await full(env, { pin: PIN, rpc: "ping" }); check("right PIN refused while locked", r.status === 429);
  r = await full(env, { pin: PIN, rpc: "ping" }, "2.2.2.2"); check("other connection unaffected", r.status === 200);
}
// 6. a wrong try then a right PIN still resets the count when deletes work
{ const kv = fakeKV(), env = mkEnv(kv);
  await full(env, { pin: "bad", rpc: "ping" }); let r = await full(env, { pin: PIN, rpc: "ping" });
  check("right PIN after a wrong try works", r.status === 200); check("count was cleared (one delete)", kv.deletes === 1 && !kv.m.has("pin:1.1.1.1"));
  r = await full(env, { rpc: "status" }); check("status shows 3 tries left again", (await j(r)).tries_left === 3);
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
