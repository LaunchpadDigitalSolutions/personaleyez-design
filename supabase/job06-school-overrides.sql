-- Job 06: per-school overrides on the shared pool. ALREADY APPLIED to production on 29 Oct 2026
-- as two Supabase migrations (ps_school_overrides_phase_a, ps_school_overrides_functions).
-- Kept here so the change can be reviewed. Undo: supabase/job06-undo.sql.
-- Phase B (blanking values that match the pool) is separate and NOT applied: supabase/job06-phase-b.sql.

-- ===== Phase A: additive only. Row values are not changed, so the live storefront is unaffected. =====
create table if not exists ps_products_job06_backup as select * from ps_products where is_school_item;

alter table ps_products
  add column if not exists catalog_id uuid references ps_catalog_products(id) on delete set null,
  add column if not exists colour text,
  add column if not exists crest boolean;

alter table ps_products alter column name drop not null, alter column price drop not null;
alter table ps_products add constraint ps_products_unlinked_needs_values
  check (catalog_id is not null or (name is not null and price is not null));

with ins as (
  insert into ps_catalog_products(name, price, sizes, needs_logo_photo, tag, sort_order) values
    ('Hoody', 18, (select sizes from ps_products where name='Red Hoody' limit 1), true, 'School uniform', 1),
    ('Sweatshirt', 14, (select sizes from ps_products where name='Bottle Green Sweatshirt' limit 1), true, 'School uniform', 2),
    ('Cardigan', 16, (select sizes from ps_products where name='Bottle Green Cardigan' limit 1), true, 'School uniform', 3),
    ('Polo Top', 11, (select sizes from ps_products where name='Yellow Polo Top' limit 1), true, 'School uniform', 4)
  returning id, name),
t as (
  select id, name, case when name ~* ' hoody$' then 'Hoody' when name ~* ' sweatshirt$' and name !~* 'v neck' then 'Sweatshirt'
                        when name ~* ' cardigan$' then 'Cardigan' when name ~* ' polo top$' then 'Polo Top' end base
  from ps_products where is_school_item and category <> 'All Schools')
update ps_products p set catalog_id = ins.id,
       colour = regexp_replace(replace(p.name, 'Turqouise', 'Turquoise'), ' (Hoody|Sweatshirt|Cardigan|Polo Top)$', '', 'i')
  from t join ins on ins.name = t.base where p.id = t.id;

-- ===== Functions: merged read + admin RPCs =====
alter table ps_products add column if not exists edited_at timestamptz;

create or replace function ps_school_items_impl(p_school text, p_only_active boolean)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(m.j order by m.so, m.nm), '[]'::jsonb) from (
    select i.sort_order so,
      coalesce(nullif(trim(i.name),''), trim(coalesce(nullif(trim(i.colour),'')||' ','')||coalesce(c.name,''))) nm,
      to_jsonb(i) || jsonb_build_object(
        'name', coalesce(nullif(trim(i.name),''), trim(coalesce(nullif(trim(i.colour),'')||' ','')||coalesce(c.name,''))),
        'description', coalesce(nullif(trim(i.description),''), c.description),
        'price', coalesce(i.price, c.price),
        'sizes', coalesce(nullif(trim(i.sizes),''), c.sizes),
        'image_url', case when c.id is not null and c.needs_logo_photo then nullif(trim(i.image_url),'')
                          else coalesce(nullif(trim(i.image_url),''), c.image_url) end,
        'crest', coalesce(i.crest, coalesce(i.category,'') not in ('All Schools','Needs Sorting')),
        'pool_name', c.name, 'pool_price', c.price, 'pool_sizes', c.sizes,
        'overrides', (select coalesce(jsonb_agg(k), '[]'::jsonb) from (values
          ('name', c.id is not null and nullif(trim(i.name),'') is not null),
          ('colour', nullif(trim(i.colour),'') is not null),
          ('price', c.id is not null and i.price is not null),
          ('sizes', c.id is not null and nullif(trim(i.sizes),'') is not null),
          ('crest', i.crest is not null)) v(k,o) where o)
      ) j
    from ps_products i left join ps_catalog_products c on c.id = i.catalog_id
    where i.is_school_item and (p_school is null or i.category = p_school) and (not p_only_active or i.active)
  ) m
$$;
revoke execute on function ps_school_items_impl(text, boolean) from public, anon, authenticated;

create or replace function ps_school_items_json() returns jsonb language sql stable security definer set search_path to 'public' as $$
  select ps_school_items_impl(null, true)
$$;
grant execute on function ps_school_items_json() to anon, authenticated;

create or replace function ps_admin_list_school_items(p_pass text, p_school text) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
begin perform ps_admin_check(p_pass); return ps_school_items_impl(p_school, false); end; $$;

create or replace function ps_admin_list_pool(p_pass text) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
begin
  perform ps_admin_check(p_pass);
  return coalesce((select jsonb_agg(to_jsonb(c) || jsonb_build_object('used_by', (select count(distinct category) from ps_products where catalog_id = c.id))
                   order by c.sort_order, c.name) from ps_catalog_products c where c.tag = 'School uniform'), '[]'::jsonb);
end; $$;

create or replace function ps_admin_add_pool_to_school(p_pass text, p_school text, p_catalog_ids uuid[]) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare n int := 0; v_next int;
begin
  perform ps_admin_check(p_pass);
  if nullif(trim(p_school),'') is null then raise exception 'PS-SCHOOL-MISSING'; end if;
  select coalesce(max(sort_order),0) into v_next from ps_products where is_school_item and category = p_school;
  insert into ps_products(catalog_id, category, is_school_item, active, sort_order)
  select c.id, p_school, true, true, v_next + row_number() over (order by c.sort_order, c.name)
    from ps_catalog_products c
   where c.id = any(p_catalog_ids) and c.tag = 'School uniform'
     and not exists (select 1 from ps_products x where x.is_school_item and x.category = p_school and x.catalog_id = c.id);
  get diagnostics n = row_count;
  return jsonb_build_object('added', n);
end; $$;

create or replace function ps_admin_set_school_item(p_pass text, p_id uuid, p_colour text, p_price numeric, p_image_url text, p_crest boolean, p_name text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare i ps_products%rowtype; c ps_catalog_products%rowtype;
        v_colour text; v_name text; v_price numeric; v_sizes text; v_img text; v_crest boolean; v_default_crest boolean; v_composed text;
begin
  perform ps_admin_check(p_pass);
  select * into i from ps_products where id = p_id and is_school_item;
  if not found then raise exception 'PS-ITEM-NOTFOUND'; end if;
  v_default_crest := coalesce(i.category,'') not in ('All Schools','Needs Sorting');
  v_crest := case when p_crest is null or p_crest = v_default_crest then null else p_crest end;
  if i.catalog_id is null then
    v_colour := i.colour; v_name := coalesce(nullif(trim(p_name),''), i.name); v_price := coalesce(p_price, i.price);
    v_sizes := i.sizes;
    v_img := case when p_image_url is null then i.image_url else nullif(trim(p_image_url),'') end;
  else
    select * into c from ps_catalog_products where id = i.catalog_id;
    v_colour := nullif(trim(p_colour),'');
    v_composed := trim(coalesce(v_colour||' ','')||c.name);
    v_name := case when nullif(trim(p_name),'') is null or trim(p_name) = v_composed then null else trim(p_name) end;
    v_price := case when p_price is null or p_price = c.price then null else p_price end;
    v_sizes := i.sizes;
    v_img := case when p_image_url is null then i.image_url
                  when nullif(trim(p_image_url),'') is null then null
                  when not c.needs_logo_photo and trim(p_image_url) = c.image_url then null
                  else trim(p_image_url) end;
  end if;
  update ps_products set
    edited_at = case when (colour, name, price, sizes, image_url, crest) is distinct from (v_colour, v_name, v_price, v_sizes, v_img, v_crest) then now() else edited_at end,
    colour = v_colour, name = v_name, price = v_price, sizes = v_sizes, image_url = v_img, crest = v_crest
  where id = p_id;
  return (select e from jsonb_array_elements(ps_school_items_impl(i.category, false)) e where e->>'id' = p_id::text);
end; $$;

-- Deleting a pool item keeps school items as normal items with their current values (same rule as club shops)
create or replace function ps_catalog_delete_impl(p_id uuid) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare c ps_catalog_products%rowtype; n int; s int;
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
  update ps_products set
    name = coalesce(nullif(trim(name),''), trim(coalesce(nullif(trim(colour),'')||' ','')||c.name)),
    price = coalesce(price, c.price), sizes = coalesce(nullif(trim(sizes),''), c.sizes),
    image_url = case when c.needs_logo_photo then image_url else coalesce(nullif(trim(image_url),''), c.image_url) end,
    catalog_id = null
  where catalog_id = p_id;
  get diagnostics s = row_count;
  delete from ps_catalog_products where id = p_id;
  return jsonb_build_object('shops_kept', n, 'school_items_kept', s);
end; $$;

create or replace function ps_catalog_list_impl() returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(to_jsonb(c) || jsonb_build_object(
    'used_by', (select count(distinct gp.group_id) from ps_group_products gp where gp.catalog_id = c.id)
             + (select count(distinct p.category) from ps_products p where p.catalog_id = c.id)
  ) order by c.sort_order, c.name), '[]'::jsonb) from ps_catalog_products c
$$;
