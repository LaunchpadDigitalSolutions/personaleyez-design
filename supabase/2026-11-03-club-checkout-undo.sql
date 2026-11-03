-- Undo for 2026-11-03-club-checkout.sql
drop function if exists public.ps_club_checkout_lookup(text, text, uuid[]);
drop function if exists public.ps_club_create_order(text, text, text, text, text, text, integer, numeric, text, uuid, text, text);
-- Only if the anon lockdown (2026-11-03-club-checkout-lockdown.sql) has been applied:
-- grant execute on function public.ps_create_order(text, text, text, text, text, integer, numeric, text, uuid, text) to anon, authenticated;
