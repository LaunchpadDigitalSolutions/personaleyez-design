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
`PS-1xx` orders · `PS-2xx` enquiries · `PS-4xx` editable content · `PS-405`/`PS-406` site photos

## Brand switching
`js/config.js` holds name, legal name, contact details, hours and the image map.
The site already carries the Peach State identity; `legalName` stays as
Personaleyez Design Ltd for the footer until Companies House is updated.

## Admin access

`admin.html` sits behind a PIN. Unlike the original version of this page,
the PIN is no longer compared to anything sitting in the browser: entering
it calls `functions/api/admin.js`, which checks it against `env.STAFF_PIN`
(a Cloudflare Pages environment variable) and, if correct, is the only thing
allowed to pass the real database passphrase (`env.ADMIN_PASSPHRASE`,
likewise an environment variable, never in source) on to the `ps_admin_*`
functions. Neither secret is ever shipped to the browser. It unlocks for the
browser session and there's a padlock button in the bar to lock it again.

Set both `STAFF_PIN` and `ADMIN_PASSPHRASE` in the Cloudflare Pages project's
environment variables before this is live for real — the app will 500 on
every admin action until they're set.

## Before launch
- [ ] Replace ALL placeholder photography with the client's own — every image is AI-generated
- [ ] Confirm email address, opening hours, Facebook URL
- [ ] Confirm whether the rebrand is also a repositioning (boutique vs workwear emphasis)
- [x] Revoke anon SELECT on `ps_groups` / `ps_group_products` — already done at the database level
- [x] Move admin writes behind `security definer` functions that check a server-side
      passphrase — already done; the passphrase itself was the remaining gap (see above), now fixed
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

The admin side (viewing/editing club codes and products) now goes through the
same `functions/api/admin.js` proxy as everything else in the dashboard, so
finding `admin.html` no longer means finding the codes.

## Inline editing (Phase 3)

Jo edits the real pages, not a form. Every public page carries a small "Edit
this page" pill (bottom-right) behind the same PIN as `admin.html`. Toggle it
on and any element marked `data-edit="key"` becomes click-to-edit in place;
any `data-img="slot"` photo becomes click-to-replace in place. Both save
immediately, live, no redeploy.

- **Text** — `js/inline-edit.js` + `ps_content` (keyed by page + key), same
  table the old Wording tab used. Writes go through the PIN-gated
  `ps_admin_save_content` RPC (see `functions/api/admin.js`), not a direct
  anon write.
- **Photos** — the same `ps_content` table, under the sentinel page
  `"global"`, key `img_<slot>` (a photo used across several pages isn't
  "owned" by any one of them). Uploads go to `POST /api/site-photo`
  (PIN-checked, same R2 bucket as product photos, `site/` key prefix), which
  hands back the URL that gets saved as the content value.
- Extend either by adding a `data-edit`/`data-img` attribute to the HTML —
  no JS or admin.js changes needed, the editor discovers them from the DOM.

Still deliberately *not* a full page builder: layout and structure stay in
code, so Jo can't accidentally break the design — only text and photos move.

Legal pages (`privacy.html`, `terms.html`, `refund.html`, `cookies.html`) and
the logo/wordmark are intentionally left out of this — Josh's call to change.

**One-time setup still needed** (blocked from an automated migration —
run by hand in the Supabase SQL editor for `coiwwbroycaznkmhevde`):

```sql
drop policy if exists ps_content_all on ps_content;

create policy ps_content_select on ps_content
  for select using (true);

create or replace function public.ps_admin_save_content(p_pass text, p_page text, p_ckey text, p_value text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare c ps_content%rowtype;
begin
  perform ps_admin_check(p_pass);
  insert into ps_content (page, ckey, value, updated_at)
  values (p_page, p_ckey, p_value, now())
  on conflict (page, ckey) do update
    set value = excluded.value, updated_at = now()
  returning * into c;
  return to_jsonb(c);
end;
$$;
```

Until this runs, saving from the inline editor will fail (the RPC doesn't
exist yet) — reads still work fine off whatever's already in `ps_content`.

## Tests

```bash
npm test                 # against the live custom domain
npm run test:preview     # against peach-state.pages.dev
```

The suite creates its own data under a per-run `ZZTEST…` tag and removes what
it can. **Orders and enquiries are deliberately undeletable with the public
key** — nothing holding the anon key should be able to erase a customer's
order — so those rows are left behind and reported. Purge them in Supabase SQL:

```sql
delete from ps_orders     where customer_name like 'ZZTEST%';
delete from ps_enquiries  where name          like 'ZZTEST%';
```
