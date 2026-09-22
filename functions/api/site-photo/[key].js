/* ============================================================
   Superseded by functions/api/site-photo/[page]/[key].js — slots are
   now page-scoped (GET /api/site-photo/{page}/{slot}) so the same
   slot name on two pages can't collide. This single-segment route
   is kept only so old /api/site-photo/{slot} links 404 cleanly
   instead of falling through to some other route.
   ============================================================ */

export async function onRequestGet() {
  return new Response("PS-406-3: moved - site photos are now page-scoped", { status: 404 });
}
