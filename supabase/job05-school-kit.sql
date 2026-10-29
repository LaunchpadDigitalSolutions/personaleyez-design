-- Job 05: whole-kit save for a school (already applied to production; kept for review and rebuilds).
-- ps_school_kit_apply has no auth check, so execute is revoked from every API role; only the
-- password-checked wrapper ps_admin_set_school_kit can reach it. Untick = active=false (never delete).
-- Undo: drop function ps_admin_set_school_kit(text,text,jsonb); drop function ps_school_kit_apply(text,jsonb);
create or replace function public.ps_school_kit_apply(p_school text, p_items jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare r jsonb; v_cat uuid; v_colour text; v_crest boolean; v_default boolean; v_next int;
        v_added int := 0; v_changed int := 0; v_removed int := 0; p ps_products%rowtype; v_ids uuid[] := '{}';
begin
  if nullif(trim(p_school),'') is null then raise exception 'PS-SCHOOL-MISSING'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'PS-KIT-BAD'; end if;
  v_default := p_school not in ('All Schools','Needs Sorting');
  for r in select * from jsonb_array_elements(p_items) loop
    if nullif(trim(r->>'colour'),'') is null then raise exception 'PS-KIT-COLOUR'; end if;
    v_cat := (r->>'catalog_id')::uuid;
    if not exists (select 1 from ps_catalog_products c where c.id = v_cat and c.tag = 'School uniform') then raise exception 'PS-KIT-ITEM'; end if;
    v_ids := v_ids || v_cat;
  end loop;
  select coalesce(max(sort_order),0) into v_next from ps_products where is_school_item and category = p_school;
  for r in select * from jsonb_array_elements(p_items) loop
    v_cat := (r->>'catalog_id')::uuid;
    v_colour := trim(r->>'colour');
    v_crest := case when r->>'crest' is null or (r->>'crest')::boolean = v_default then null else (r->>'crest')::boolean end;
    select * into p from ps_products where is_school_item and category = p_school and catalog_id = v_cat order by active desc limit 1;
    if not found then
      v_next := v_next + 1;
      insert into ps_products(catalog_id, category, is_school_item, active, sort_order, colour, crest, edited_at)
        values (v_cat, p_school, true, true, v_next, v_colour, v_crest, now());
      v_added := v_added + 1;
    elsif (p.active, p.colour, p.crest) is distinct from (true, v_colour, v_crest) then
      update ps_products set active = true, colour = v_colour, crest = v_crest, edited_at = now() where id = p.id;
      v_changed := v_changed + 1;
    end if;
  end loop;
  update ps_products set active = false, edited_at = now()
   where is_school_item and category = p_school and catalog_id is not null and active and not (catalog_id = any(v_ids));
  get diagnostics v_removed = row_count;
  return jsonb_build_object('added', v_added, 'changed', v_changed, 'removed', v_removed);
end; $fn$;

revoke all on function public.ps_school_kit_apply(text, jsonb) from public, anon, authenticated;

create or replace function public.ps_admin_set_school_kit(p_pass text, p_school text, p_items jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
begin
  perform ps_admin_check(p_pass);
  return ps_school_kit_apply(p_school, p_items);
end; $fn$;
