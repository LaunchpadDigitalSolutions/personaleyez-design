/* ============================================================
   GET /api/square-catalog
   Reads Jo's live product catalog straight from Square - no
   separate products table to keep in sync. Token stays server-side.

   Also merges in any photo we've stored for each item (see
   product-photo.js) so the admin page can show what's missing.
   Error codes: PSQ-0xx
   ============================================================ */

export async function onRequestGet(context) {
  const { env } = context;

  if (!env.SQUARE_ACCESS_TOKEN || !env.SQUARE_LOCATION_ID) {
    return json({ error: "PSQ-001: Square not configured yet" }, 503);
  }

  let catalogRes;
  try {
    catalogRes = await fetch("https://connect.squareup.com/v2/catalog/list?types=ITEM", {
      headers: {
        "Authorization": "Bearer " + env.SQUARE_ACCESS_TOKEN,
        "Square-Version": "2025-01-23"
      }
    });
  } catch {
    return json({ error: "PSQ-002: could not reach Square" }, 502);
  }

  if (!catalogRes.ok) {
    const detail = await catalogRes.text();
    console.error("PSQ-003", catalogRes.status, detail);
    return json({ error: "PSQ-003: Square rejected the catalog request" }, 502);
  }

  const data = await catalogRes.json();
  const objects = data.objects || [];

  // Flatten Square's nested item -> item_data -> variations shape into
  // something simple for the admin page to render.
  const items = objects.map(obj => {
    const d = obj.item_data || {};
    const variations = (d.variations || []).map(v => {
      const vd = v.item_variation_data || {};
      const money = vd.price_money;
      return {
        id: v.id,
        name: vd.name || null,
        price: money ? money.amount / 100 : null,
        currency: money ? money.currency : "GBP"
      };
    });
    const prices = variations.map(v => v.price).filter(p => p != null);
    return {
      id: obj.id,
      name: d.name || "Unnamed item",
      description: d.description || null,
      category_id: d.category_id || null,
      variations,
      price_from: prices.length ? Math.min(...prices) : null
    };
  });

  // Attach any photo we've already stored for each item.
  let photos = {};
  if (env.PRODUCT_IMAGES) {
    try {
      const listed = await env.PRODUCT_IMAGES.list({ prefix: "" });
      listed.objects.forEach(o => { photos[o.key] = "/api/product-photo/" + o.key; });
    } catch (e) {
      console.error("PSQ-004", e.message);
      // Non-fatal - catalog still loads, just without photo flags.
    }
  }

  const withPhotos = items.map(i => ({ ...i, photo_url: photos[i.id] || null }));

  return json({ items: withPhotos, synced_at: new Date().toISOString() });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
