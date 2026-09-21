/* ============================================================
   POST /api/site-photo
   Body: multipart/form-data with fields "pin", "slot" and "file".
   Site-wide brand/editorial photos (the config.js IMG map) - same R2
   bucket as product photos, under a "site/" key prefix so the two
   never collide. PIN-gated (env.STAFF_PIN): unlike product photos,
   these are global and visible on every page, so a stray upload is
   more visible - worth the extra check.
   Error codes: PS-405
   ============================================================ */

const MAX_BYTES = 5 * 1024 * 1024; // 5MB, same ceiling as product photos
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const SLOT_RE = /^[a-z0-9_-]{1,40}$/;

export async function onRequestPost({ request, env }) {
  if (!env.STAFF_PIN) {
    return json({ error: "PS-405-1: admin not configured" }, 500);
  }
  if (!env.PRODUCT_IMAGES) {
    return json({ error: "PS-405-2: image storage not configured" }, 503);
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "PS-405-3: expected multipart form data" }, 400);
  }

  const pin = form.get("pin");
  if (!pin || pin !== env.STAFF_PIN) {
    return json({ error: "PS-405-4: wrong PIN" }, 401);
  }

  const slot = form.get("slot");
  const file = form.get("file");
  if (!slot || typeof slot !== "string" || !SLOT_RE.test(slot)) {
    return json({ error: "PS-405-5: missing or invalid slot" }, 400);
  }
  if (!file || typeof file === "string") {
    return json({ error: "PS-405-6: missing file" }, 400);
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return json({ error: "PS-405-7: only jpg, png or webp images allowed" }, 400);
  }
  if (file.size > MAX_BYTES) {
    return json({ error: "PS-405-8: image too large (5MB max)" }, 400);
  }

  const key = "site/" + slot;
  try {
    await env.PRODUCT_IMAGES.put(key, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type }
    });
  } catch (e) {
    console.error("PS-405-9", e.message);
    return json({ error: "PS-405-9: upload failed" }, 502);
  }

  return json({ photo_url: "/api/site-photo/" + slot });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
