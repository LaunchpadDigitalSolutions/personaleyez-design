/* ============================================================
   functions/api/admin.js — the real admin gate.

   Everything the kitchen^Wshop dashboard needs from the database
   (listing orders/enquiries/groups/products, updating order status,
   creating/editing groups and products) goes through here instead
   of calling Supabase directly from the browser. Two secrets make
   this work, and NEITHER of them is ever shipped to the browser:

   - env.STAFF_PIN     — what Jo actually types on the login screen.
   - env.ADMIN_PASSPHRASE — the long random value the database's
     ps_admin_check() function checks before letting any ps_admin_*
     RPC run. This used to be hardcoded in js/admin.js, which meant
     anyone who fetched that one public file had full read/write
     access to every customer's orders and enquiries. Now it only
     ever exists here, on the server, and in the database itself.

   Set both in the Cloudflare Pages project's environment variables
   (Settings → Environment variables) — this file only reads them,
   it doesn't define them.

   - env.RATE_LIMIT_KV (optional) — a KV namespace, bound in the
     Pages project's Functions settings, used to lock out a PIN after
     MAX_PIN_ATTEMPTS wrong tries per IP. Without it, this file works
     exactly as before (no lockout) — a 4-digit PIN with no lockout at
     all is brute-forceable well under an hour, so create and bind a
     KV namespace here when you get the chance.
   ============================================================ */

const SB_URL = "https://coiwwbroycaznkmhevde.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvaXd3YnJveWNhem5rbWhldmRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NzIwMjksImV4cCI6MjA5OTU0ODAyOX0.r-k8RjKqouqjekvEXSMKzJykKbtgpGLMZQXcXhAmRW8";

// Only these may be called through this proxy — never a client-chosen
// arbitrary function name.
const ADMIN_RPCS = new Set([
  "ps_admin_list_orders", "ps_admin_create_order", "ps_admin_update_order_status",
  "ps_admin_list_enquiries", "ps_admin_mark_enquiry_handled",
  "ps_admin_list_groups", "ps_admin_create_group", "ps_admin_update_group", "ps_admin_delete_group",
  "ps_admin_list_group_products", "ps_admin_create_group_product",
  "ps_admin_update_group_product", "ps_admin_delete_group_product",
  "ps_admin_list_shop_products", "ps_admin_create_shop_product",
  "ps_admin_update_shop_product", "ps_admin_delete_shop_product",
  "ps_admin_save_content"
]);

const MAX_PIN_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 900; // 15 min

async function checkRateLimit(env, request) {
  if (!env.RATE_LIMIT_KV) return { limited: false }; // no KV bound yet - no-op
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const key = `pin_attempts:${ip}`;
  const raw = await env.RATE_LIMIT_KV.get(key);
  const count = raw ? parseInt(raw, 10) : 0;
  if (count >= MAX_PIN_ATTEMPTS) return { limited: true };
  return { limited: false, count, key };
}

async function recordFailedAttempt(env, key, count) {
  if (!env.RATE_LIMIT_KV) return;
  await env.RATE_LIMIT_KV.put(key, String(count + 1), { expirationTtl: LOCKOUT_SECONDS });
}

async function clearAttempts(env, key) {
  if (!env.RATE_LIMIT_KV) return;
  await env.RATE_LIMIT_KV.delete(key);
}

export async function onRequestPost({ request, env }) {
  if (!env.STAFF_PIN || !env.ADMIN_PASSPHRASE) {
    return new Response(JSON.stringify({ error: "PS-ADMIN-CONFIG" }), { status: 500 });
  }

  let body;
  try { body = await request.json(); } catch (e) {
    return new Response(JSON.stringify({ error: "PS-ADMIN-BODY" }), { status: 400 });
  }

  const { pin, rpc, params } = body || {};

  const rate = await checkRateLimit(env, request);
  if (rate.limited) {
    return new Response(JSON.stringify({ error: "PS-ADMIN-LOCKED" }), { status: 429 });
  }

  if (!pin || pin !== env.STAFF_PIN) {
    if (rate.key) await recordFailedAttempt(env, rate.key, rate.count);
    return new Response(JSON.stringify({ error: "PS-ADMIN-AUTH" }), { status: 401 });
  }
  if (rate.key) await clearAttempts(env, rate.key);

  // "ping" is used only by the login screen, to check the PIN without
  // running any real query.
  if (rpc === "ping") {
    return new Response(JSON.stringify(true), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  if (!rpc || !ADMIN_RPCS.has(rpc)) {
    return new Response(JSON.stringify({ error: "PS-ADMIN-RPC" }), { status: 400 });
  }

  const res = await fetch(`${SB_URL}/rest/v1/rpc/${rpc}`, {
    method: "POST",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json"
    },
    // Client params spread FIRST so a forged p_pass in the request body
    // can never shadow the real passphrase set immediately after it.
    body: JSON.stringify({ ...(params || {}), p_pass: env.ADMIN_PASSPHRASE })
  });

  const text = await res.text();
  return new Response(text, { status: res.status, headers: { "Content-Type": "application/json" } });
}
