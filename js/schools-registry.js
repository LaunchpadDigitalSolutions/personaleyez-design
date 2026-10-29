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

/* Phase comes from the registry. Only if the registry itself couldn't
   be read do we fall back to the old name check, so a database blip
   doesn't push every school into "Other". With the registry readable,
   buildSchoolList never offers an unknown name, so "other" is only
   reachable in that fallback. */
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

/* Job 16: the registry is the only source of schools on the public
   page. A product whose category isn't an active registry school
   (a typo, the "Needs Sorting" holding pen) is ignored here, so it
   can never become a circle. Those rows stay in the database and in
   the admin Shop tab. "All Schools" is the shared pool, never a
   school of its own.
   Only if the registry couldn't be read do we fall back to the
   categories found in the products (so the shop isn't blank), and
   even then "Needs Sorting" is never offered as a school. */
function buildSchoolList(categories){
  const names = SCHOOL_REGISTRY.map(s => s.name);
  if(REGISTRY_OK) return names;
  (categories || []).forEach(c => {
    if(c && c !== "All Schools" && c !== "Needs Sorting" && !names.includes(c)) names.push(c);
  });
  return names;
}
