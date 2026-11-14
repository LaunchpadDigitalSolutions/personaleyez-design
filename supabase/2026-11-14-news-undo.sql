-- Undo for 2026-11-14-news.sql
drop function if exists ps_admin_delete_news(text, uuid);
drop function if exists ps_admin_update_news(text, uuid, text, text, text, text, text, text, boolean, timestamptz);
drop function if exists ps_admin_create_news(text, text, text, text, text, text, text, text, boolean, timestamptz);
drop function if exists ps_admin_list_news(text);
drop table if exists ps_news;
