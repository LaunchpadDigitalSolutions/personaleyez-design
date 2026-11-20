-- Undo for 2026-11-14-add-product-flow.sql
-- Only safe if no product rows yet rely on allow_notes=true.
alter table ps_products drop column if exists allow_notes;
