/* ============================================================
   POST /api/product-photo
   Body: multipart/form-data with fields "item_id" and "file".
   Stores the image in R2 (keyed by Square item id, so our admin page
   and shop.html can show it instantly), then pushes the same photo
   into Square's own catalog attached to that item - so it shows up
   in Jo's Square app, POS and online store too, not just our site.
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

  // Best-effort push to Square. If this fails, the photo is still
  // live on our own site (from R2 above) - we just note it didn't
  // reach Square this time, rather than failing the whole upload.
  let pushedToSquare = false;
  let squareWarning = null;
  if (env.SQUARE_ACCESS_TOKEN) {
    try {
      pushedToSquare = await pushImageToSquare(env.SQUARE_ACCESS_TOKEN, itemId, bytes, file.type);
    } catch (e) {
      console.error("PSQ-108", e.message);
      squareWarning = "PSQ-108: saved here, but didn't reach Square (" + e.message + ")";
    }
  }

  return json({
    photo_url: "/api/product-photo/" + itemId,
    pushed_to_square: pushedToSquare,
    square_warning: squareWarning
  });
}

async function pushImageToSquare(token, itemId, bytes, contentType) {
  const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  const sqForm = new FormData();
  sqForm.append("request", JSON.stringify({
    idempotency_key: crypto.randomUUID(),
    object_id: itemId,
    is_primary: true,
    image: { type: "IMAGE", id: "#photo", image_data: {} }
  }));
  sqForm.append("file", new Blob([bytes], { type: contentType }), "photo." + ext);

  const res = await fetch("https://connect.squareup.com/v2/catalog/images", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + token,
      "Square-Version": "2025-01-23"
    },
    body: sqForm
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error("Square " + res.status + ": " + detail.slice(0, 200));
  }
  return true;
}

/* ============================================================
   DELETE /api/product-photo
   Body: JSON { item_id }
   Removes our own R2 copy AND any image objects Square has
   attached to that item, so a test/wrong photo doesn't linger in
   Jo's Square media library after the fact.
   Error codes: PSQ-3xx
   ============================================================ */

export async function onRequestDelete(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "PSQ-301: expected JSON body" }, 400);
  }
  const itemId = body.item_id;
  if (!itemId) return json({ error: "PSQ-302: missing item_id" }, 400);

  if (env.PRODUCT_IMAGES) {
    try { await env.PRODUCT_IMAGES.delete(itemId); }
    catch (e) { console.error("PSQ-303", e.message); }
  }

  let removedFromSquare = false;
  let squareWarning = null;
  if (env.SQUARE_ACCESS_TOKEN) {
    try {
      removedFromSquare = await removeImagesFromSquare(env.SQUARE_ACCESS_TOKEN, itemId);
    } catch (e) {
      console.error("PSQ-304", e.message);
      squareWarning = "PSQ-304: removed here, but couldn't clean up Square (" + e.message + ")";
    }
  }

  return json({ removed: true, removed_from_square: removedFromSquare, square_warning: squareWarning });
}

async function removeImagesFromSquare(token, itemId) {
  const getRes = await fetch(
    "https://connect.squareup.com/v2/catalog/object/" + itemId + "?include_related_objects=true",
    { headers: { "Authorization": "Bearer " + token, "Square-Version": "2025-01-23" } }
  );
  if (!getRes.ok) throw new Error("lookup failed " + getRes.status);
  const data = await getRes.json();
  const imageIds = data.object?.item_data?.image_ids || [];
  if (!imageIds.length) return true; // nothing attached - nothing to do

  for (const imageId of imageIds) {
    const delRes = await fetch("https://connect.squareup.com/v2/catalog/object/" + imageId, {
      method: "DELETE",
      headers: { "Authorization": "Bearer " + token, "Square-Version": "2025-01-23" }
    });
    if (!delRes.ok) throw new Error("delete " + imageId + " failed " + delRes.status);
  }
  return true;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
