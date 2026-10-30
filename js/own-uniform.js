/* ============================================================
   own-uniform.js - "Got your own uniform? We’ll add initials" (Job 22).
   One generic service product, priced by the server (the price shown
   here is display only). The customer picks school, garment and
   quantity, then types 1 to 3 initials for each garment. The basket
   line is handed to the same checkout as the uniform items; the
   server validates the details (functions/_lib/own-uniform.js).
   The section stays hidden until the service product is active.
   Hand-over wording comes from the site content key
   own_uniform_handover (set it once Jo has confirmed how it works).
   Error codes: PS-640, PS-641
   ============================================================ */

const OWN_NAME = "Add initials to your own uniform";
const OWN_GARMENTS = ["Sweatshirt", "Polo shirt", "Cardigan", "PE kit", "Coat"];
const OWN_MAX = 10;
let ownRow = null, ownQty = 1, ownSchools = [];

const ownById = id => document.getElementById(id);
const ownEsc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function ownOptions(list, first){
  return '<option value="">' + first + "</option>" + list.map(x => "<option>" + ownEsc(x) + "</option>").join("");
}

function ownInitialsBoxes(keep){
  let h = "";
  for(let i = 1; i <= ownQty; i++){
    h += '<input class="own-init" maxlength="3" autocomplete="off" autocapitalize="characters" value="' + ownEsc(keep[i - 1] || "") + '" ' +
      'style="width:100%;min-height:44px;font-size:16px;margin-bottom:8px;text-transform:uppercase" ' +
      'placeholder="Garment ' + i + ', for example ABC" aria-label="Initials for garment ' + i + '">';
  }
  ownById("own-inits").innerHTML = h;
  ownById("own-qty").textContent = ownQty;
  ownById("own-total").textContent = money(Number(ownRow.price) * ownQty);
}

function ownStep(d){
  const keep = [...document.querySelectorAll(".own-init")].map(i => i.value);
  ownQty = Math.min(OWN_MAX, Math.max(1, ownQty + d));
  ownInitialsBoxes(keep);
}

function ownRender(){
  const handover = (typeof CONTENT !== "undefined" && CONTENT.own_uniform_handover) || "";
  const btn = "min-height:44px;min-width:44px;font-size:20px;background:#fff;border:1px solid var(--line, #d9cfc0);border-radius:8px;cursor:pointer";
  ownById("su-own").innerHTML =
    '<span class="label">Your own uniform</span>' +
    '<h2 class="display-lg" style="margin-top:18px">Got your own uniform? We’ll add initials<span class="italic tera">.</span></h2>' +
    '<p class="body" style="margin-top:22px">Up to 3 initials stitched onto each garment, ' + money(ownRow.price) + ' per garment. ' +
    'Bought your uniform from us? Initials are ' + money(INITIALS_PRICE) + ' when you order it above.</p>' +
    '<div style="margin-top:24px;max-width:520px">' +
    '<div class="fld"><label for="own-school">School</label><select id="own-school">' + ownOptions(ownSchools, "Choose your school") + "</select></div>" +
    '<div class="fld"><label for="own-garment">Garment</label><select id="own-garment">' + ownOptions(OWN_GARMENTS, "Choose a garment") + "</select></div>" +
    '<div class="fld"><label>Number of garments</label><div style="display:flex;align-items:center;gap:14px">' +
    '<button type="button" style="' + btn + '" onclick="ownStep(-1)" aria-label="Fewer garments">−</button>' +
    '<span id="own-qty" style="min-width:24px;text-align:center;font-size:18px">1</span>' +
    '<button type="button" style="' + btn + '" onclick="ownStep(1)" aria-label="More garments">+</button></div></div>' +
    '<div class="fld"><label>Initials for each garment</label><div id="own-inits"></div></div>' +
    '<p class="body" style="display:flex;justify-content:space-between;font-weight:500"><span>Initials service</span><span id="own-total"></span></p>' +
    '<div class="notice" id="own-notice"></div>' +
    '<button class="btn-solid" style="width:100%;margin-top:12px" onclick="ownAdd()">Add to order</button>' +
    '<p class="body dim" style="margin-top:16px;font-size:14px">Personalised items can’t be returned unless faulty. <a href="refund.html">Refund policy</a></p>' +
    (handover ? '<p class="body dim" style="margin-top:12px">' + ownEsc(handover) + "</p>" : "") +
    "</div>";
  ownInitialsBoxes([]);
}

function ownAdd(){
  const school = ownById("own-school").value, garment = ownById("own-garment").value;
  const sets = [...document.querySelectorAll(".own-init")].map(i => i.value.trim().toUpperCase());
  if(!school){ note("own-notice", "err", "Choose your school."); return; }
  if(!garment){ note("own-notice", "err", "Choose a garment."); return; }
  if(sets.some(s => !/^[A-Z]{1,3}$/.test(s))){ note("own-notice", "err", "Enter 1 to 3 letters for every garment."); return; }
  // id/qty/own_uniform are what the server uses; unit and opts are for display.
  basket.push({ id: ownRow.id, name: ownRow.name, qty: ownQty, size: null, colour: null, initials: false,
    unit: Number(ownRow.price), opts: [school, garment, "initials " + sets.join(" / ")],
    own_uniform: { school: school, garment: garment, initials: sets } });
  renderBasket();
  ownQty = 1;
  ownRender();
  toast("Initials service added to your order");
}

async function ownInit(){
  try{
    for(let i = 0; i < 60 && !(typeof SCHOOLS !== "undefined" && SCHOOLS.length); i++) await new Promise(r => setTimeout(r, 100));
    if(typeof SCHOOLS === "undefined" || !SCHOOLS.length) return;
    await loadContent("schools-shop");
    const rows = await sb("ps_products?select=id,name,price&active=eq.true&name=eq." + encodeURIComponent(OWN_NAME), {}, "PS-640");
    if(!rows || !rows.length || !(Number(rows[0].price) > 0)) return;
    ownRow = rows[0];
    ownSchools = SCHOOLS.slice().sort((a, b) => a.localeCompare(b)).concat(["Other school"]);
    ownRender();
  }catch(e){ console.error("PS-641", e); }
}
document.addEventListener("DOMContentLoaded", ownInit);
