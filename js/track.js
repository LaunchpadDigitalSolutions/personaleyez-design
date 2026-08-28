/* ============================================================
   track.js — customer-facing order lookup
   ============================================================ */
const FLOW = ["enquiry", "in_production", "ready", "collected"];
const LABEL = {
  enquiry:       ["Order received",      "We've got your order and we're getting it ready to start."],
  in_production: ["In production",       "Being embroidered or printed now."],
  ready:         ["Ready for collection","Come and get it whenever suits — 184 York Road."],
  collected:     ["Collected",           "All done. Thanks very much."],
  cancelled:     ["Cancelled",           "This order was cancelled. Ring us if that's not right."]
};
const TICK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="m5 13 4 4L19 7"/></svg>';

function say(cls, msg) {
  const n = document.getElementById("notice");
  n.className = "notice show " + cls;
  n.textContent = msg;
}
function clearSay() { document.getElementById("notice").className = "notice"; }

async function lookup() {
  const ref = document.getElementById("ref").value.trim().toUpperCase();
  const btn = document.getElementById("lookup-btn");
  const box = document.getElementById("result");
  box.classList.remove("show");

  if (ref.length < 5) { say("err", "Pop your full reference in — it looks like PD-4K7QP."); return; }

  btn.disabled = true;
  say("busy", "Looking that up…");

  try {
    const o = await findOrder(ref);
    if (!o) {
      say("err", "We couldn't find that reference. Double-check it, or give us a ring and we'll look for you.");
      btn.disabled = false; return;
    }
    clearSay();
    render(o);
    box.classList.add("show");
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (e) {
    say("err", "Couldn't check that just now. Please ring the shop.");
  }
  btn.disabled = false;
}

function render(o) {
  document.getElementById("r-ref").textContent = o.order_ref;
  document.getElementById("r-desc").textContent = o.description || "";
  const pill = document.getElementById("r-pill");
  pill.className = "pill p-" + o.status;
  pill.textContent = LABEL[o.status][0];

  if (o.status === "cancelled") {
    document.getElementById("r-timeline").innerHTML =
      `<li class="tl"><span class="dot"></span><span><b>Cancelled</b><span>${LABEL.cancelled[1]}</span></span></li>`;
    return;
  }

  const idx = FLOW.indexOf(o.status);
  document.getElementById("r-timeline").innerHTML = FLOW.map((s, i) => {
    const cls = i < idx ? "done" : i === idx ? "now" : "";
    const extra = (s === "ready" && i === idx && o.due_date)
      ? "" : (i === idx ? LABEL[s][1] : "");
    return `<li class="tl ${cls}"><span class="dot">${i < idx ? TICK : ""}</span>
      <span><b>${LABEL[s][0]}</b><span>${extra}</span></span></li>`;
  }).join("");
}

document.addEventListener("DOMContentLoaded", async () => {
  // Deep link: track.html?ref=PD-XXXXX
  const q = new URLSearchParams(location.search).get("ref");
  if (q) { document.getElementById("ref").value = q.toUpperCase(); lookup(); }
  if (!(await healthCheck())) document.getElementById("health").style.display = "block";
});
