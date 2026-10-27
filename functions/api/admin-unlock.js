/* ============================================================
   POST /api/admin-unlock
   Body: { key }
   Lifts every PIN lockout early (see functions/_middleware.js).
   Only Josh has the key: env.ADMIN_UNLOCK_KEY, set in the Pages
   project's environment variables, 16+ characters. Used by
   /unlock.html. Also clears the older pin_attempts: counters.
   Error codes: PS-UNLOCK-CONFIG, PS-UNLOCK-AUTH
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

export async function onRequestPost({ request, env }) {
  if (!env.ADMIN_UNLOCK_KEY || env.ADMIN_UNLOCK_KEY.length < 16 || !env.RATE_LIMIT_KV) {
    return json({ error: "PS-UNLOCK-CONFIG" }, 503);
  }
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "PS-UNLOCK-AUTH" }, 401); }
  if (!body || !samePin(body.key, env.ADMIN_UNLOCK_KEY)) {
    return json({ error: "PS-UNLOCK-AUTH" }, 401);
  }

  let cleared = 0;
  for (const prefix of ["pin:", "pin_attempts:"]) {
    let cursor;
    do {
      const page = await env.RATE_LIMIT_KV.list({ prefix, cursor });
      for (const k of page.keys) { await env.RATE_LIMIT_KV.delete(k.name); cleared++; }
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);
  }
  return json({ cleared }, 200);
}
