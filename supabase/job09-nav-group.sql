-- Job 09: "Order a product" dropdown. Pages made in the admin can sit under the dropdown.
-- Additive and re-runnable. Applied to production 2026-10-29 (migration ps_pages_nav_group).
-- ps_pages.nav_group: null = main menu, 'order' = under "Order a product".
alter table public.ps_pages add column if not exists nav_group text;
alter table public.ps_pages drop constraint if exists ps_pages_nav_group_chk;
alter table public.ps_pages add constraint ps_pages_nav_group_chk check (nav_group is null or nav_group = 'order');

create or replace function public.ps_page_set_nav_group_impl(p_id uuid, p_group text)
returns jsonb language plpgsql security definer set search_path to 'public' as $f$
declare v_group text := nullif(lower(trim(coalesce(p_group, ''))), ''); pg ps_pages%rowtype;
begin
  if v_group is not null and v_group <> 'order' then raise exception 'PS-PAGE-GROUP'; end if;
  update ps_pages set nav_group = v_group where id = p_id returning * into pg;
  if not found then raise exception 'PS-PAGE-NOTFOUND'; end if;
  return to_jsonb(pg);
end; $f$;

create or replace function public.ps_admin_set_page_nav_group(p_pass text, p_id uuid, p_group text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $f$
begin
  perform ps_admin_check(p_pass);
  return ps_page_set_nav_group_impl(p_id, p_group);
end; $f$;

revoke all on function public.ps_page_set_nav_group_impl(uuid, text) from public, anon, authenticated;
revoke all on function public.ps_admin_set_page_nav_group(text, uuid, text) from public, anon, authenticated;
grant execute on function public.ps_admin_set_page_nav_group(text, uuid, text) to anon, authenticated;

-- Rollback (the column is harmless to leave):
--   drop function public.ps_admin_set_page_nav_group(text, uuid, text);
--   drop function public.ps_page_set_nav_group_impl(uuid, text);
--   alter table public.ps_pages drop constraint ps_pages_nav_group_chk, drop column nav_group;
