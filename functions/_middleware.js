/* ============================================================
   functions/_middleware.js — site-wide maintenance gate.

   Off by default. Set env.MAINTENANCE_MODE = "true" on the Cloudflare
   Pages project (Settings -> Environment variables) to show every
   visitor the branded down page instead of the real site - useful
   while merging/testing the inline editor without risking a broken
   page in front of real customers.

   Staff bypass reuses env.STAFF_PIN (no new secret): visit any page
   with ?staff=<PIN> once and a cookie remembers it for 24h, so Jo and
   Josh can keep testing the real site while everyone else sees
   maintenance.html.
   ============================================================ */

export async function onRequest({ request, env, next }) {
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
