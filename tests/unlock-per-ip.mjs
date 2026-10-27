/* Tests for the per-connection unlock (functions/api/admin-unlock.js)
   together with the lockout guard. KV is faked. Run: node tests/unlock-per-ip.mjs */
import { onRequest } from "../functions/_middleware.js";
import { onRequestPost as unlock } from "../functions/api/admin-unlock.js";

let pass = 0, fail = 0;
const check = (name, ok) => { ok ? pass++ : (fail++, console.log("FAIL", name)); };
function fakeKV() {
  const m = new Map();
  return { m,
    async get(k) { return m.has(k) ? m.get(k) : null; },
    async put(k, v) { m.set(k, v); },
    async delete(k) { m.delete(k); },
    async list({ prefix }) { return { keys: [...m.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })), list_complete: true }; } };
}
const PIN = "4821", KEY = "a-long-random-unlock-key-123";
const env = { STAFF_PIN: PIN, ADMIN_UNLOCK_KEY: KEY, RATE_LIMIT_KV: fakeKV() };
const NEXT = async () => new Response("through", { status: 200 });
const req = (path, body, ip) => new Request("https://x.test" + path, { method: "POST", headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip || "9.9.9.9" }, body: JSON.stringify(body) });
const guard = (ip, pin) => onRequest({ request: req("/api/admin", { pin, rpc: "ping" }, ip), env, next: NEXT });
const un = body => unlock({ request: req("/api/admin-unlock", body), env });
const j = async r => JSON.parse(await r.text());

for (const ip of ["1.1.1.1", "2.2.2.2", "3.3.3.3"]) for (let i = 0; i < 3; i++) await guard(ip, "bad" + i);
await guard("4.4.4.4", "bad");            // one wrong guess only: not locked
const realNow = Date.now;

let r = await un({ key: KEY, action: "list" });
let b = await j(r);
check("list ok", r.status === 200);
check("lists the 3 locked, not the 1-try IP", b.locked.length === 3 && !b.locked.some(l => l.ip === "4.4.4.4"));
check("each has seconds_left <= 900", b.locked.every(l => l.seconds_left > 0 && l.seconds_left <= 900));
check("list needs the key", (await un({ key: "nope", action: "list" })).status === 401);

r = await un({ key: KEY, action: "unlock", ip: "2.2.2.2" });
check("unlock one: cleared 1", (await j(r)).cleared === 1);
check("2.2.2.2 can log in", (await guard("2.2.2.2", PIN)).status === 200);
check("1.1.1.1 still locked", (await guard("1.1.1.1", PIN)).status === 429);
check("3.3.3.3 still locked", (await guard("3.3.3.3", PIN)).status === 429);
b = await j(await un({ key: KEY, action: "list" }));
check("list now shows 2", b.locked.length === 2);

r = await un({ key: KEY, action: "unlock", ip: "8.8.8.8" });
check("unlock an unlocked IP: cleared 0", r.status === 200 && (await j(r)).cleared === 0);
check("bad ip refused", (await un({ key: KEY, action: "unlock", ip: "../x" })).status === 400);
check("missing ip refused", (await un({ key: KEY, action: "unlock" })).status === 400);
check("unlock one needs key", (await un({ key: "nope", action: "unlock", ip: "1.1.1.1" })).status === 401);
check("unknown action refused", (await un({ key: KEY, action: "wipe" })).status === 400);

Date.now = () => realNow() + 901 * 1000;   // everything has expired
b = await j(await un({ key: KEY, action: "list" }));
Date.now = realNow;
check("expired locks not listed", b.locked.length === 0);

r = await un({ key: KEY });                 // no action = unlock all (old behaviour)
check("no action = all", r.status === 200 && (await j(r)).cleared >= 1);
check("1.1.1.1 free after all", (await guard("1.1.1.1", PIN)).status === 200);
check("config check still applies", (await unlock({ request: req("/x", { key: KEY, action: "list" }), env: { ...env, ADMIN_UNLOCK_KEY: "short" } })).status === 503);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
