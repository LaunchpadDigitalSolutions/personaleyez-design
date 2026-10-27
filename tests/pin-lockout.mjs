/* Tests for the PIN lockout (functions/_middleware.js) and the unlock
   endpoint. No network: KV is faked with a Map. Run: node tests/pin-lockout.mjs */
import { onRequest } from "../functions/_middleware.js";
import { onRequestPost as unlock } from "../functions/api/admin-unlock.js";

let pass = 0, fail = 0;
const check = (name, ok) => { ok ? pass++ : (fail++, console.log("FAIL", name)); };

function fakeKV() {
  const m = new Map();
  return {
    m,
    async get(k) { return m.has(k) ? m.get(k) : null; },
    async put(k, v) { m.set(k, v); },
    async delete(k) { m.delete(k); },
    async list({ prefix }) { return { keys: [...m.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })), list_complete: true }; }
  };
}
const PIN = "4821";
const mkEnv = (extra) => ({ STAFF_PIN: PIN, RATE_LIMIT_KV: fakeKV(), ...extra });
const NEXT = async () => new Response("through", { status: 200 });

function jsonReq(path, body, ip = "1.1.1.1", method = "POST") {
  return new Request("https://x.test" + path, { method, headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip }, body: JSON.stringify(body) });
}
function formReq(path, pin, ip = "1.1.1.1") {
  const f = new FormData(); f.append("pin", pin); f.append("file", new Blob(["x"]), "a.png");
  return new Request("https://x.test" + path, { method: "POST", headers: { "CF-Connecting-IP": ip }, body: f });
}
const run = (env, req) => onRequest({ request: req, env, next: NEXT });
const body = async r => JSON.parse(await r.text());

// 1. three wrong PINs: 2 left, 1 left, locked
{
  const env = mkEnv();
  let r = await run(env, jsonReq("/api/admin", { pin: "0000", rpc: "ping" }));
  check("1st wrong is 401", r.status === 401); check("1st wrong 2 left", (await body(r)).tries_left === 2);
  r = await run(env, jsonReq("/api/admin", { pin: "1111", rpc: "ping" }));
  check("2nd wrong 1 left", (await body(r)).tries_left === 1);
  r = await run(env, jsonReq("/api/admin", { pin: "2222", rpc: "ping" }));
  const b = await body(r);
  check("3rd wrong is 429", r.status === 429); check("3rd wrong locked 900s", b.error === "PS-ADMIN-LOCKED" && b.retry_after === 900);
  check("Retry-After header", r.headers.get("Retry-After") === "900");
  // right PIN while locked is refused
  r = await run(env, jsonReq("/api/admin", { pin: PIN, rpc: "ping" }));
  check("right PIN refused while locked", r.status === 429);
  // lock covers the photo endpoints too (JSON delete and multipart upload)
  r = await run(env, jsonReq("/api/product-photo", { pin: PIN, item_id: "a" }, "1.1.1.1", "DELETE"));
  check("locked on product-photo DELETE", r.status === 429);
  r = await run(env, formReq("/api/site-photo", PIN));
  check("locked on site-photo upload", r.status === 429);
  r = await run(env, formReq("/api/product-photo", PIN));
  check("locked on product-photo upload", r.status === 429);
  // status shows locked
  r = await run(env, jsonReq("/api/admin", { rpc: "status" }));
  check("status shows locked", r.status === 429);
  // a different connection is unaffected
  r = await run(env, jsonReq("/api/admin", { pin: PIN, rpc: "ping" }, "2.2.2.2"));
  check("other IP unaffected", r.status === 200 && await r.text() === "through");
  // lock runs out
  const realNow = Date.now; Date.now = () => realNow() + 901 * 1000;
  r = await run(env, jsonReq("/api/admin", { pin: PIN, rpc: "ping" }));
  Date.now = realNow;
  check("works again after 15 min", r.status === 200 && await r.text() === "through");
  check("count reset after lock", env.RATE_LIMIT_KV.m.size === 1 || ![...env.RATE_LIMIT_KV.m.keys()].includes("pin:1.1.1.1"));
}

// 2. wrong guesses spread across endpoints share one count
{
  const env = mkEnv();
  await run(env, jsonReq("/api/admin", { pin: "0000", rpc: "ping" }));
  await run(env, formReq("/api/site-photo", "0001"));
  const r = await run(env, jsonReq("/api/product-photo", { pin: "0002", item_id: "a" }, "1.1.1.1", "DELETE"));
  check("shared count across endpoints locks on 3rd", r.status === 429);
}

// 3. correct PIN clears the count
{
  const env = mkEnv();
  await run(env, jsonReq("/api/admin", { pin: "0000", rpc: "ping" }));
  await run(env, jsonReq("/api/admin", { pin: "0001", rpc: "ping" }));
  let r = await run(env, jsonReq("/api/admin", { pin: PIN, rpc: "ping" }));
  check("right PIN passes through", r.status === 200);
  r = await run(env, jsonReq("/api/admin", { pin: "0000", rpc: "ping" }));
  check("count restarted after right PIN", (await body(r)).tries_left === 2);
}

// 4. empty PIN and status calls are free
{
  const env = mkEnv();
  for (let i = 0; i < 6; i++) await run(env, jsonReq("/api/admin", { rpc: "ping" }));
  for (let i = 0; i < 6; i++) await run(env, jsonReq("/api/admin", { pin: "", rpc: "ping" }));
  let r = await run(env, jsonReq("/api/admin", { rpc: "status" }));
  const b = await body(r);
  check("status ok, 3 tries left", r.status === 200 && b.locked === false && b.tries_left === 3);
}

// 5. untouched cases
{
  const env = mkEnv();
  let r = await run(env, jsonReq("/api/notify-status", { pin: "bad" }));
  check("other routes ignored", r.status === 200);
  r = await onRequest({ request: new Request("https://x.test/api/admin", { method: "GET" }), env, next: NEXT });
  check("GET ignored", r.status === 200);
  const noKV = { STAFF_PIN: PIN };
  r = await onRequest({ request: jsonReq("/api/admin", { pin: "bad" }), env: noKV, next: NEXT });
  check("no KV: passes through (no lockout)", r.status === 200);
  r = await onRequest({ request: new Request("https://x.test/api/admin", { method: "POST", body: "not json{" }), env, next: NEXT });
  check("unreadable body passes to endpoint", r.status === 200);
}

// 6. maintenance gate still works
{
  const env = mkEnv({ MAINTENANCE_MODE: "true", ASSETS: { fetch: async () => new Response("down") } });
  let r = await onRequest({ request: new Request("https://x.test/index.html"), env, next: NEXT });
  check("maintenance 503 for visitors", r.status === 503);
  r = await onRequest({ request: new Request("https://x.test/index.html?staff=" + PIN), env, next: NEXT });
  check("maintenance bypass with staff param", r.status === 200 && (r.headers.get("Set-Cookie") || "").includes("ps_bypass"));
  r = await onRequest({ request: new Request("https://x.test/index.html"), env: mkEnv(), next: NEXT });
  check("maintenance off passes", r.status === 200);
}

// 7. unlock endpoint
{
  const KEY = "a-long-random-unlock-key-123";
  const env = mkEnv({ ADMIN_UNLOCK_KEY: KEY });
  for (let i = 0; i < 3; i++) await run(env, jsonReq("/api/admin", { pin: "bad" + i, rpc: "ping" }));
  let r = await run(env, jsonReq("/api/admin", { pin: PIN, rpc: "ping" }));
  check("locked before unlock", r.status === 429);
  r = await unlock({ request: jsonReq("/api/admin-unlock", { key: "wrong" }), env });
  check("wrong unlock key refused", r.status === 401);
  r = await unlock({ request: jsonReq("/api/admin-unlock", { key: KEY }), env });
  const b = await body(r);
  check("unlock clears", r.status === 200 && b.cleared === 1);
  r = await run(env, jsonReq("/api/admin", { pin: PIN, rpc: "ping" }));
  check("right PIN works after unlock", r.status === 200);
  r = await unlock({ request: jsonReq("/api/admin-unlock", { key: KEY }), env: { ...env, ADMIN_UNLOCK_KEY: "short" } });
  check("short key = not configured", r.status === 503);
  r = await unlock({ request: jsonReq("/api/admin-unlock", { key: "x" }), env: { STAFF_PIN: PIN } });
  check("no KV = not configured", r.status === 503);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
