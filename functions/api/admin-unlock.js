/* ============================================================
   POST /api/admin-unlock
   Body: { key, action, ip }
   Lifts PIN lockouts early (see functions/_middleware.js).
   Only Josh has the key: env.ADMIN_UNLOCK_KEY, set in the Pages
   project's environment variables, 16+ characters. Used by
   /unlock.html.
   Actions (action omitted = "all"):
   - "list"   -> { locked: [{ ip, seconds_left }] }, longest lock first
   - "unlock" -> clears one connection's lock; needs ip
   - "all"    -> clears every lock (and older pin_attempts: counters)
   Error codes: PS-UNLOCK-CONFIG, PS-UNLOCK-AUTH, PS-UNLOCK-IP
   ============================================================ */

function samePin(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function json(body, status) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// Every KV key under a prefix, across pages.
async function keysWithPrefix(kv, prefix) {
  const names = [];
  let cursor;
  do {
    const page = await kv.list({ prefix, cursor });
    for (const k of page.keys) names.push(k.name);
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return names;
}

// Connections that are locked right now.
async function listLocked(kv) {
  const now = Math.floor(Date.now() / 1000);
  const locked = [];
  for (const name of await keysWithPrefix(kv, "pin:")) {
    let rec = null;
    try { rec = JSON.parse((await kv.get(name)) || "null"); } catch (e) { rec = null; }
    if (rec && rec.until > now) locked.push({ ip: name.slice(4), seconds_left: rec.until - now });
  }
  return locked.sort((a, b) => b.seconds_left - a.seconds_left);
}

export async function onRequestPost({ request, env }) {
  if (!env.ADMIN_UNLOCK_KEY || env.ADMIN_UNLOCK_KEY.length < 16 || !env.RATE_LIMIT_KV) {
    return json({ error: "PS-UNLOCK-CONFIG" }, 503);
  }
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "PS-UNLOCK-AUTH" }, 401); }
  if (!body || !samePin(body.key, env.ADMIN_UNLOCK_KEY)) {
    return json({ error: "PS-UNLOCK-AUTH" }, 401);
  }
  const kv = env.RATE_LIMIT_KV;
  const action = body.action || "all";

  if (action === "list") return json({ locked: await listLocked(kv) }, 200);

  if (action === "unlock") {
    const ip = body.ip;
    if (typeof ip !== "string" || !/^[0-9a-fA-F:.]{2,45}$|^unknown$/.test(ip)) {
      return json({ error: "PS-UNLOCK-IP" }, 400);
    }
    const had = (await kv.get("pin:" + ip)) !== null;
    await kv.delete("pin:" + ip);
    await kv.delete("pin_attempts:" + ip);
    return json({ cleared: had ? 1 : 0, ip }, 200);
  }

  if (action === "all") {
    let cleared = 0;
    for (const prefix of ["pin:", "pin_attempts:"]) {
      for (const name of await keysWithPrefix(kv, prefix)) { await kv.delete(name); cleared++; }
    }
    return json({ cleared }, 200);
  }

  return json({ error: "PS-UNLOCK-IP" }, 400);
}
