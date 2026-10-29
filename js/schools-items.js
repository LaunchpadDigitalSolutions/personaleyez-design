/* ============================================================
   schools-items.js — public read of school uniform items.
   One database call returns every active school item with the
   pool and that school's overrides already merged (name, colour,
   price, sizes, photo, crest), so the storefront, basket and
   checkout all see the same final values. Read-only, anon key.
   Error code: PS-615
   ============================================================ */
async function listSchoolItems(){
  return sb("rpc/ps_school_items_json", { method: "POST", body: "{}" }, "PS-615");
}
