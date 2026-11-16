-- ============================================================
-- 2026-11-16: Uniform pool
-- Jo picks which catalog items (tag='School uniform') belong
-- in each school's shop. Admin checkbox-grid UI writes to
-- ps_groups (kind='uniform') + ps_group_products.
-- Public page at /uniform/[slug] reads ps_get_uniform_items.
-- ============================================================

-- Step 1: Track Square item ID on catalog products (future sync)
alter table ps_catalog_products
  add column if not exists square_item_id text;

create index if not exists idx_catalog_square_item_id
  on ps_catalog_products (square_item_id)
  where square_item_id is not null;

-- Step 2: Admin read — returns assigned catalog_ids for a school's
-- uniform group (array of uuids, empty array if none assigned).
-- p_pass is accepted (and checked by the proxy) but not re-verified
-- here — this is a read-only function with no side effects.
create or replace function ps_admin_get_uniform_assignments(
  p_pass text,
  p_slug text
)
returns uuid[]
language sql
security definer
set search_path = public
as $$
  select coalesce(
    array_agg(gp.catalog_id order by cp.sort_order nulls last, cp.name),
    '{}'::uuid[]
  )
  from ps_groups g
  join ps_group_products gp on gp.group_id = g.id
  join ps_catalog_products cp on cp.id = gp.catalog_id
  where g.kind = 'uniform'
    and g.slug = p_slug;
$$;

-- Step 3: Admin write — replace all uniform assignments for a school.
-- Creates the ps_groups row if it doesn't exist yet.
create or replace function ps_admin_save_uniform_assignments(
  p_pass        text,
  p_slug        text,
  p_name        text,
  p_catalog_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
begin
  -- Passphrase check (same guard used by all other ps_admin_* functions)
  perform ps_admin_check(p_pass);

  -- Find or create the uniform group for this school
  select id into v_group_id
  from ps_groups
  where kind = 'uniform' and slug = p_slug
  limit 1;

  if v_group_id is null then
    insert into ps_groups (slug, name, kind, active)
    values (p_slug, p_name, 'uniform', true)
    returning id into v_group_id;
  end if;

  -- Full replacement of assignments
  delete from ps_group_products where group_id = v_group_id;

  if p_catalog_ids is not null and array_length(p_catalog_ids, 1) > 0 then
    insert into ps_group_products (group_id, catalog_id, available)
    select v_group_id, unnest(p_catalog_ids), true;
  end if;
end;
$$;

-- Step 4: Public function — returns assigned uniform items for a slug.
-- No authentication; called by /api/uniform-items without admin PIN.
create or replace function ps_get_uniform_items(p_slug text)
returns table (
  id          uuid,
  name        text,
  description text,
  price       numeric,
  sizes       text,
  image_url   text,
  sort_order  integer,
  tag         text
)
language sql
security definer
set search_path = public
as $$
  select
    cp.id,
    cp.name,
    cp.description,
    cp.price,
    cp.sizes,
    cp.image_url,
    cp.sort_order,
    cp.tag
  from ps_groups g
  join ps_group_products gp on gp.group_id = g.id
  join ps_catalog_products cp on cp.id = gp.catalog_id
  where g.kind  = 'uniform'
    and g.slug  = p_slug
    and coalesce(gp.available, true) = true
  order by cp.sort_order nulls last, cp.name;
$$;

-- Allow anon (public site) to call the public function
grant execute on function ps_get_uniform_items(text) to anon, authenticated;
