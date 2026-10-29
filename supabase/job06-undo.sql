-- Job 06 UNDO (backup table dropped 29 Oct 2026, so this version needs no backup).
-- Step 1 bakes every school row's current merged value (name, price, sizes, photo) into the row,
-- so what customers see is exactly what they see now. Steps 2+ remove everything Job 06 added.
-- To also put Eldon's hoody back to royal blue, run the optional statement first.
-- Run this BEFORE reverting the code merge (PR #25), then revert the merge.
begin;

-- optional: Eldon Grove hoody back to how it was before Job 06
-- update ps_products set colour = 'Royal Blue', image_url = '/api/product-photo/Y2MAG3NHYYBF6OPIN2PCBMRX', edited_at = null
--  where id = '1cac6fae-361f-4c2a-9754-fba6ac770a5c';

-- 1. bake merged values into the rows
update ps_products p set name = m.name, price = m.price, sizes = m.sizes, image_url = m.image_url
  from jsonb_to_recordset(ps_school_items_impl(null, false)) as m(id uuid, name text, price numeric, sizes text, image_url text)
 where p.id = m.id and p.is_school_item;

-- 2. remove what Job 06 added
alter table ps_products drop constraint if exists ps_products_unlinked_needs_values;
alter table ps_products alter column name set not null, alter column price set not null;
alter table ps_products drop column if exists catalog_id, drop column if exists colour,
  drop column if exists crest, drop column if exists edited_at;

delete from ps_catalog_products where tag = 'School uniform';

drop function if exists ps_school_items_json();
drop function if exists ps_school_items_impl(text, boolean);
drop function if exists ps_admin_list_school_items(text, text);
drop function if exists ps_admin_list_pool(text);
drop function if exists ps_admin_add_pool_to_school(text, text, uuid[]);
drop function if exists ps_admin_set_school_item(text, uuid, text, numeric, text, boolean, text);

-- 3. put back the two catalog functions as they were before Job 06
create or replace function ps_catalog_delete_impl(p_id uuid) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare c ps_catalog_products%rowtype; n int;
begin
  select * into c from ps_catalog_products where id = p_id;
  if not found then raise exception 'PS-CAT-NOTFOUND'; end if;
  update ps_group_products set
    name = coalesce(name, c.name), description = coalesce(description, c.description), price = coalesce(price, c.price),
    sizes = coalesce(sizes, c.sizes), colours = coalesce(colours, c.colours),
    image_url = case when c.needs_logo_photo then image_url else coalesce(image_url, c.image_url) end,
    range_name = coalesce(range_name, c.tag), catalog_id = null
  where catalog_id = p_id;
  get diagnostics n = row_count;
  delete from ps_catalog_products where id = p_id;
  return jsonb_build_object('shops_kept', n);
end;
$$;

create or replace function ps_catalog_list_impl() returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(to_jsonb(c) || jsonb_build_object(
    'used_by', (select count(distinct gp.group_id) from ps_group_products gp where gp.catalog_id = c.id)
  ) order by c.sort_order, c.name), '[]'::jsonb) from ps_catalog_products c
$$;

commit;
