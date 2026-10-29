-- Undo Job 15 (only after the server change has been reverted, or checkout will refuse every order).
drop function if exists ps_checkout_lookup(uuid[]);
drop table if exists ps_checkout_config;
