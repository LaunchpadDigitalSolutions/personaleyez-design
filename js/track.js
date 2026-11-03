/* ============================================================
   track.js — customer order lookup
   ============================================================ */
const FLOW = ["enquiry","in_production","ready","collected"];
const LABEL = {
  pending_payment: ["Confirming your payment", "Square is confirming it. Refresh this page in a minute."],
  enquiry:       ["Order received",       "We've got it and we're lining it up."],
  in_production: ["In production",        "Being stitched or printed now."],
  ready:         ["Ready for collection", "Come and get it whenever suits — 184 York Road."],
  collected:     ["Collected",            "All done. Thanks very much."],
  cancelled:     ["Cancelled",            "This order was cancelled. Ring us if that's not right."]
};
/* Delivery orders carry a "Delivery ..." line in their description, so
   the last two steps read differently. (The address is not in the
   description; it is never shown here.) */
const DELIVERY_LABEL = {
  ready:     ["Ready for delivery", "We'll be in touch to arrange delivery."],
  collected: ["Delivered",          "All done. Thanks very much."]
};
const isDelivery = o => /;\s*Delivery\b/.test(o.description || "");
const labelsFor = o => isDelivery(o) ? { ...LABEL, ...DELIVERY_LABEL } : LABEL;

function say(cls,msg){
  const n=document.getElementById("notice");
  n.className="notice show "+cls; n.textContent=msg;
}
const clearSay = () => document.getElementById("notice").className="notice";

async function lookup(){
  const ref=document.getElementById("ref").value.trim().toUpperCase();
  const btn=document.getElementById("lookup-btn");
  const box=document.getElementById("result");
  box.style.display="none";

  if(ref.length<5){ say("err","Pop your full reference in — it looks like PD-4K7QP."); return; }
  btn.disabled=true; say("busy","Looking that up…");

  try{
    const o=await findOrder(ref);
    if(!o){ say("err","We couldn't find that one. Check it over, or ring and we'll look for you."); btn.disabled=false; return; }
    clearSay(); render(o);
    box.style.display="block";
    box.scrollIntoView({behavior:"smooth",block:"nearest"});
  }catch(e){ say("err","Couldn't check that just now. Please ring the studio."); }
  btn.disabled=false;
}

function render(o){
  const L = labelsFor(o);
  const known = L[o.status] || L.enquiry;   // never crash on a status we don't know
  document.getElementById("r-ref").textContent=o.order_ref;
  document.getElementById("r-desc").textContent=o.description||"";
  const pill=document.getElementById("r-pill");
  pill.className="stat-word s-"+o.status;
  pill.textContent=known[0];

  // Not in the normal flow: show the one message instead of the timeline
  if(o.status==="cancelled" || o.status==="pending_payment"){
    document.getElementById("r-timeline").innerHTML =
      `<li class="tl"><span class="dot"></span><span><b>${known[0]}</b><span>${known[1]}</span></span></li>`;
    return;
  }
  const idx=FLOW.indexOf(o.status);
  document.getElementById("r-timeline").innerHTML = FLOW.map((s,i)=>{
    const cls = i<idx ? "done" : i===idx ? "now" : "pending";
    return `<li class="tl ${cls}"><span class="dot"></span>
      <span><b>${L[s][0]}</b><span>${i===idx?L[s][1]:""}</span></span></li>`;
  }).join("");
}

document.addEventListener("DOMContentLoaded", async () => {
  const q=new URLSearchParams(location.search).get("ref");
  if(q){ document.getElementById("ref").value=q.toUpperCase(); lookup(); }
  if(!(await healthCheck())) document.getElementById("health").style.display="block";
});
