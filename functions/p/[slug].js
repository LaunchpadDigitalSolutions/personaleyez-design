/* ============================================================
   GET /p/<name>
   Serves pages made in the admin (Edit site > New page).

   Looks the page up in ps_pages (visitors can only ever see live
   ones - removed pages are hidden by the database itself), then
   serves page-shell.html with the title, description, sharing
   preview, canonical address and page key filled in on the server.
   Unknown or removed pages get a real 404, not an empty page.
   The page's body text, photos and added sections are loaded in
   the browser by js/page-shell.js, the same way as the built-in pages.
   Error codes: PS-52x
   ============================================================ */

const SB_URL = "https://coiwwbroycaznkmhevde.supabase.co";
// The public (anon) key - same one shipped in js/config.js. RLS limits
// it to live pages only.
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvaXd3YnJveWNhem5rbWhldmRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NzIwMjksImV4cCI6MjA5OTU0ODAyOX0.r-k8RjKqouqjekvEXSMKzJykKbtgpGLMZQXcXhAmRW8";
const SITE = "https://peachstate.co.uk";
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export async function onRequestGet({ request, env, params }) {
  const slug = String(params.slug || "").toLowerCase();
  if (slug.length > 36 || !SLUG_RE.test(slug)) return notFound();

  let page = null;
  try {
    const res = await fetch(
      SB_URL + "/rest/v1/ps_pages?select=slug,title&published=eq.true&limit=1&slug=eq." + encodeURIComponent(slug),
      { headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY } }
    );
    if (!res.ok) { console.error("PS-520", res.status); return unavailable(); }
    const rows = await res.json();
    page = rows[0] || null;
  } catch (e) {
    console.error("PS-521", e.message);
    return unavailable();
  }
  if (!page) return notFound();

  const shell = await fetchShell(env, request);
  if (!shell) { console.error("PS-522: page-shell.html not found"); return unavailable(); }

  const fullTitle = page.title + " — Peach State, Hartlepool";
  const desc = page.title + " — Peach State, Hartlepool. Personalised embroidery and print, made by hand at 184 York Road.";
  const url = SITE + "/p/" + page.slug;
  const setContent = v => ({ element(e) { e.setAttribute("content", v); } });

  const out = new HTMLRewriter()
    .on("title", { element(e) { e.setInnerContent(fullTitle); } })
    .on('meta[name="description"]', setContent(desc))
    .on('meta[property="og:title"]', setContent(fullTitle))
    .on('meta[property="og:description"]', setContent(desc))
    .on('meta[property="og:url"]', setContent(url))
    .on('meta[name="twitter:title"]', setContent(fullTitle))
    .on('meta[name="twitter:description"]', setContent(desc))
    .on('link[rel="canonical"]', { element(e) { e.setAttribute("href", url); } })
    .on('meta[name="robots"]', { element(e) { e.remove(); } })
    .on("body", { element(e) { e.setAttribute("data-page", "p-" + page.slug); } })
    .on("#pg-title", { element(e) { e.setInnerContent(page.title); } })
    .transform(new Response(shell.body, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" }
    }));

  const headers = new Headers(out.headers);
  headers.set("Cache-Control", "public, max-age=60");
  return new Response(out.body, { status: 200, headers });
}

// Cloudflare's pretty-URL handling may answer /page-shell.html with a
// redirect, so follow up to two.
async function fetchShell(env, request) {
  let u = new URL("/page-shell.html", request.url);
  for (let i = 0; i < 3; i++) {
    const res = await env.ASSETS.fetch(new Request(u.toString(), { method: "GET" }));
    const loc = res.headers.get("Location");
    if (res.status >= 300 && res.status < 400 && loc) { u = new URL(loc, u); continue; }
    return res.ok ? res : null;
  }
  return null;
}

function simplePage(status, heading, text) {
  const html = `<!DOCTYPE html><html lang="en-GB"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>${heading} — Peach State</title></head>
<body style="margin:0;background:#FBF5EE;color:#2B2522;font-family:Jost,system-ui,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px">
<div><h1 style="font-family:Fraunces,Georgia,serif;font-weight:400;font-size:34px;margin:0 0 12px">${heading}</h1>
<p style="margin:0 0 26px;opacity:.75">${text}</p>
<a href="/" style="color:#C45530;font-size:16px">Back to the home page &rarr;</a></div></body></html>`;
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }
  });
}
const notFound = () => simplePage(404, "Page not found", "That page doesn't exist, or it has been taken down.");
const unavailable = () => simplePage(503, "Back in a moment", "We couldn't load this page just now. Please try again.");
