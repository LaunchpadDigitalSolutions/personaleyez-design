/* ============================================================
   Server-side basket pricing (Job 15).
   Used by /api/checkout and /api/checkout-instalments.

   The browser tells us WHICH products, how many, which size/colour
   and whether initials are wanted. It never tells us a price. Every
   amount comes from ps_checkout_lookup (service role), including the
   initials add-on. Anything we can't verify is refused.

   Error codes are `${prefix}-0xx`: PSC for /api/checkout, PSI for
   /api/checkout-instalments. 020-029 are basket/customer problems
   the customer can fix; 030+ are server-side.
   ============================================================ */

import { ownUniformOptions } from "./own-uniform.js";

export const LIMITS = { maxQty: 20, maxLines: 30, name: 80, email: 120, note: 500 };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REFRESH = "Please refresh the page and add your items again.";

export class OrderError extends Error {
  constructor(code, message, status) { super(message); this.code = code; this.status = status || 400; }
}

/* Free text: no angle brackets (order emails are HTML), no control chars. */
export const clean = s => String(s == null ? "" : s).replace(/[<>]/g, "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
const list = s => String(s || "").split(",").map(x => x.trim()).filter(Boolean);
const pounds = pence => "£" + (pence / 100).toFixed(2);
const pick = (options, wanted) => options.find(o => o.toLowerCase() === String(wanted).trim().toLowerCase());

export function validateCustomer(prefix, customer, note) {
  const c = customer && typeof customer === "object" ? customer : {};
  const name = clean(c.name);
  const phone = clean(c.phone);
  const email = clean(c.email);
  const text = clean(note);
  if (!name || !phone) throw new OrderError(prefix + "-003", "Customer name and phone are required");
  if (name.length < 2 || name.length > LIMITS.name) throw new OrderError(prefix + "-021", "Please check your name.");
  const digits = phone.replace(/\D/g, "");
  if (!/^[0-9+()\s-]+$/.test(phone) || digits.length < 9 || digits.length > 15) throw new OrderError(prefix + "-022", "Please check your phone number.");
  if (email && (email.length > LIMITS.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw new OrderError(prefix + "-023", "Please check your email address.");
  if (text.length > LIMITS.note) throw new OrderError(prefix + "-024", `Please keep your note under ${LIMITS.note} characters.`);
  return { name, phone, email: email || null, note: text };
}

/* items: [{product_id, qty, size?, colour?, initials?}]. Any `price` or
   `name` the browser sends is ignored. lookup(ids) -> { items, initials_pence }. */
export async function priceBasket(prefix, rawItems, lookup) {
  const items = Array.isArray(rawItems) ? rawItems : [];
  if (items.length === 0) throw new OrderError(prefix + "-002", "Your basket is empty");
  if (items.length > LIMITS.maxLines) throw new OrderError(prefix + "-025", `Please keep orders to ${LIMITS.maxLines} lines or fewer, or ring us.`);

  for (const it of items) {
    if (!it || typeof it !== "object" || typeof it.product_id !== "string" || !UUID.test(it.product_id)) {
      throw new OrderError(prefix + "-020", REFRESH);
    }
    if (!Number.isInteger(it.qty) || it.qty < 1 || it.qty > LIMITS.maxQty) {
      throw new OrderError(prefix + "-026", `Quantity must be a whole number from 1 to ${LIMITS.maxQty} per item. For bigger orders please ring us.`);
    }
  }

  const ids = [...new Set(items.map(i => i.product_id.toLowerCase()))];
  const found = await lookup(ids);
  const rows = new Map((found.items || []).map(r => [String(r.id).toLowerCase(), r]));
  const initialsPence = Number(found.initials_pence);

  const lines = [];
  let totalPence = 0;
  for (const it of items) {
    const row = rows.get(it.product_id.toLowerCase());
    if (!row || row.active !== true) throw new OrderError(prefix + "-027", "Sorry, an item in your basket isn't available any more. Please refresh and choose again.");
    const price = Number(row.price);
    if (!Number.isFinite(price) || price <= 0 || !row.name) throw new OrderError(prefix + "-030", "That item can't be ordered online yet. Please ring us.", 409);

    const opts = [];
    const sizes = list(row.sizes), colours = list(row.colours);
    if (sizes.length) {
      const s = pick(sizes, it.size == null ? "" : it.size);
      if (!s) throw new OrderError(prefix + "-028", `Please choose a size for ${row.name}.`);
      opts.push(s);
    } else if (clean(it.size)) throw new OrderError(prefix + "-028", REFRESH);
    if (colours.length) {
      const c = pick(colours, it.colour == null ? "" : it.colour);
      if (!c) throw new OrderError(prefix + "-028", `Please choose a colour for ${row.name}.`);
      opts.push(c);
    } else if (clean(it.colour)) throw new OrderError(prefix + "-028", REFRESH);

for (const o of ownUniformOptions(it, row, (c, m) => { throw new OrderError(prefix + "-" + c, m); })) opts.push(o);
        let unitPence = Math.round(price * 100);
    const crested = row.is_school_item === true && row.crest === true;
    if (crested) opts.push("logo embroidered");
    if (it.initials === true) {
      if (!crested) throw new OrderError(prefix + "-029", "Initials can't be added to that item.");
      if (!Number.isInteger(initialsPence) || initialsPence <= 0) throw new OrderError(prefix + "-031", "Initials can't be priced right now. Please ring us.", 503);
      unitPence += initialsPence;
      opts.push("initials stitched on");
    }

    const label = `${row.name} (${opts.join(", ")})`.replace(" ()", "");
    const linePence = unitPence * it.qty;
    totalPence += linePence;
    lines.push({ product_id: row.id, label, qty: it.qty, unitPence, linePence });
  }

  const description = lines.map(l => `${l.qty} × ${l.label} @ ${pounds(l.unitPence)} = ${pounds(l.linePence)}`).join("; ");
  const squareName = lines.length === 1 ? lines[0].label.slice(0, 120) : `Peach State order (${lines.length} items)`;
  return { totalPence, lines, description, squareName };
}

/* Service-role lookup. Never exposed to the browser. */
export function makeLookup(prefix, env, fetchFn) {
  const f = fetchFn || fetch;
  return async ids => {
    let res;
    try {
      res = await f(`${env.SUPABASE_URL}/rest/v1/rpc/ps_checkout_lookup`, {
        method: "POST",
        headers: { "apikey": env.SUPABASE_SERVICE_ROLE_KEY, "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ p_ids: ids })
      });
    } catch { throw new OrderError(prefix + "-032", "Couldn't check prices just now. Please try again or ring us.", 502); }
    if (!res.ok) throw new OrderError(prefix + "-032", "Couldn't check prices just now. Please try again or ring us.", 502);
    return res.json();
  };
}
