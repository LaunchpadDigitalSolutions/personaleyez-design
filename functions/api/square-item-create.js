/* ============================================================
   POST /api/square-item-create
   Body JSON: { pin, name, price, sizes: ["3-4","5-6"] }
   Creates a new item in Jo's Square catalog (one variation per
   size, all at the same price) so it shows in the Products tab,
   the till and the school tick grid. Photo is added afterwards by
   the browser through /api/product-photo.
   PIN-gated against env.STAFF_PIN, same as /api/product-photo.
   Error codes: PSN-1xx
   ============================================================ */

const SQ_VERSION = "2025-01-23";
const MAX_SIZES = 20;

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.STAFF_PIN) return json({ error: "PSN-100: admin not configured" }, 500);
  if (!env.SQUARE_ACCESS_TOKEN) return json({ error: "PSN-101: Square not configured yet" }, 503);

  let body;
  try { body = await request.json(); } catch { return json({ error: "PSN-102: expected JSON" }, 400); }

  if (!body.pin || body.pin !== env.STAFF_PIN) return json({ error: "PSN-109: wrong PIN" }, 401);

  const name = String(body.name || "").trim();
  const price = Number(body.price);
  const sizes = (Array.isArray(body.sizes) ? body.sizes : [])
    .map(s => String(s).trim()).filter(Boolean);

  if (!name || name.length > 120) return json({ error: "PSN-103: enter a name (120 characters max)" }, 400);
  if (!Number.isFinite(price) || price <= 0 || price > 1000) return json({ error: "PSN-104: enter a price in pounds, like 9.00" }, 400);
  if (sizes.length > MAX_SIZES) return json({ error: "PSN-105: too many sizes (" + MAX_SIZES + " max)" }, 400);
  if (new Set(sizes.map(s => s.toLowerCase())).size !== sizes.length) return json({ error: "PSN-106: a size is listed twice" }, 400);

  const headers = { "Authorization": "Bearer " + env.SQUARE_ACCESS_TOKEN, "Square-Version": SQ_VERSION, "Content-Type": "application/json" };

  // Refuse a name that already exists, so Jo can't create two of the same item.
  try {
    const list = await fetch("https://connect.squareup.com/v2/catalog/list?types=ITEM", { headers });
    if (!list.ok) return json({ error: "PSN-110: couldn't check your existing items" }, 502);
    const existing = ((await list.json()).objects || []).map(o => (o.item_data?.name || "").trim().toLowerCase());
    if (existing.includes(name.toLowerCase())) return json({ error: "PSN-111: you already have an item called " + name }, 409);
  } catch { return json({ error: "PSN-112: could not reach Square" }, 502); }

  const amount = Math.round(price * 100);
  const names = sizes.length ? sizes : ["Regular"];
  const upsert = {
    idempotency_key: crypto.randomUUID(),
    object: {
      type: "ITEM", id: "#item", present_at_all_locations: true,
      item_data: {
        name, product_type: "REGULAR",
        variations: names.map((n, i) => ({
          type: "ITEM_VARIATION", id: "#v" + i, present_at_all_locations: true,
          item_variation_data: {
            item_id: "#item", name: n, pricing_type: "FIXED_PRICING",
            price_money: { amount, currency: "GBP" }
          }
        }))
      }
    }
  };

  let res;
  try {
    res = await fetch("https://connect.squareup.com/v2/catalog/object", { method: "POST", headers, body: JSON.stringify(upsert) });
  } catch { return json({ error: "PSN-120: could not reach Square" }, 502); }

  if (!res.ok) {
    console.error("PSN-121", res.status, (await res.text()).slice(0, 300));
    return json({ error: "PSN-121: Square rejected the new item" }, 502);
  }

  const obj = (await res.json()).catalog_object;
  const item = {
    id: obj.id, name, category_id: null, category_name: null, photo_url: null,
    variations: (obj.item_data?.variations || []).map(v => ({
      id: v.id, name: v.item_variation_data?.name || null, price: amount / 100, currency: "GBP"
    })),
    price_from: amount / 100
  };
  return json({ item });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
