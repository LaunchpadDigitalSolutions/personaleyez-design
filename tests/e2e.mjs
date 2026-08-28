#!/usr/bin/env node
/* ============================================================
   Peach State — end-to-end test suite
   Runs against the LIVE deployment and the LIVE Supabase project.

     node tests/e2e.mjs
     node tests/e2e.mjs --base=https://peach-state.pages.dev

   Creates its own data, prefixed ZZTEST, and deletes it again on
   the way out — including after a failure.
   ============================================================ */

const args = Object.fromEntries(
  process.argv.slice(2).map(a => a.replace(/^--/, "").split("="))
);

const BASE = args.base || "https://peachstate.launchpadclient.app";
const SB_URL = "https://coiwwbroycaznkmhevde.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvaXd3YnJveWNhem5rbWhldmRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NzIwMjksImV4cCI6MjA5OTU0ODAyOX0.r-k8RjKqouqjekvEXSMKzJykKbtgpGLMZQXcXhAmRW8";
const H = { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY, "Content-Type": "application/json" };

const TAG = "ZZTEST";
let pass = 0, fail = 0;
const failures = [];

const ok  = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  else { fail++; failures.push(name + (detail ? " — " + detail : ""));
         console.log(`  \x1b[31m✗\x1b[0m ${name}${detail ? " — " + detail : ""}`); }
};
const group = t => console.log(`\n\x1b[1m${t}\x1b[0m`);

const sb = async (path, opts = {}) => {
  const r = await fetch(SB_URL + "/rest/v1/" + path, { ...opts, headers: { ...H, ...(opts.headers || {}) } });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
};
const rpc = (fn, body) =>
  fetch(SB_URL + "/rest/v1/rpc/" + fn, { method: "POST", headers: H, body: JSON.stringify(body) })
    .then(r => r.json());

/* ---------- cleanup, safe to run at any point ---------- */
async function cleanup() {
  try {
    const gs = await sb(`ps_groups?slug=like.${TAG.toLowerCase()}*&select=id`);
    for (const g of gs) {
      await sb(`ps_group_products?group_id=eq.${g.id}`, { method: "DELETE" });
      await sb(`ps_groups?id=eq.${g.id}`, { method: "DELETE" });
    }
    await sb(`ps_orders?customer_name=like.${TAG}*`, { method: "DELETE" });
    await sb(`ps_enquiries?name=like.${TAG}*`, { method: "DELETE" });
    await sb(`ps_content?ckey=eq.${TAG.toLowerCase()}_key`, { method: "DELETE" });
  } catch (e) { console.log("  (cleanup warning: " + e.message + ")"); }
}

/* ============================================================ */
async function run() {
  console.log(`\n\x1b[1mPeach State E2E\x1b[0m  →  ${BASE}\n${"=".repeat(52)}`);
  await cleanup();

  /* ---------- 1. Pages reachable, correct content type ---------- */
  group("Pages");
  const pages = ["", "services.html", "schools.html", "clubs.html", "track.html", "contact.html", "admin.html"];
  for (const p of pages) {
    const r = await fetch(`${BASE}/${p}`);
    const html = await r.text();
    ok(`GET /${p || "(index)"} → 200`, r.status === 200, "got " + r.status);
    // Only flag ${...} that leaked into rendered markup, not template
    // literals inside the page's own <script> blocks.
    const markup = html.replace(/<script[\s\S]*?<\/script>/g, "");
    ok(`  /${p || "(index)"} has no unreplaced template vars`,
       !markup.includes("${"), "found ${ in rendered markup");
  }

  /* ---------- 2. Static assets ---------- */
  group("Assets");
  for (const a of ["css/style.css", "js/config.js", "js/api.js", "js/partials.js",
                   "js/admin.js", "js/track.js", "js/clubs.js",
                   "img/logo.png", "img/mark-only.png", "img/wordmark.png", "img/icon-180.png"]) {
    const r = await fetch(`${BASE}/${a}`);
    ok(`GET /${a}`, r.status === 200, "got " + r.status);
  }

  /* ---------- 3. Cache-busting present ---------- */
  group("Cache busting");
  const idx = await fetch(BASE + "/").then(r => r.text());
  ok("CSS is version-stamped", /style\.css\?v=[\d.]+/.test(idx));
  ok("JS is version-stamped", /config\.js\?v=[\d.]+/.test(idx));

  /* ---------- 4. Orders: create → advance → read ---------- */
  group("Orders");
  const ref = "PD-" + TAG.slice(0, 2) + Math.random().toString(36).slice(2, 5).toUpperCase();
  const [order] = await sb("ps_orders", {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      order_ref: ref, status: "enquiry", customer_name: TAG + " Customer",
      customer_phone: "07700900000", description: "E2E order", quantity: 2, quoted_total: 40
    })
  });
  ok("order created", !!order && order.order_ref === ref);

  for (const s of ["in_production", "ready", "collected"]) {
    await sb(`ps_orders?id=eq.${order.id}`, { method: "PATCH", body: JSON.stringify({ status: s }) });
    const [chk] = await sb(`ps_orders?id=eq.${order.id}&select=status`);
    ok(`status → ${s}`, chk.status === s, "got " + chk.status);
  }

  const [found] = await sb(`ps_orders?order_ref=eq.${ref}&select=*`);
  ok("order retrievable by reference", !!found);
  const none = await sb("ps_orders?order_ref=eq.PD-NOPE1&select=*");
  ok("unknown reference returns nothing", none.length === 0);

  /* ---------- 5. Club shops + access control ---------- */
  group("Club shops");
  const slug = TAG.toLowerCase() + "-club";
  const [club] = await sb("ps_groups", {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ slug, name: TAG + " Club", kind: "club", access_code: "ZZCODE", active: true })
  });
  ok("club created", !!club);

  await sb("ps_group_products", {
    method: "POST",
    body: JSON.stringify({ group_id: club.id, name: "E2E hoodie", price: 25, sizes: "S, M, L" })
  });

  const good = await rpc("ps_group_login", { p_slug: slug, p_code: "ZZCODE" });
  ok("correct code grants access", good.ok === true);
  ok("  returns the club", good.group && good.group.name === TAG + " Club");
  ok("  returns its products", good.products && good.products.length === 1);

  const lower = await rpc("ps_group_login", { p_slug: slug, p_code: "zzcode" });
  ok("code is case-insensitive", lower.ok === true);
  const spaced = await rpc("ps_group_login", { p_slug: slug, p_code: " ZZ CODE " });
  ok("code ignores spacing", spaced.ok === true);

  const bad = await rpc("ps_group_login", { p_slug: slug, p_code: "WRONG" });
  ok("wrong code denied", bad.ok === false);
  ok("  denial leaks nothing", !bad.group && !bad.products);
  const noClub = await rpc("ps_group_login", { p_slug: "does-not-exist", p_code: "ZZCODE" });
  ok("unknown club denied", noClub.ok === false);

  await sb(`ps_groups?id=eq.${club.id}`, { method: "PATCH", body: JSON.stringify({ active: false }) });
  const paused = await rpc("ps_group_login", { p_slug: slug, p_code: "ZZCODE" });
  ok("paused club denied", paused.ok === false);
  await sb(`ps_groups?id=eq.${club.id}`, { method: "PATCH", body: JSON.stringify({ active: true }) });

  /* duplicate slug must be rejected */
  let dupeRejected = false;
  try {
    await sb("ps_groups", { method: "POST", body: JSON.stringify({ slug, name: "dupe", access_code: "X" }) });
  } catch { dupeRejected = true; }
  ok("duplicate club slug rejected", dupeRejected);

  /* ---------- 6. Enquiries ---------- */
  group("Enquiries");
  await sb("ps_enquiries", {
    method: "POST",
    body: JSON.stringify({ name: TAG + " Enquirer", phone: "07700900000", category: "workwear", message: "E2E" })
  });
  const enq = await sb(`ps_enquiries?name=eq.${TAG}%20Enquirer&select=*`);
  ok("enquiry saved", enq.length === 1);
  ok("  defaults to unhandled", enq[0].handled === false);

  /* ---------- 7. Editable content ---------- */
  group("Content editor");
  const key = TAG.toLowerCase() + "_key";
  const put = v => fetch(`${SB_URL}/rest/v1/ps_content?on_conflict=page,ckey`, {
    method: "POST",
    headers: { ...H, Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ page: "index", ckey: key, value: v })
  }).then(r => r.json());
  await put("first");
  const second = await put("second");
  ok("content upserts rather than duplicating", Array.isArray(second) && second[0].value === "second");
  const rows = await sb(`ps_content?ckey=eq.${key}&select=*`);
  ok("  only one row per page+key", rows.length === 1);

  /* ---------- 8. Schema guarantees ---------- */
  group("Schema");
  let badStatus = false;
  try {
    await sb("ps_orders", { method: "POST", body: JSON.stringify({
      order_ref: "PD-BAD01", status: "nonsense", customer_name: TAG + " Bad",
      customer_phone: "0", description: "x" }) });
  } catch { badStatus = true; }
  ok("invalid order status rejected", badStatus);

  await cleanup();

  /* ---------- summary ---------- */
  console.log("\n" + "=".repeat(52));
  console.log(`\x1b[1m${pass} passed, ${fail} failed\x1b[0m`);
  if (fail) { console.log("\nFailures:"); failures.forEach(f => console.log("  - " + f)); }
  process.exit(fail ? 1 : 0);
}

run().catch(async e => {
  console.error("\n\x1b[31mSuite crashed:\x1b[0m", e.message);
  await cleanup();
  process.exit(1);
});
