-- Public order tracking: return only what the track page shows.
-- Applied to the launchpad-portal Supabase project on 2026-11-03.
-- Before: returned the whole ps_orders row (phone, email, notes incl. the
-- delivery address, payment details) to anyone who typed a reference.
-- js/track.js uses order_ref, status and description only.

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
  return jsonb_build_object(
    'order_ref', o.order_ref,
    'status', o.status,
    'description', o.description,
    'created_at', o.created_at,
    'updated_at', o.updated_at
  );
end;
$function$;
