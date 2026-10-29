-- Job 15: server-side price lookup for /api/checkout and /api/checkout-instalments.
-- Additive only. NOT yet applied to production. Undo: supabase/job15-undo.sql.
-- Price/name/sizes resolve exactly like ps_school_items_impl (Job 06): a school item
-- with a NULL price inherits ps_catalog_products.price. Colours match the storefront
-- (ps_products.colours only), so validation never demands an option the picker didn't offer.

create table if not exists ps_checkout_config (
  key   text primary key,
  value integer not null check (value >= 0)
);
alter table ps_checkout_config enable row level security;   -- no policies: service role / definer functions only
insert into ps_checkout_config(key, value) values ('initials_pence', 200) on conflict (key) do nothing;

create or replace function ps_checkout_lookup(p_ids uuid[]) returns jsonb
language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object(
    'initials_pence', (select value from ps_checkout_config where key = 'initials_pence'),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'name', coalesce(nullif(trim(i.name),''), nullif(trim(coalesce(nullif(trim(i.colour),'')||' ','')||coalesce(c.name,'')),'')),
        'price', coalesce(i.price, c.price),
        'sizes', coalesce(nullif(trim(i.sizes),''), c.sizes),
        'colours', i.colours,
        'active', coalesce(i.active, false),
        'is_school_item', coalesce(i.is_school_item, false),
        'crest', coalesce(i.crest, coalesce(i.category,'') not in ('All Schools','Needs Sorting'))
      ))
      from ps_products i left join ps_catalog_products c on c.id = i.catalog_id
      where i.id = any(p_ids)
    ), '[]'::jsonb)
  )
$$;
revoke execute on function ps_checkout_lookup(uuid[]) from public, anon, authenticated;
grant  execute on function ps_checkout_lookup(uuid[]) to service_role;
