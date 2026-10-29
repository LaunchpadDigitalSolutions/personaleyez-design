-- Job 06 UNDO. Restores every school row from ps_products_job06_backup (taken before
-- Phase A), removes the rows added from the pool afterwards, then removes everything
-- Job 06 added. Changes made in the Schools tab after the migration are reverted.
begin;

update ps_products p set
    name = b.name, price = b.price, sizes = b.sizes, colours = b.colours, image_url = b.image_url,
    description = b.description, category = b.category, sort_order = b.sort_order, active = b.active
  from ps_products_job06_backup b
 where p.id = b.id;

delete from ps_products where is_school_item and id not in (select id from ps_products_job06_backup);

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

-- put back the two catalog functions as they were before Job 06
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

-- afterwards (when happy): drop table ps_products_job06_backup;
commit;
