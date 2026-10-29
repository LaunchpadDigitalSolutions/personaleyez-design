-- Job 06 Phase B: make the migrated school rows FOLLOW the pool.
-- NOT applied yet. Run only after feature/school-overrides is merged and live.
-- Blanks name/price/sizes where they equal what the pool would give, so later pool
-- edits flow through. Customers see identical output (dry run: only change is the
-- Turqouise -> Turquoise typo fix). Photos stay as each school's own.
update ps_products p set
    name = case when trim(p.colour || ' ' || c.name) = p.name or p.name ilike '%turqouise%' then null else p.name end,
    price = case when p.price = c.price then null else p.price end,
    sizes = case when p.sizes is not distinct from c.sizes then null else p.sizes end
  from ps_catalog_products c
 where p.catalog_id = c.id;
