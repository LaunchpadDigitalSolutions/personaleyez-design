/* ============================================================
   GET /api/product-photo/{square_item_id}
   Streams the stored photo straight from R2 - bucket itself stays
   private, this is the only door in.
   Error codes: PSQ-2xx
   ============================================================ */

export async function onRequestGet(context) {
  const { env, params } = context;

  if (!env.PRODUCT_IMAGES) {
    return new Response("PSQ-201: image storage not configured", { status: 503 });
  }

  const object = await env.PRODUCT_IMAGES.get(params.key);
  if (!object) {
    return new Response("PSQ-202: no photo for this item", { status: 404 });
  }

  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType || "application/octet-stream",
      "Cache-Control": "public, max-age=3600"
    }
  });
}
