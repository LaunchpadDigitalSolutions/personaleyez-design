# Peach State — Personalised Design

Website and order tracker for **Peach State** (trading as Personaleyez Design Ltd
until the October 2026 rebrand), 184 York Road, Hartlepool.

## Art direction
Independent Southern boutique / editorial — cream ground, peach and terracotta
as moments of impact, sage as the quiet voice. Fraunces (display serif) over
Jost (restrained sans). Asymmetric grids, full-bleed photography, oversized
type. Deliberately **not** a card-based ecommerce template.

| Token | Value |
|---|---|
| Cream | `#FBF5EE` |
| Peach | `#F6B49A` |
| Terracotta | `#E0704B` |
| Sage | `#7E8F73` |
| Charcoal | `#2B2622` |

## Pages
| File | Purpose |
|---|---|
| `index.html` | Editorial homepage — hero, statement, full-bleed, collection, personalisation, process, collage, tracker |
| `services.html` | Embroidery, print, workwear, gifts — alternating editorial pairs |
| `schools.html` | School uniform + repayment plans |
| `track.html` | Customer order tracking (`?ref=PD-XXXXX` deep links) |
| `contact.html` | Enquiry form |
| `admin.html` | Order dashboard — create orders, move status, handle enquiries |

## Order status flow
`enquiry → in_production → ready → collected` (plus `cancelled`)

## Tables (Supabase `coiwwbroycaznkmhevde`)
`ps_orders` · `ps_enquiries`

## Error codes
`PS-1xx` orders · `PS-2xx` enquiries

## Brand switching
`js/config.js` holds name, legal name, contact details, hours and the image map.
The site already carries the Peach State identity; `legalName` stays as
Personaleyez Design Ltd for the footer until Companies House is updated.

## Before launch
- [ ] Replace ALL placeholder photography with the client's own — every image is AI-generated
- [ ] Confirm email address, opening hours, Facebook URL
- [ ] Confirm whether the rebrand is also a repositioning (boutique vs workwear emphasis)
- [ ] Lock `admin.html` behind Cloudflare Access
- [ ] Point the GoDaddy domain — CHECK MX RECORDS FIRST, client has email on it

---

## Club / team shops (Phase 2)

Jo creates these herself in `admin.html` → **Club shops**. No developer needed.

1. Enter the club name — the web name auto-fills, a code is auto-suggested
2. Add items with price, sizes and colours
3. "Copy link & code" gives her a message to paste to the club

Customers go to `clubs.html?c=<slug>`, enter the code, pick sizes and quantities,
and place an order. Orders land in `ps_orders` tagged with `group_id`/`group_slug`,
so they appear in the normal order list alongside everything else.

**Security:** access codes are never readable by the browser. `clubs.js` calls the
`ps_group_login(slug, code)` Postgres function (`security definer`), which validates
the code server-side and returns the club plus its products in one response. A wrong
code returns `{ok:false}` and nothing else.

Caveat worth knowing: the *admin* side still uses the anon key, so anyone who found
`admin.html` could read the codes. Put Cloudflare Access on `/admin*` before launch —
that's the intended protection for the whole dashboard, not just this feature.

## Editable wording (Phase 2)

`admin.html` → **Wording**. Any element marked `data-edit="key"` in the HTML can be
overridden from the database (`ps_content`, keyed by page + key). Empty value = the
hardcoded default stays. Currently wired on `index.html` and `schools.html`;
extend by adding `data-edit` attributes and a row to `EDITABLE` in `js/admin.js`.

This is deliberately *not* a full page builder — it's safe text swaps. Layout,
images and structure stay in code, so Jo can't accidentally break the design.
