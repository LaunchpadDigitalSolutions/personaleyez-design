/* ============================================================
   functions/_middleware.js — runs in front of every request.

   1. PIN LOCKOUT. The staff PIN is accepted by three endpoints
      (/api/admin, /api/product-photo, /api/site-photo). Guarding
      them one by one would leave the others open to guessing, so
      the guard lives here, once, in front of all three. After
      PIN_MAX_TRIES wrong PINs from one connection, that connection
      is locked out of all three for PIN_LOCK_SECONDS. Josh can lift
      a lock early from /unlock.html (functions/api/admin-unlock.js).
      - Needs env.RATE_LIMIT_KV (a KV namespace bound to the Pages
        project). Without it this guard does nothing.
      - An empty PIN is not counted as a wrong guess.
      - rpc "status" (no PIN) lets the login screen ask whether this
        connection is locked, without costing a try.
      Error codes: PS-ADMIN-AUTH (wrong, tries_left), PS-ADMIN-LOCKED
      (locked, retry_after seconds).

   2. MAINTENANCE GATE. Off by default. Set env.MAINTENANCE_MODE =
      "true" on the Cloudflare Pages project to show every visitor
      the branded down page instead of the real site - useful while
      merging/testing the inline editor without risking a broken
      page in front of real customers.
      Staff bypass reuses env.STAFF_PIN (no new secret): visit any
      page with ?staff=<PIN> once and a cookie remembers it for 24h,
      so Jo and Josh can keep testing the real site while everyone
      else sees maintenance.html.
   ============================================================ */

const PIN_MAX_TRIES = 3;
const PIN_LOCK_SECONDS = 900; // 15 min
const PIN_ROUTES = new Set(["/api/admin", "/api/product-photo", "/api/site-photo"]);

function jsonRes(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...(headers || {}) }
  });
}

// Compare two strings without bailing out at the first different character.
function samePin(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Pull the PIN (and rpc name) out of a JSON or multipart body without
// using up the original request, which the real endpoint still has to read.
async function readSent(request) {
  const type = request.headers.get("Content-Type") || "";
  try {
    if (type.includes("multipart/form-data")) {
      const form = await request.clone().formData();
      const pin = form.get("pin");
      return { pin: typeof pin === "string" ? pin : "", rpc: "" };
    }
    const body = await request.clone().json();
    return {
      pin: body && typeof body.pin === "string" ? body.pin : "",
      rpc: body && typeof body.rpc === "string" ? body.rpc : ""
    };
  } catch (e) { return null; } // not readable: let the endpoint give its own 400
}

function lockedRes(secondsLeft) {
  return jsonRes({ error: "PS-ADMIN-LOCKED", retry_after: secondsLeft }, 429,
    { "Retry-After": String(secondsLeft) });
}

async function pinGuard({ request, env }) {
  if (!env.RATE_LIMIT_KV || !env.STAFF_PIN) return null;
  if (request.method !== "POST" && request.method !== "DELETE") return null;
  const path = new URL(request.url).pathname.replace(/\/+$/, "");
  if (!PIN_ROUTES.has(path)) return null;

  const sent = await readSent(request);
  if (!sent) return null;

  const key = "pin:" + (request.headers.get("CF-Connecting-IP") || "unknown");
  const now = Math.floor(Date.now() / 1000);
  let rec = null;
  try { rec = JSON.parse((await env.RATE_LIMIT_KV.get(key)) || "null"); } catch (e) { rec = null; }
  if (!rec || typeof rec.n !== "number") rec = { n: 0, until: 0 };
  if (rec.until && rec.until <= now) rec = { n: 0, until: 0 }; // lock has run out

  // Locked: nothing gets through, not even the right PIN.
  if (rec.until > now) return lockedRes(rec.until - now);

  // Login screen asking "am I locked?" - costs nothing.
  if (path === "/api/admin" && sent.rpc === "status" && !sent.pin) {
    return jsonRes({ locked: false, tries_left: PIN_MAX_TRIES - rec.n }, 200);
  }

  // No PIN sent: the endpoint rejects it, but it isn't a guess.
  if (!sent.pin) return null;

  if (samePin(sent.pin, env.STAFF_PIN)) {
    if (rec.n > 0) await env.RATE_LIMIT_KV.delete(key);
    return null;
  }

  const n = rec.n + 1;
  if (n >= PIN_MAX_TRIES) {
    await env.RATE_LIMIT_KV.put(key, JSON.stringify({ n, until: now + PIN_LOCK_SECONDS }),
      { expirationTtl: PIN_LOCK_SECONDS });
    return lockedRes(PIN_LOCK_SECONDS);
  }
  await env.RATE_LIMIT_KV.put(key, JSON.stringify({ n, until: 0 }),
    { expirationTtl: PIN_LOCK_SECONDS });
  return jsonRes({ error: "PS-ADMIN-AUTH", tries_left: PIN_MAX_TRIES - n }, 401);
}

async function maintenanceGate({ request, env, next }) {
  if (!env.MAINTENANCE_MODE) return next();

  const url = new URL(request.url);
  if (url.pathname === "/maintenance.html" || url.pathname.startsWith("/img/")) {
    return next();
  }

  const cookie = request.headers.get("Cookie") || "";
  const hasBypassCookie = env.STAFF_PIN &&
    cookie.split(";").some((c) => c.trim() === `ps_bypass=${env.STAFF_PIN}`);
  const hasBypassParam = env.STAFF_PIN && url.searchParams.get("staff") === env.STAFF_PIN;

  if (hasBypassCookie || hasBypassParam) {
    const res = await next();
    if (hasBypassParam && !hasBypassCookie) {
      const headers = new Headers(res.headers);
      headers.append("Set-Cookie", `ps_bypass=${env.STAFF_PIN}; Path=/; Max-Age=86400; SameSite=Lax; Secure`);
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
    }
    return res;
  }

  const page = await env.ASSETS.fetch(new URL("/maintenance.html", request.url));
  return new Response(page.body, {
    status: 503,
    headers: { "Content-Type": "text/html; charset=utf-8", "Retry-After": "3600" }
  });
}

export async function onRequest(context) {
  const blocked = await pinGuard(context);
  if (blocked) return blocked;
  return maintenanceGate(context);
}
