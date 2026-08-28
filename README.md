# Personaleyez Design — website

Site and order tracker for Personaleyez Design Ltd, 184 York Road, Hartlepool.
Rebrands to **Peach State** in October 2026.

## Rebrand in one file
Everything brand-specific lives in `js/config.js` — name, legal name, phone,
address, hours, logo flag. Change `BRAND.name` and `BRAND.legalName` in October
and the whole site follows. Drop a logo at `img/logo.png` and set `hasLogo: true`.

## Pages
| File | Purpose |
|---|---|
| `index.html` | Home |
| `services.html` | Embroidery, print, workwear, personalised |
| `schools.html` | School uniform + repayment plans |
| `track.html` | Customer order tracking (`?ref=PD-XXXXX` deep links) |
| `contact.html` | Enquiry form |
| `admin.html` | Jo's order dashboard — create orders, move status, handle enquiries |

## Order status flow
`enquiry → in_production → ready → collected` (plus `cancelled`)

## Tables (Supabase `coiwwbroycaznkmhevde`)
- `ps_orders` — orders, reference, status, quote, deposit, due date
- `ps_enquiries` — website contact form

## Error codes
`PS-1xx` orders · `PS-2xx` enquiries

## Standards
Mobile-first from 375px · 44px+ touch targets · 16px inputs · health check
before render · version stamp Ctrl+Shift+V · palette and fonts per the
`launchpad-ui-design` skill (Retail & E-commerce).

## Outstanding
- Confirm email address, opening hours and Facebook URL with the client
- Replace AI placeholder photography with real shop and product photos
- Real logo into `img/logo.png`
- Accent colour is the skill's retail indigo — re-tint to the Peach State palette at rebrand
- Lock `admin.html` behind Cloudflare Access before it goes live
- Point the GoDaddy domain once confirmed (check MX records first — client has email on it)
