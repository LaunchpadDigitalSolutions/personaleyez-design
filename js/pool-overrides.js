/* ============================================================
   pool-overrides: a shared "pool" product plus per-site override
   rows. A null or blank field on the row means "follow the pool".
   Same rule as the club-shop catalog, made reusable.

   Pure functions, no DOM, no network, no globals read.
   Browser: <script src="pool-overrides.js"> then PoolOverrides.merge(...)
   Node: import "./pool-overrides.js" then globalThis.PoolOverrides
   ============================================================ */
(function (root) {
  "use strict";

  function blank(v) { return v === null || v === undefined || (typeof v === "string" && v.trim() === ""); }
  function clean(v) { return blank(v) ? null : (typeof v === "string" ? v.trim() : v); }
  function sameNum(a, b) { return !blank(a) && !blank(b) && Number(a) === Number(b); }
  function num(v) { return blank(v) ? null : Number(v); }

  /* Name shown to customers: the row's own name if it has one,
     otherwise "<colour> <pool name>" (just the pool name with no colour). */
  function displayName(pool, row) {
    if (!blank(row.name)) return String(row.name).trim();
    var base = pool && !blank(pool.name) ? String(pool.name).trim() : "";
    var colour = blank(row.colour) ? "" : String(row.colour).trim();
    return (colour ? colour + " " : "") + base;
  }

  function crestDefault(row, opts) {
    var d = opts && opts.crestDefault;
    if (typeof d === "function") return !!d(row);
    return d === undefined ? true : !!d;
  }

  /* pool: { name, description, price, sizes, image_url, needs_own_photo }
     row:  { name, colour, description, price, sizes, image_url, crest } (nulls inherit)
     opts: { crestDefault: boolean | function(row) } */
  function merge(pool, row, opts) {
    var out = Object.assign({}, row);
    var rowCrest = row.crest === null || row.crest === undefined;
    out.crest = rowCrest ? crestDefault(row, opts) : !!row.crest;
    if (!pool) { out.overrides = []; return out; }

    out.name = displayName(pool, row);
    out.description = blank(row.description) ? clean(pool.description) : row.description;
    out.price = blank(row.price) ? num(pool.price) : Number(row.price);
    out.sizes = blank(row.sizes) ? clean(pool.sizes) : row.sizes;
    out.image_url = pool.needs_own_photo
      ? clean(row.image_url)
      : (blank(row.image_url) ? clean(pool.image_url) : row.image_url);

    out.overrides = ["name", "colour", "description", "price", "sizes", "image_url"]
      .filter(function (k) { return !blank(row[k]); })
      .concat(rowCrest ? [] : ["crest"]);
    return out;
  }

  /* Turn what a person typed into the values to STORE: anything equal to
     the pool is stored as null, so later pool edits still flow through. */
  function toStored(pool, input, opts) {
    var colour = clean(input.colour);
    var stored = { colour: colour, name: null, description: null, price: null, sizes: null, image_url: null, crest: null };
    if (!pool) {
      stored.name = clean(input.name); stored.description = clean(input.description);
      stored.price = num(input.price); stored.sizes = clean(input.sizes); stored.image_url = clean(input.image_url);
      stored.crest = input.crest === undefined ? null : input.crest;
      return stored;
    }
    var composed = displayName(pool, { colour: colour });
    if (!blank(input.name) && clean(input.name) !== composed) stored.name = clean(input.name);
    if (!blank(input.price) && !sameNum(input.price, pool.price)) stored.price = Number(input.price);
    if (!blank(input.description) && clean(input.description) !== clean(pool.description)) stored.description = clean(input.description);
    if (!blank(input.sizes) && clean(input.sizes) !== clean(pool.sizes)) stored.sizes = clean(input.sizes);
    if (!blank(input.image_url) && (pool.needs_own_photo || clean(input.image_url) !== clean(pool.image_url))) stored.image_url = clean(input.image_url);
    if (input.crest !== undefined && input.crest !== null && !!input.crest !== crestDefault(input, opts)) stored.crest = !!input.crest;
    return stored;
  }

  /* True when two rows would look identical to a customer. Used to prove
     a migration changed nothing. */
  function sameRendered(a, b) {
    return String(a.name).trim() === String(b.name).trim() &&
      num(a.price) === num(b.price) &&
      clean(a.sizes) === clean(b.sizes) &&
      clean(a.image_url) === clean(b.image_url) &&
      clean(a.description) === clean(b.description);
  }

  root.PoolOverrides = { merge: merge, toStored: toStored, displayName: displayName, sameRendered: sameRendered, blank: blank };
})(typeof globalThis !== "undefined" ? globalThis : this);
