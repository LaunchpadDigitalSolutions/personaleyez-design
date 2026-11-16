/* ============================================================
   functions/api/uniform-items.js
   GET /api/uniform-items?slug=SCHOOL_SLUG

   Returns the catalog items assigned to a school's uniform pool.
   Public — no admin PIN required.
   Called by /uniform/[slug] to populate the public shop page.
   Error codes: PSU-0xx
   ============================================================ */

const SB_URL = "https://coiwwbroycaznkmhevde.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvaXd3YnJveWNhem5rbWhldmRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NzIwMjksImV4cCI6MjA5OTU0ODAyOX0.r-k8RjKqouqjekvEXSMKzJykKbtgpGLMZQXcXhAmRW8";

export async function onRequestGet(context) {
  const { request } = context;
  const url  = new URL(request.url);
  const slug = url.searchParams.get("slug");

  if (!slug) {
    return json({ error: "PSU-001: slug required" }, 400);
  }

  let res;
  try {
    res = await fetch(`${SB_URL}/rest/v1/rpc/ps_get_uniform_items`, {
      method: "POST",
      headers: {
        apikey:        SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ p_slug: slug })
    });
  } catch (e) {
    console.error("PSU-002", e);
    return json({ error: "PSU-002: could not reach database" }, 502);
  }

  if (!res.ok) {
    const detail = await res.text();
    console.error("PSU-003", res.status, detail);
    return json({ error: "PSU-003: database error" }, 502);
  }

  const items = await res.json();
  return json(
    { items, slug, generated_at: new Date().toISOString() },
    200,
    { "Cache-Control": "public, max-age=60, s-maxage=120" }
  );
}

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extra }
  });
}
