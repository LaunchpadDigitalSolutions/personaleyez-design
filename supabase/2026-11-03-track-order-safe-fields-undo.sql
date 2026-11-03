-- Undo for 2026-11-03-track-order-safe-fields.sql (restores the old, leaky behaviour)
create or replace function public.ps_track_order(p_ref text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare o ps_orders%rowtype;
begin
  select * into o from ps_orders where order_ref = upper(trim(p_ref));
  if not found then return null; end if;
  return to_jsonb(o);
end;
$function$;
