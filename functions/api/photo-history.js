/* ============================================================
   /api/photo-history  (Schools tab photo history, Job 23)

   POST multipart  { pin, item_id, file }
     Saves the photo under its OWN key "<item_id>-h<timestamp>" instead of
     overwriting "<item_id>", so the photo being replaced is never lost.
     Returns { photo_url: "/api/product-photo/<key>" } (served by the
     existing GET route in product-photo/[key].js).
   POST json       { pin, item_id }
     Lists the photos kept for that item, newest first:
     { photos: [{ url, uploaded }] } (includes the original "<item_id>" key).

   Nothing here touches the existing /api/product-photo upload or delete,
   so club shop and catalog uploads behave exactly as before. Photos kept
   here are not removed by DELETE /api/product-photo (it deletes by item id
   only); a few small orphaned files in R2 are the accepted cost.
   PIN-gated against env.STAFF_PIN, like every other admin route.
   Error codes: PSQ-4xx
   ============================================================ */

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ID_OK = /^[A-Za-z0-9-]{8,64}$/;
const KEEP = 12;

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.STAFF_PIN) return json({ error: "PSQ-400: admin not configured" }, 500);
  if (!env.PRODUCT_IMAGES) return json({ error: "PSQ-401: image storage not configured" }, 503);

  const isJson = (request.headers.get("content-type") || "").includes("application/json");
  let pin, itemId, file = null;
  try {
    if (isJson) {
      const b = await request.json();
      pin = b.pin; itemId = b.item_id;
    } else {
      const form = await request.formData();
      pin = form.get("pin"); itemId = form.get("item_id"); file = form.get("file");
    }
  } catch {
    return json({ error: "PSQ-402: could not read the request" }, 400);
  }

  if (!pin || pin !== env.STAFF_PIN) return json({ error: "PSQ-409: wrong PIN" }, 401);
  if (!itemId || typeof itemId !== "string" || !ID_OK.test(itemId)) {
    return json({ error: "PSQ-403: missing or invalid item_id" }, 400);
  }

  if (isJson) return listPhotos(env, itemId);

  if (!file || typeof file === "string") return json({ error: "PSQ-404: missing file" }, 400);
  if (!ALLOWED_TYPES.includes(file.type)) return json({ error: "PSQ-405: only jpg, png or webp images allowed" }, 400);
  if (file.size > MAX_BYTES) return json({ error: "PSQ-406: image too large (5MB max)" }, 400);

  const key = itemId + "-h" + Date.now();
  try {
    await env.PRODUCT_IMAGES.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
  } catch (e) {
    console.error("PSQ-407", e.message);
    return json({ error: "PSQ-407: upload failed" }, 502);
  }
  return json({ photo_url: "/api/product-photo/" + key });
}

async function listPhotos(env, itemId) {
  try {
    const res = await env.PRODUCT_IMAGES.list({ prefix: itemId, limit: 100 });
    const photos = res.objects
      .map(o => ({ url: "/api/product-photo/" + o.key, uploaded: o.uploaded }))
      .sort((a, b) => new Date(b.uploaded) - new Date(a.uploaded))
      .slice(0, KEEP);
    return json({ photos });
  } catch (e) {
    console.error("PSQ-408", e.message);
    return json({ error: "PSQ-408: couldn't list photos" }, 502);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
