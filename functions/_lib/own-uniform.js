/* ============================================================
   Own-uniform initials service (Job 22).
   One generic service product ("Add initials to your own uniform",
   £4 per garment) with the school, garment and each garment's
   initials recorded on the order line. The price still comes from
   the database row; this module only validates the details and
   returns the text that goes into the order description.
   Error codes ${prefix}-040 to -045.
   ============================================================ */

export const SERVICE_NAME = "Add initials to your own uniform";
export const GARMENTS = ["Sweatshirt", "Polo shirt", "Cardigan", "PE kit", "Coat"];

const text = s => String(s == null ? "" : s).replace(/[<>]/g, "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();

/* it: the basket line from the browser; row: the database row for it.
   fail(suffix, message) throws the caller's error type.
   Returns the option strings to add to the order line label. */
export function ownUniformOptions(it, row, fail) {
  const details = it.own_uniform;
  if (row.name !== SERVICE_NAME) {
    if (details !== undefined) fail("045", "Please refresh the page and add your items again.");
    return [];
  }
  if (!details || typeof details !== "object") fail("040", "Please tell us your school, garment and initials.");

  const school = text(details.school);
  if (school.length < 2 || school.length > 80) fail("041", "Please choose your school.");

  const wanted = text(details.garment).toLowerCase();
  const garment = GARMENTS.find(g => g.toLowerCase() === wanted);
  if (!garment) fail("042", "Please choose a garment from the list.");

  const sets = Array.isArray(details.initials) ? details.initials : [];
  const ok = sets.length === it.qty && sets.every(s => typeof s === "string" && /^[A-Za-z]{1,3}$/.test(s.trim()));
  if (!ok) fail("043", "Please enter 1 to 3 letters for every garment.");

  return [school, garment, "initials " + sets.map(s => s.trim().toUpperCase()).join(" / ")];
}
