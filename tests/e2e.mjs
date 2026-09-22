#!/usr/bin/env node
/* ============================================================
   Peach State — end-to-end test suite
   Runs against the LIVE deployment and the LIVE Supabase project.

     node tests/e2e.mjs
     node tests/e2e.mjs --base=https://peach-state.pages.dev --pin=1234

   --pin (or STAFF_PIN env var) is Jo's real admin PIN — needed to
   exercise the actual /api/admin and /api/product-photo gates the
   way the browser does. Without it, those specific checks fail
   loudly (401/PS-ADMIN-AUTH) instead of being silently skipped.

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
// Matches env.ADMIN_PASSPHRASE (Cloudflare Pages) / the literal ps_admin_check()
// checks in Postgres - needed to call the passphrase-gated ps_admin_* RPCs
// directly, the same way functions/api/admin.js does on the real admin page.
// It's never shipped to the browser, so this constant has to be updated by hand
// whenever the passphrase is rotated - nothing keeps it in sync automatically.
const ADMIN_PASS = "6j3OsYnkzwcIXKqYbwZnEC9w3aw20Mty";
// Jo's real staff PIN — only used by the two test groups below that go
// through the actual PIN-gated endpoints (/api/admin, /api/product-photo)
// instead of calling Supabase directly, so those checks test the real gate.
const PIN = args.pin || process.env.STAFF_PIN;

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
// Goes through the real staff-facing gate (functions/api/admin.js) instead of
// calling Supabase directly — same PIN + RPC allowlist the admin page uses.
const adminCall = (rpcName, params) =>
  fetch(`${BASE}/api/admin`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin: PIN, rpc: rpcName, params })
  }).then(r => r.json());

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
  // Same RLS lockdown as the Orders/Enquiries groups - no anon SELECT any
  // more, so this has to go through the admin list RPCs and filter client-side.
  const orders = await rpc("ps_admin_list_orders", { p_pass: ADMIN_PASS, p_limit: 500 });
  const enquiries = await rpc("ps_admin_list_enquiries", { p_pass: ADMIN_PASS, p_limit: 500 });
  const o = (orders || []).filter(x => x.customer_name && x.customer_name.startsWith("ZZTEST"));
  const e = (enquiries || []).filter(x => x.name && x.name.startsWith("ZZTEST"));
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
  for (const a of ["css/style.css", "css/inline-edit.css", "js/config.js", "js/api.js", "js/partials.js",
                   "js/admin.js", "js/inline-edit.js", "js/track.js", "js/clubs.js",
                   "img/logo.png", "img/mark-only.png", "img/wordmark.png", "img/icon-180.png"]) {
    const r = await fetch(`${BASE}/${a}`);
    ok(`GET /${a}`, r.status === 200, "got " + r.status);
  }

  /* ---------- 3. Cache-busting present ---------- */
  group("Cache busting");
  const idx = await fetch(BASE + "/").then(r => r.text());
  ok("CSS is version-stamped", /style\.css\?v=[\d.]+/.test(idx));
  ok("JS is version-stamped", /config\.js\?v=[\d.]+/.test(idx));

  /* ---------- 4. Orders: create → advance → read ----------
     ps_orders has RLS enabled with NO anon policies at all now (a later,
     separate security fix) - anon can't even SELECT it directly any more,
     let alone INSERT/UPDATE. Every step below goes through the same RPCs
     the real app uses: ps_create_order (public), ps_track_order (public),
     ps_admin_update_order_status (PIN-gated). */
  group("Orders");
  const order = await rpc("ps_create_order", {
    p_customer_name: TAG + " Customer", p_customer_phone: "07700900000", p_customer_email: null,
    p_category: "workwear", p_description: "E2E order", p_quantity: 2, p_quoted_total: 40
  });
  const ref = order && order.order_ref;
  ok("order created", !!order && /^PD-/.test(ref || ""), "got " + JSON.stringify(order));
  ok("  starts as enquiry", order && order.status === "enquiry");

  for (const s of ["in_production", "ready", "collected"]) {
    const updated = await rpc("ps_admin_update_order_status", { p_pass: ADMIN_PASS, p_id: order.id, p_status: s });
    ok(`status → ${s}`, updated && updated.status === s, "got " + JSON.stringify(updated));
  }

  const found = await rpc("ps_track_order", { p_ref: ref });
  ok("order retrievable by reference", !!found && found.order_ref === ref);
  const none = await rpc("ps_track_order", { p_ref: "PD-NOPE1" });
  ok("unknown reference returns nothing", none === null, "got " + JSON.stringify(none));

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
  await rpc("ps_create_enquiry", {
    p_name: TAG + " Enquirer", p_category: "workwear", p_message: "E2E", p_phone: "07700900000", p_email: null
  });
  const enqAfterCreate = await rpc("ps_admin_list_enquiries", { p_pass: ADMIN_PASS, p_limit: 500 });
  const enq = (enqAfterCreate || []).filter(e => e.name === TAG + " Enquirer");
  ok("enquiry saved", enq.length === 1, "found " + enq.length);
  ok("  defaults to unhandled", enq.length > 0 && enq[0].handled === false);

  /* ---------- 7. Editable content ----------
     ps_content writes are PIN-gated too now (see PS-403 in README) - the old
     direct anon upsert this test used to exercise no longer works, by design. */
  group("Content editor");
  const key = "zztest_" + RUN.toLowerCase();
  const put = v => rpc("ps_admin_save_content", { p_pass: ADMIN_PASS, p_page: "index", p_ckey: key, p_value: v });
  await put("first");
  const second = await put("second");
  ok("content upserts rather than duplicating", second && second.value === "second", "got " + JSON.stringify(second));
  const rows = await sb(`ps_content?ckey=eq.${key}&select=*`);
  ok("  only one row per page+key", rows.length === 1);

  /* ---------- 7b. Deletion must be impossible with the public key ---------- */
  group("Security");
  let orderDeleteBlocked = false;
  try { await sb(`ps_orders?order_ref=eq.${ref}`, { method: "DELETE" }); }
  catch { orderDeleteBlocked = true; }
  const stillThere = await rpc("ps_track_order", { p_ref: ref });
  ok("orders cannot be deleted with the public key",
     orderDeleteBlocked || !!stillThere);
  let enqDeleteBlocked = false;
  try { await sb(`ps_enquiries?name=eq.${TAG}%20Enquirer`, { method: "DELETE" }); }
  catch { enqDeleteBlocked = true; }
  const enqAfterDelete = await rpc("ps_admin_list_enquiries", { p_pass: ADMIN_PASS, p_limit: 500 });
  const enqLeft = (enqAfterDelete || []).filter(e => e.name === TAG + " Enquirer");
  ok("enquiries cannot be deleted with the public key",
     enqDeleteBlocked || enqLeft.length === 1);
  // The club login RPC must never echo the code back to the browser.
  const probe = await rpc("ps_group_login", { p_slug: slug, p_code: "ZZCODE" });
  ok("login response never contains the access code",
     !JSON.stringify(probe).toUpperCase().includes("ZZCODE"));

  /* ---------- 8. Schema guarantees ----------
     ps_create_order always sets status='enquiry' itself (not caller-supplied),
     so the real place a bad status could get in is the admin status-update
     RPC - that's what ps_orders_status_check actually guards. */
  group("Schema");
  let badStatus = false;
  try {
    await sb("rpc/ps_admin_update_order_status", { method: "POST",
      body: JSON.stringify({ p_pass: ADMIN_PASS, p_id: order.id, p_status: "nonsense" }) });
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

  /* ---------- 11. Square catalog + product photo (real PIN gate) ---------- */
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
  form.append("pin", PIN || "");
  form.append("item_id", testPhotoId);
  form.append("skip_square", "true");
  form.append("file", new Blob([pixelBuf], { type: "image/jpeg" }), "test.jpg");
  const upRes = await fetch(`${BASE}/api/product-photo`, { method: "POST", body: form });
  const upBody = await upRes.json();
  ok("photo upload succeeds", upRes.status === 200 && upBody.photo_url,
     (PIN ? "got " : "no --pin/STAFF_PIN set — ") + JSON.stringify(upBody));

  // Everything below needs a real photo_url from the upload above (e.g. no
  // PIN was supplied, or R2 isn't bound on this environment) - skip cleanly
  // instead of building a fetch URL out of `undefined` and crashing the suite.
  if (upBody.photo_url) {
    ok("  skip_square is honoured", upBody.pushed_to_square === false);

    const getRes = await fetch(`${BASE}${upBody.photo_url}`);
    ok("uploaded photo is servable back", getRes.status === 200 && getRes.headers.get("content-type") === "image/jpeg",
       "got " + getRes.status + " " + getRes.headers.get("content-type"));

    const delRes = await fetch(`${BASE}/api/product-photo`, {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: PIN, item_id: testPhotoId })
    });
    const delBody = await delRes.json();
    ok("photo delete cleans up R2", delRes.status === 200 && delBody.removed === true);
    const afterDel = await fetch(`${BASE}${upBody.photo_url}`);
    ok("  photo genuinely gone after delete", afterDel.status === 404, "got " + afterDel.status);
  } else {
    ok("  skip_square is honoured", false, "skipped - no photo_url from a failed upload");
    ok("uploaded photo is servable back", false, "skipped - no photo_url from a failed upload");
    ok("photo delete cleans up R2", false, "skipped - no photo_url from a failed upload");
    ok("  photo genuinely gone after delete", false, "skipped - no photo_url from a failed upload");
  }

  /* ---------- 11b. Inline content editor (real PIN gate) ----------
     This used to call ps_admin_save_content straight against Supabase with
     ADMIN_PASS, which meant it verified the database function but never
     exercised functions/api/admin.js itself — the actual gate the browser's
     admin page and Jo's PIN go through. Now it goes through /api/admin. */
  group("Content editing (inline editor)");
  const contentKey = "zztest_field_" + RUN.toLowerCase();
  const saved = await adminCall("ps_admin_save_content",
    { p_page: "zztest", p_ckey: contentKey, p_value: "hello from e2e" });
  ok("ps_admin_save_content saves a row via the real /api/admin gate",
     saved && saved.value === "hello from e2e",
     (PIN ? "got " : "no --pin/STAFF_PIN set — ") + JSON.stringify(saved));

  const [readBack] = await sb(`ps_content?page=eq.zztest&ckey=eq.${contentKey}&select=value`);
  ok("saved value reads back over the public API", readBack && readBack.value === "hello from e2e");

  const wrongPinRes = await fetch(`${BASE}/api/admin`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin: PIN + "-wrong", rpc: "ps_admin_save_content",
      params: { p_page: "zztest", p_ckey: contentKey, p_value: "nope" } })
  });
  ok("wrong PIN is rejected", wrongPinRes.status === 401, "got " + wrongPinRes.status);

  // The whole point of PS-403: a bare anon POST (the old way) must now be
  // refused by RLS - only the PIN-gated RPC above may write this table.
  let contentWriteBlocked = false;
  try {
    await sb("ps_content?on_conflict=page,ckey", {
      method: "POST", headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ page: "zztest", ckey: contentKey, value: "direct write should fail" })
    });
  } catch (e) { contentWriteBlocked = true; }
  ok("direct anon write to ps_content is blocked", contentWriteBlocked,
     "a raw POST succeeded - RLS lockdown isn't applied");

  const noPinRes = await fetch(`${BASE}/api/site-photo`, { method: "POST", body: new FormData() });
  ok("/api/site-photo refuses an unauthenticated upload", noPinRes.status === 401 || noPinRes.status === 400,
     "got " + noPinRes.status);

  const missingPhotoRes = await fetch(`${BASE}/api/site-photo/zztest-no-such-slot`);
  ok("/api/site-photo/<slot> 404s for an unknown slot", missingPhotoRes.status === 404,
     "got " + missingPhotoRes.status);

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
  if (!PIN)
    console.log("Note: no --pin/STAFF_PIN set — the product-photo and content-editor PIN checks above were expected to fail.");
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
