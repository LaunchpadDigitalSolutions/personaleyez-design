-- Club shop checkout: server-side lookup and order creation.
-- Applied to the launchpad-portal Supabase project on 2026-11-03.
-- Both functions are service_role only. The browser never calls them.

create or replace function public.ps_club_checkout_lookup(p_slug text, p_code text, p_ids uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare g ps_groups%rowtype;
begin
  select * into g from ps_groups
   where lower(slug) = lower(trim(p_slug))
     and upper(replace(access_code,' ','')) = upper(replace(trim(p_code),' ',''))
     and active = true;
  if not found then return jsonb_build_object('ok', false); end if;
  return jsonb_build_object(
    'ok', true,
    'group', jsonb_build_object('id', g.id, 'slug', g.slug, 'name', g.name),
    'initials_pence', null,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', gp.id,
        'name', coalesce(gp.name, c.name),
        'price', coalesce(gp.price, c.price),
        'sizes', coalesce(gp.sizes, c.sizes),
        'colours', coalesce(gp.colours, c.colours),
        'active', coalesce(gp.available, false),
        'is_school_item', false,
        'crest', false))
      from ps_group_products gp
      left join ps_catalog_products c on c.id = gp.catalog_id
      where gp.group_id = g.id and gp.id = any(p_ids)
    ), '[]'::jsonb));
end;
$$;

create or replace function public.ps_club_create_order(
  p_order_ref text, p_status text, p_customer_name text, p_customer_phone text,
  p_customer_email text, p_description text, p_quantity integer, p_total numeric,
  p_notes text, p_group_id uuid, p_group_slug text, p_square_order_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare o ps_orders%rowtype;
begin
  if p_status not in ('pending_payment', 'enquiry') then
    raise exception 'ps_club_create_order: bad status %', p_status;
  end if;
  insert into ps_orders (order_ref, status, customer_name, customer_phone, customer_email,
    category, description, quantity, quoted_total, notes, group_id, group_slug,
    deposit_paid, square_order_id)
  values (p_order_ref, p_status, p_customer_name, p_customer_phone, p_customer_email,
    'club', p_description, p_quantity, p_total, p_notes, p_group_id, p_group_slug,
    0, p_square_order_id)
  returning * into o;
  return to_jsonb(o);
end;
$$;

revoke all on function public.ps_club_checkout_lookup(text, text, uuid[]) from public, anon, authenticated;
revoke all on function public.ps_club_create_order(text, text, text, text, text, text, integer, numeric, text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.ps_club_checkout_lookup(text, text, uuid[]) to service_role;
grant execute on function public.ps_club_create_order(text, text, text, text, text, text, integer, numeric, text, uuid, text, text) to service_role;
