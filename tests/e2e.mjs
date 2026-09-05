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
// Matches ADMIN_PASSPHRASE in js/admin.js - needed to call the passphrase-gated
// ps_admin_* RPCs directly the same way the real admin page does.
const ADMIN_PASS = "CSZjmD0Mohgj7EieDXoCu7Onhg1T";

const RUN = Math.random().toString(36).slice(2, 7).toUpperCase();
const TAG = "ZZTEST" + RUN;   // unique per run — orders/enquiries can't be deleted (by design)
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

/* ---------- cleanup ----------
   ps_orders and ps_enquiries deliberately have NO delete policy — the public
   key must never be able to erase a customer's order. Those rows are left
   behind and reported at the end; purge them with the SQL in the README. */
async function cleanup() {
  try {
    const list = await sb(`rpc/ps_admin_list_groups`, { method: "POST", body: JSON.stringify({ p_pass: ADMIN_PASS }) });
    for (const g of (list || []).filter(g => g.slug && g.slug.toLowerCase().startsWith("zztest"))) {
      const prods = await sb(`rpc/ps_admin_list_group_products`, {
        method: "POST", body: JSON.stringify({ p_pass: ADMIN_PASS, p_group_id: g.id })
      });
      for (const p of (prods || [])) {
        await sb(`rpc/ps_admin_delete_group_product`, { method: "POST", body: JSON.stringify({ p_pass: ADMIN_PASS, p_id: p.id }) });
      }
      await sb(`rpc/ps_admin_delete_group`, { method: "POST", body: JSON.stringify({ p_pass: ADMIN_PASS, p_id: g.id }) });
    }
    await sb(`ps_content?ckey=like.zztest*`, { method: "DELETE" });
  } catch (e) { console.log("  (cleanup warning: " + e.message + ")"); }
}

async function leftovers() {
  const o = await sb(`ps_orders?customer_name=like.ZZTEST*&select=order_ref`);
  const e = await sb(`ps_enquiries?name=like.ZZTEST*&select=id`);
  return { orders: o.length, enquiries: e.length };
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
  const club = await sb("rpc/ps_admin_create_group", {
    method: "POST",
    body: JSON.stringify({ p_pass: ADMIN_PASS, p_name: TAG + " Club", p_slug: slug,
      p_code: "ZZCODE", p_kind: "club", p_intro: null, p_active: true })
  });
  ok("club created", !!club && club.slug === slug);

  await sb("rpc/ps_admin_create_group_product", {
    method: "POST",
    body: JSON.stringify({ p_pass: ADMIN_PASS, p_group_id: club.id, p_name: "E2E hoodie",
      p_description: null, p_price: 25, p_sizes: "S, M, L", p_colours: null,
      p_image_url: null, p_sort_order: 0 })
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

  await sb("rpc/ps_admin_update_group", { method: "POST",
    body: JSON.stringify({ p_pass: ADMIN_PASS, p_id: club.id, p_active: false }) });
  const paused = await rpc("ps_group_login", { p_slug: slug, p_code: "ZZCODE" });
  ok("paused club denied", paused.ok === false);
  await sb("rpc/ps_admin_update_group", { method: "POST",
    body: JSON.stringify({ p_pass: ADMIN_PASS, p_id: club.id, p_active: true }) });

  /* duplicate slug must be rejected */
  let dupeRejected = false;
  try {
    await sb("rpc/ps_admin_create_group", { method: "POST",
      body: JSON.stringify({ p_pass: ADMIN_PASS, p_name: "dupe", p_slug: slug,
        p_code: "X", p_kind: "club", p_intro: null, p_active: true }) });
  } catch { dupeRejected = true; }
  ok("duplicate club slug rejected", dupeRejected);

  /* anon key must not be able to write to ps_groups directly, bypassing
     the admin RPCs entirely - this is the actual security boundary. */
  let directWriteBlocked = false;
  try {
    await sb("ps_groups", { method: "POST",
      body: JSON.stringify({ slug: slug + "-direct", name: "direct", access_code: "X" }) });
  } catch { directWriteBlocked = true; }
  ok("direct anon write to ps_groups is blocked", directWriteBlocked);

  /* ---------- 6. Enquiries ---------- */
  group("Enquiries");
  await sb("ps_enquiries", {
    method: "POST",
    body: JSON.stringify({ name: TAG + " Enquirer", phone: "07700900000", category: "workwear", message: "E2E" })
  });
  const enq = await sb(`ps_enquiries?name=eq.${TAG}%20Enquirer&select=*`);
  ok("enquiry saved", enq.length === 1, "found " + enq.length);
  ok("  defaults to unhandled", enq.length > 0 && enq[0].handled === false);

  /* ---------- 7. Editable content ---------- */
  group("Content editor");
  const key = "zztest_" + RUN.toLowerCase();
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

  /* ---------- 7b. Deletion must be impossible with the public key ---------- */
  group("Security");
  let orderDeleteBlocked = false;
  try { await sb(`ps_orders?order_ref=eq.${ref}`, { method: "DELETE" }); }
  catch { orderDeleteBlocked = true; }
  const stillThere = await sb(`ps_orders?order_ref=eq.${ref}&select=order_ref`);
  ok("orders cannot be deleted with the public key",
     orderDeleteBlocked || stillThere.length === 1);
  let enqDeleteBlocked = false;
  try { await sb(`ps_enquiries?name=eq.${TAG}%20Enquirer`, { method: "DELETE" }); }
  catch { enqDeleteBlocked = true; }
  const enqLeft = await sb(`ps_enquiries?name=eq.${TAG}%20Enquirer&select=id`);
  ok("enquiries cannot be deleted with the public key",
     enqDeleteBlocked || enqLeft.length === 1);
  // The club login RPC must never echo the code back to the browser.
  const probe = await rpc("ps_group_login", { p_slug: slug, p_code: "ZZCODE" });
  ok("login response never contains the access code",
     !JSON.stringify(probe).toUpperCase().includes("ZZCODE"));

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

  /* ---------- 9. Error logging ---------- */
  group("Error logging");
  const errCode = "ZZTESTERR" + RUN;
  const errRes = await fetch(`${SB_URL}/rest/v1/rpc/ps_log_error`, {
    method: "POST", headers: H,
    body: JSON.stringify({ p_error_code: errCode, p_message: "e2e test error",
      p_stack: null, p_page_url: BASE, p_context: null })
  });
  ok("ps_log_error accepts anon calls", errRes.ok, "got " + errRes.status);

  /* ---------- 10. Bug reports ---------- */
  group("Bug reports");
  const bugRes = await fetch(`${SB_URL}/rest/v1/rpc/ps_report_bug`, {
    method: "POST", headers: H,
    body: JSON.stringify({ p_reporter_name: "E2E", p_message: TAG + " test report",
      p_page_url: BASE, p_recent_errors: [] })
  });
  const bugBody = await bugRes.json();
  ok("ps_report_bug saves and returns the row", bugRes.ok && bugBody && bugBody.message === TAG + " test report");

  const emailRes = await fetch(`${BASE}/api/report-bug-email`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: TAG + " e2e email test", page_url: BASE, recent_errors: [] })
  });
  const emailBody = await emailRes.json().catch(() => ({}));
  ok("/api/report-bug-email responds ok", emailRes.status === 200, "got " + emailRes.status);
  ok("  reports sent:true", emailBody.sent === true, "got " + JSON.stringify(emailBody));

  /* ---------- 11. Square catalog + product photo (skip_square path) ---------- */
  group("Square catalog & product photo");
  const catRes = await fetch(`${BASE}/api/square-catalog`);
  const catBody = await catRes.json();
  ok("/api/square-catalog reachable", catRes.status === 200);
  ok("  returns items array", Array.isArray(catBody.items) && catBody.items.length > 0,
     "got " + JSON.stringify(catBody).slice(0, 120));

  const testPhotoId = "zztest-" + RUN.toLowerCase();
  // 1x1 red pixel JPEG, valid enough for the upload path (type/size checks only).
  const pixelB64 = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD8ooAKKACigAooAKKACigD/9k=";
  const pixelBuf = Buffer.from(pixelB64, "base64");
  const form = new FormData();
  form.append("item_id", testPhotoId);
  form.append("skip_square", "true");
  form.append("file", new Blob([pixelBuf], { type: "image/jpeg" }), "test.jpg");
  const upRes = await fetch(`${BASE}/api/product-photo`, { method: "POST", body: form });
  const upBody = await upRes.json();
  ok("photo upload succeeds", upRes.status === 200 && upBody.photo_url, "got " + JSON.stringify(upBody));
  ok("  skip_square is honoured", upBody.pushed_to_square === false);

  const getRes = await fetch(`${BASE}${upBody.photo_url}`);
  ok("uploaded photo is servable back", getRes.status === 200 && getRes.headers.get("content-type") === "image/jpeg",
     "got " + getRes.status + " " + getRes.headers.get("content-type"));

  const delRes = await fetch(`${BASE}/api/product-photo`, {
    method: "DELETE", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ item_id: testPhotoId })
  });
  const delBody = await delRes.json();
  ok("photo delete cleans up R2", delRes.status === 200 && delBody.removed === true);
  const afterDel = await fetch(`${BASE}${upBody.photo_url}`);
  ok("  photo genuinely gone after delete", afterDel.status === 404, "got " + afterDel.status);

  /* ---------- 12. Group product edit (the attr() bug regression) ---------- */
  group("Club shop item edit (regression: missing attr() helper)");
  const editSlug = TAG.toLowerCase() + "-edit";
  const [editClub] = [await sb("rpc/ps_admin_create_group", {
    method: "POST",
    body: JSON.stringify({ p_pass: ADMIN_PASS, p_name: TAG + " Edit Club", p_slug: editSlug,
      p_code: "ZZEDIT", p_kind: "club", p_intro: null, p_active: true })
  })];
  const createRes = await fetch(`${SB_URL}/rest/v1/rpc/ps_admin_create_group_product`, {
    method: "POST", headers: H,
    body: JSON.stringify({
      p_pass: ADMIN_PASS, p_group_id: editClub.id, p_name: "E2E Edit Item",
      p_description: "before", p_price: 5, p_sizes: "S", p_colours: null,
      p_image_url: null, p_sort_order: 0
    })
  });
  const created = await createRes.json();
  ok("group product created", createRes.ok && created.name === "E2E Edit Item");

  const updateRes = await fetch(`${SB_URL}/rest/v1/rpc/ps_admin_update_group_product`, {
    method: "POST", headers: H,
    body: JSON.stringify({
      p_pass: ADMIN_PASS, p_id: created.id, p_name: "E2E Edit Item",
      p_description: "after", p_price: 7.5, p_sizes: "S,M", p_colours: "Red",
      p_image_url: null
    })
  });
  const updated = await updateRes.json();
  ok("group product update RPC succeeds", updateRes.ok, "got " + updateRes.status);
  ok("  description actually changed", updated.description === "after");
  ok("  price actually changed", Number(updated.price) === 7.5);

  await sb("rpc/ps_admin_delete_group_product", { method: "POST",
    body: JSON.stringify({ p_pass: ADMIN_PASS, p_id: created.id }) });
  await sb("rpc/ps_admin_delete_group", { method: "POST",
    body: JSON.stringify({ p_pass: ADMIN_PASS, p_id: editClub.id }) });

  await cleanup();

  /* ---------- summary ---------- */
  const left = await leftovers();
  console.log("\n" + "=".repeat(52));
  console.log(`\x1b[1m${pass} passed, ${fail} failed\x1b[0m`);
  if (left.orders || left.enquiries)
    console.log(`Test rows left behind (delete-blocked by design): ` +
                `${left.orders} order(s), ${left.enquiries} enquiry(ies). See README.`);
  if (fail) { console.log("\nFailures:"); failures.forEach(f => console.log("  - " + f)); }
  process.exit(fail ? 1 : 0);
}

run().catch(async e => {
  console.error("\n\x1b[31mSuite crashed:\x1b[0m", e.message);
  await cleanup();
  process.exit(1);
});
