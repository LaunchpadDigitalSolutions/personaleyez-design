-- Job 15: server-side checkout pricing lookup. Additive: one new function, no data touched.
-- Returns the EFFECTIVE price/name/sizes for product ids, using the same merge as
-- ps_school_items_impl (pool + per-school overrides), for non-school rows too.
-- service_role only: the browser must never call this.
-- Undo: drop function if exists ps_checkout_price_items(uuid[]);
create or replace function ps_checkout_price_items(p_ids uuid[]) returns jsonb
language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id,
    'name', coalesce(nullif(trim(i.name),''), trim(coalesce(nullif(trim(i.colour),'')||' ','')||coalesce(c.name,''))),
    'price', coalesce(i.price, c.price),
    'active', coalesce(i.active, false),
    'is_school_item', coalesce(i.is_school_item, false),
    'crest', coalesce(i.crest, coalesce(i.category,'') not in ('All Schools','Needs Sorting')),
    'sizes', coalesce(nullif(trim(i.sizes),''), c.sizes),
    'colours', i.colours)), '[]'::jsonb)
  from ps_products i left join ps_catalog_products c on c.id = i.catalog_id
  where i.id = any(p_ids)
$$;
revoke execute on function ps_checkout_price_items(uuid[]) from public, anon, authenticated;
grant execute on function ps_checkout_price_items(uuid[]) to service_role;
