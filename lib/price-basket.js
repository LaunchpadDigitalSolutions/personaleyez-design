/* ============================================================
   lib/price-basket.js - server-side pricing for /api/checkout and
   /api/checkout-instalments. The browser says WHAT it wants
   (product_id, qty, size, colour, initials yes/no); this module
   decides what it COSTS. A price or name sent by the browser is
   never read.

   Prices come from the ps_checkout_price_items RPC
   (supabase/job15-checkout-pricing.sql), which merges pool and
   per-school overrides exactly like the storefront does.

   Error codes are `${prefix}-0NN`: prefix PSC (checkout) or PSI
   (instalments). Codes with refresh:true mean "stale basket".
   ============================================================ */

export const INITIALS_PENCE = 200;   // initials stitched on, per garment. The ONLY place this amount lives on the server.
export const MAX_QTY = 20;
export const MAX_LINES = 30;
export const MAX_NAME = 100;
export const MAX_NOTE = 500;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STALE = "Your basket is out of date. Please refresh the page and add your items again.";

export class PriceError extends Error {
  constructor(code, message, status = 400, refresh = false) {
    super(message);
    this.code = code; this.status = status; this.refresh = refresh;
  }
}

/* Strip control characters and angle brackets, collapse whitespace. */
export const clean = s => String(s ?? "").replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim();
const list = s => String(s || "").split(",").map(x => x.trim()).filter(Boolean);
const gbp = pence => "£" + (pence / 100).toFixed(2);

export function cleanCustomer(customer, note, prefix) {
  const c = customer && typeof customer === "object" ? customer : {};
  const name = clean(c.name), phone = clean(c.phone), email = clean(c.email), n = clean(note);
  if (!name || !phone) throw new PriceError(`${prefix}-003`, "Customer name and phone are required");
  if (name.length > MAX_NAME) throw new PriceError(`${prefix}-015`, "That name is too long");
  if (!/^[0-9+()\s-]{7,20}$/.test(phone)) throw new PriceError(`${prefix}-015`, "That phone number doesn't look right");
  if (email && (email.length > 254 || !/^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/.test(email))) throw new PriceError(`${prefix}-015`, "That email address doesn't look right");
  if (n.length > MAX_NOTE) throw new PriceError(`${prefix}-016`, "That note is too long");
  return { name, phone, email: email || null, note: n };
}

async function lookup(ids, env, prefix, fetchFn) {
  let res;
  try {
    res = await fetchFn(`${env.SUPABASE_URL}/rest/v1/rpc/ps_checkout_price_items`, {
      method: "POST",
      headers: { "apikey": env.SUPABASE_SERVICE_ROLE_KEY, "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_ids: ids })
    });
  } catch { throw new PriceError(`${prefix}-017`, "We couldn't check prices just now. Please try again.", 503); }
  if (!res.ok) throw new PriceError(`${prefix}-017`, "We couldn't check prices just now. Please try again.", 503);
  const rows = await res.json();
  return new Map((Array.isArray(rows) ? rows : []).map(r => [String(r.id).toLowerCase(), r]));
}

/* items: raw array from the request. Returns { lines, totalPence, description, squareName }. */
export async function priceBasket(items, env, prefix, fetchFn = fetch) {
  if (!Array.isArray(items) || items.length === 0) throw new PriceError(`${prefix}-002`, "Basket is empty");
  if (items.length > MAX_LINES) throw new PriceError(`${prefix}-016`, "That's too many items in one order. Please ring us.");

  for (const it of items) {
    if (!it || typeof it !== "object" || typeof it.product_id !== "string" || !UUID.test(it.product_id)) {
      throw new PriceError(`${prefix}-010`, STALE, 400, true);
    }
    if (typeof it.qty !== "number" || !Number.isInteger(it.qty) || it.qty < 1 || it.qty > MAX_QTY) {
      throw new PriceError(`${prefix}-012`, `Quantity must be a whole number from 1 to ${MAX_QTY}.`);
    }
  }

  const rows = await lookup([...new Set(items.map(i => i.product_id.toLowerCase()))], env, prefix, fetchFn);

  const lines = items.map(it => {
    const row = rows.get(it.product_id.toLowerCase());
    const base = row ? Math.round(Number(row.price) * 100) : NaN;
    if (!row || row.active !== true || !Number.isFinite(base) || base <= 0) {
      throw new PriceError(`${prefix}-011`, "One of the items in your basket is no longer available. Please refresh and choose again.", 400, true);
    }
    const opts = [];
    const sizes = list(row.sizes), colours = list(row.colours);
    if (sizes.length) {
      if (!sizes.includes(it.size)) throw new PriceError(`${prefix}-013`, "Please choose a size.");
      opts.push(it.size);
    }
    if (colours.length) {
      if (!colours.includes(it.colour)) throw new PriceError(`${prefix}-013`, "Please choose a colour.");
      opts.push(it.colour);
    }
    let unit = base;
    if (row.is_school_item === true && row.crest === true) opts.push("logo embroidered");
    if (it.initials === true) {
      if (!(row.is_school_item === true && row.crest === true)) throw new PriceError(`${prefix}-014`, "Initials can't be added to that item.");
      unit += INITIALS_PENCE;
      opts.push(`initials +${gbp(INITIALS_PENCE)}`);
    }
    const name = clean(row.name) + (opts.length ? ` (${opts.join(", ")})` : "");
    return { product_id: row.id, name, qty: it.qty, unitPence: unit, linePence: unit * it.qty };
  });

  const totalPence = lines.reduce((s, l) => s + l.linePence, 0);
  if (!Number.isSafeInteger(totalPence) || totalPence <= 0) throw new PriceError(`${prefix}-011`, STALE, 400, true);

  return {
    lines, totalPence,
    description: lines.map(l => `${l.qty} x ${l.name} @ ${gbp(l.unitPence)} = ${gbp(l.linePence)}`).join("; "),
    squareName: lines.length === 1 ? (lines[0].qty > 1 ? `${lines[0].qty} x ${lines[0].name}` : lines[0].name) : `Peach State order (${lines.length} items)`
  };
}

export function priceErrorResponse(e) {
  return new Response(JSON.stringify({ error: e.code, message: e.message, refresh: e.refresh || undefined }), {
    status: e.status || 400, headers: { "Content-Type": "application/json" }
  });
}
