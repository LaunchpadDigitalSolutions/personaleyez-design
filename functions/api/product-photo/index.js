/* ============================================================
   POST /api/product-photo
   Body: multipart/form-data with fields "item_id" and "file".
   Stores the image in R2, keyed by the Square item id, overwriting
   any previous photo for that item (upload = replace, on purpose -
   one photo per product, no cleanup step needed).
   Error codes: PSQ-1xx
   ============================================================ */

const MAX_BYTES = 5 * 1024 * 1024; // 5MB - plenty for a product shot, keeps R2 cheap
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.PRODUCT_IMAGES) {
    return json({ error: "PSQ-101: image storage not configured" }, 503);
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "PSQ-102: expected multipart form data" }, 400);
  }

  const itemId = form.get("item_id");
  const file = form.get("file");

  if (!itemId || typeof itemId !== "string") {
    return json({ error: "PSQ-103: missing item_id" }, 400);
  }
  if (!file || typeof file === "string") {
    return json({ error: "PSQ-104: missing file" }, 400);
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return json({ error: "PSQ-105: only jpg, png or webp images allowed" }, 400);
  }
  if (file.size > MAX_BYTES) {
    return json({ error: "PSQ-106: image too large (5MB max)" }, 400);
  }

  const bytes = await file.arrayBuffer();
  try {
    await env.PRODUCT_IMAGES.put(itemId, bytes, {
      httpMetadata: { contentType: file.type }
    });
  } catch (e) {
    console.error("PSQ-107", e.message);
    return json({ error: "PSQ-107: upload failed" }, 502);
  }

  return json({ photo_url: "/api/product-photo/" + itemId });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
