-- 2026-11-14: Job 1 — add allow_notes to ps_products.
-- allow_notes: when true the product page shows a personalisation note field.
-- Additive only. Undo: supabase/2026-11-14-add-product-flow-undo.sql.

alter table ps_products add column if not exists allow_notes boolean not null default false;

-- Replace ps_admin_create_shop_product to accept p_allow_notes.
-- Previous call signature (10 params + p_pass) is extended with p_allow_notes defaulting
-- to false, so old callers keep working without changes.
create or replace function ps_admin_create_shop_product(
  p_pass        text,
  p_name        text,
  p_description text,
  p_price       numeric,
  p_sizes       text,
  p_colours     text,
  p_image_url   text,
  p_category    text,
  p_sort_order  int,
  p_is_school_item boolean,
  p_page_key    text,
  p_allow_notes boolean default false
)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid;
begin
  perform ps_admin_check(p_pass);
  insert into ps_products(
    name, description, price, sizes, colours, image_url,
    category, sort_order, is_school_item, page_key, allow_notes, active
  ) values (
    p_name, p_description, p_price, p_sizes, p_colours, p_image_url,
    p_category, p_sort_order, p_is_school_item, p_page_key, coalesce(p_allow_notes, false), true
  ) returning id into v_id;
  return jsonb_build_object('id', v_id, 'allow_notes', coalesce(p_allow_notes, false));
end;
$$;
