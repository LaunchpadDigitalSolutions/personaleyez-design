/* ============================================================
   schools-registry.js — the school list for /schools-shop.
   Reads ps_schools (public read, active rows only, RLS). That table
   is the single source for which schools exist, in what order, which
   phase they sit in and their crest. Products still point at a school
   by its name in ps_products.category, so the admin Shop tab, order
   text and checkout keep working untouched.
   Error code: PS-510 (registry read).
   ============================================================ */

let SCHOOL_REGISTRY = [], REGISTRY_OK = false;

async function listSchools(){
  return sb("ps_schools?select=name,slug,phase,crest_url,sort_order&active=eq.true&order=sort_order,name", {}, "PS-510");
}

/* Never throws: if the read fails the page falls back to the schools
   found in the products (see buildSchoolList / classifyPhase), so the
   shop stays usable instead of going blank. */
async function loadSchoolRegistry(){
  try{ SCHOOL_REGISTRY = (await listSchools()) || []; }
  catch(e){ SCHOOL_REGISTRY = []; }
  REGISTRY_OK = SCHOOL_REGISTRY.length > 0;
  return SCHOOL_REGISTRY;
}

function registryRow(name){
  return SCHOOL_REGISTRY.find(s => s.name === name) || null;
}

/* Phase comes from the registry. A product category that isn't in it
   (a typo, "Needs Sorting") lands in "Other" so it is visible rather
   than guessed at. Only if the registry itself couldn't be read do we
   fall back to the old name check, so a database blip doesn't hide
   every school under "Other". */
function classifyPhase(name){
  const r = registryRow(name);
  if(r) return r.phase;
  if(!REGISTRY_OK && /primary|academy/i.test(name || "")) return "primary";
  return "other";
}

function crestFor(name){
  const r = registryRow(name);
  return r && r.crest_url ? r.crest_url : null;
}

/* Registry schools in Jo's order (even with no products), then any
   product category the registry doesn't know. "All Schools" is the
   shared pool, never a school of its own. */
function buildSchoolList(categories){
  const names = SCHOOL_REGISTRY.map(s => s.name);
  (categories || []).forEach(c => {
    if(c && c !== "All Schools" && !names.includes(c)) names.push(c);
  });
  return names;
}
