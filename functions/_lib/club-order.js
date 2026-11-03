/* ============================================================
   Club shop basket pricing (club-checkout fix).
   Used by /api/club-checkout.

   Same rule as the schools shop: the browser says WHICH items and how
   many. Every price comes from ps_club_checkout_lookup (service role),
   after the club name + access code are checked server-side.

   Returns one of:
     { kind: "priced",  group, priced }   every item has a price: pay online
     { kind: "enquiry", group, description, quantity }
                                          at least one item has no price yet
   Also holds the collection / delivery rule (see DELIVERY below).
   Error codes are PCC-0xx. 010 = club name/code wrong; 011-013 =
   collection/delivery choice; 020-029 are things the customer can fix;
   030+ are server-side.
   ============================================================ */

import { OrderError, priceBasket, clean } from "./pricing.js";

const pounds = n => "£" + Number(n).toFixed(2);

/* Delivery rule (Jo, 3 Nov 2026): collection is free; delivery is £4.99
   when the items come to under £150, free at £150.00 or more. The fee
   is worked out here from database prices. The browser only says
   "collection" or "delivery" plus an address. Keep js/club-delivery.js
   (display only) in step with these numbers. */
export const DELIVERY = { feePence: 499, freeFromPence: 15000 };

/* delivery: { method: "collection" | "delivery", address?: {line1, town, postcode} }.
   Missing = collection. PCC-011 bad method, 012 address, 013 postcode. */
export function validateDelivery(d) {
  const x = d && typeof d === "object" ? d : {};
  const method = x.method == null ? "collection" : x.method;
  if (method !== "collection" && method !== "delivery") throw new OrderError("PCC-011", "Please choose collection or delivery.");
  if (method === "collection") return { method, text: null };
  const a = x.address && typeof x.address === "object" ? x.address : {};
  const line1 = clean(a.line1), town = clean(a.town);
  const code = clean(a.postcode).toUpperCase().replace(/\s+/g, "");
  if (line1.length < 3 || line1.length > 80 || town.length < 2 || town.length > 60) throw new OrderError("PCC-012", "Please enter your full delivery address.");
  if (!/^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(code)) throw new OrderError("PCC-013", "Please check your postcode.");
  const postcode = code.slice(0, -3) + " " + code.slice(-3);
  return { method, text: `${line1}, ${town}, ${postcode}` };
}

export function deliveryFeePence(method, subtotalPence) {
  return method === "delivery" && subtotalPence < DELIVERY.freeFromPence ? DELIVERY.feePence : 0;
}

/* The line that goes into the order description. The description is shown
   on the public track page and in customer emails, so it never holds the
   address: that lives in the order notes, which only Jo sees. The status
   pages and emails spot delivery orders by this line starting with
   "Delivery" after a semicolon (js/track.js, notify-status.js,
   webhooks/square.js): keep that shape.
   feePence = null means the fee isn't known yet (enquiry). */
export function deliveryLine(delivery, feePence) {
  if (delivery.method === "collection") return "Collection (free)";
  if (feePence == null) return "Delivery requested (fee to confirm)";
  return feePence ? "Delivery " + pounds(feePence / 100) : "Delivery (free, £150+)";
}

/* Service-role lookup. Never exposed to the browser. */
export function makeClubLookup(env, slug, code, fetchFn) {
  const f = fetchFn || fetch;
  return async ids => {
    let res;
    try {
      res = await f(`${env.SUPABASE_URL}/rest/v1/rpc/ps_club_checkout_lookup`, {
        method: "POST",
        headers: { "apikey": env.SUPABASE_SERVICE_ROLE_KEY, "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ p_slug: slug, p_code: code, p_ids: ids })
      });
    } catch { throw new OrderError("PCC-032", "Couldn't check prices just now. Please try again or ring us.", 502); }
    if (!res.ok) throw new OrderError("PCC-032", "Couldn't check prices just now. Please try again or ring us.", 502);
    const found = await res.json();
    if (!found || found.ok !== true) throw new OrderError("PCC-010", "That club name and code don't match. Please sign in again.", 403);
    return found;
  };
}

export function validateClub(group) {
  const g = group && typeof group === "object" ? group : {};
  const slug = clean(g.slug), code = clean(g.code);
  if (!slug || !code || slug.length > 80 || code.length > 80) throw new OrderError("PCC-010", "That club name and code don't match. Please sign in again.", 403);
  return { slug, code };
}

export async function priceClubBasket(club, rawItems, lookup) {
  let found = null;
  const capture = async ids => { found = await lookup(ids); return found; };

  try {
    const priced = await priceBasket("PCC", rawItems, capture);
    return { kind: "priced", group: found.group, priced };
  } catch (e) {
    // PCC-030 = an item has no price yet. Anything else is a real refusal.
    if (!(e instanceof OrderError) || e.code !== "PCC-030" || !found) throw e;
  }

  // Enquiry: run the same validation (ids, qty, size, colour) with the
  // unpriced rows given a stand-in price, then ignore every amount.
  const realPrice = new Map(found.items.map(r => [String(r.id).toLowerCase(), Number(r.price)]));
  const standIn = { ...found, items: found.items.map(r => (Number(r.price) > 0 ? r : { ...r, price: 0.01 })) };
  const checked = await priceBasket("PCC", rawItems, async () => standIn);
  const description = checked.lines.map(l => {
    const p = realPrice.get(String(l.product_id).toLowerCase());
    return `${l.qty} × ${l.label}` + (p > 0 ? ` @ ${pounds(p)}` : " (price to confirm)");
  }).join("; ");
  const quantity = checked.lines.reduce((s, l) => s + l.qty, 0);
  return { kind: "enquiry", group: found.group, description, quantity };
}
