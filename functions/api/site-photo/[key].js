/* ============================================================
   GET /api/site-photo/{slot}
   Streams a site-wide photo straight from R2 (same bucket as
   product photos, "site/" key prefix). Public - these are the
   photos on the public pages, same as the img/ folder.
   Error codes: PS-406
   ============================================================ */

export async function onRequestGet({ env, params }) {
  if (!env.PRODUCT_IMAGES) {
    return new Response("PS-406-1: image storage not configured", { status: 503 });
  }

  const object = await env.PRODUCT_IMAGES.get("site/" + params.key);
  if (!object) {
    return new Response("PS-406-2: no photo for this slot", { status: 404 });
  }

  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType || "application/octet-stream",
      "Cache-Control": "public, max-age=3600"
    }
  });
}
