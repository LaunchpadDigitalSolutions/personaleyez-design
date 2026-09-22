/* ============================================================
   inline-edit.js — Jo edits the real page, in place.

   Replaces the old admin.html "Wording" form: instead of a list of
   textareas somewhere else, every [data-edit] and [data-img] element
   on the page she's actually looking at becomes click-to-change,
   gated by the same PIN as admin.html. Text still lives in
   ps_content (js/api.js: loadContent/applyContent/saveContent);
   photos are the same table under page="global", ckey="img_<slot>".

   Call psInitInlineEditor(page) once, after loadContent()+applyContent()
   have run, from the bottom of each public page.
   Error codes: PS-407
   ============================================================ */

function psInitInlineEditor(page){
  const toggle = document.createElement("div");
  toggle.className = "ps-edit-toggle";
  toggle.innerHTML = `<span>Edit this page</span><button class="ps-switch" aria-label="Toggle edit mode"></button>`;
  document.body.appendChild(toggle);
  toggle.querySelector("button").addEventListener("click", () => psToggleEdit(page));

  document.addEventListener("click", (e) => {
    if (!document.body.classList.contains("ps-edit-on")) return;
    const editEl = e.target.closest("[data-edit]");
    const imgEl = e.target.closest("[data-img]");
    if (editEl) { e.preventDefault(); psEditText(editEl, page); }
    else if (imgEl) { e.preventDefault(); psEditImage(imgEl); }
  });
}

function psHasPin(){
  try { return !!sessionStorage.getItem("ps_admin_pin"); } catch (e) { return false; }
}

async function psToggleEdit(page){
  if (document.body.classList.contains("ps-edit-on")) {
    document.body.classList.remove("ps-edit-on");
    psRemoveBar();
    return;
  }
  if (psHasPin()) { psEnterEdit(page); return; }
  psShowPinPrompt(page);
}

function psShowPinPrompt(page){
  document.querySelector(".ps-pin-pop")?.remove();
  const pop = document.createElement("div");
  pop.className = "ps-pin-pop";
  pop.innerHTML = `
    <input type="password" inputmode="numeric" autocomplete="off" maxlength="8" placeholder="••••">
    <button>Unlock</button>
    <div class="ps-pin-err">That's not right — try again.</div>`;
  document.body.appendChild(pop);
  const input = pop.querySelector("input"), btn = pop.querySelector("button"), err = pop.querySelector(".ps-pin-err");
  input.focus();

  const submit = async () => {
    const pin = input.value.trim();
    btn.disabled = true;
    try {
      const res = await fetch("/api/admin", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, rpc: "ping" })
      });
      if (res.ok) {
        try { sessionStorage.setItem("ps_admin_pin", pin); } catch (e) {}
        pop.remove();
        psEnterEdit(page);
        return;
      }
    } catch (e) { /* falls through to the error state below */ }
    err.classList.add("show");
    input.value = ""; input.focus();
    btn.disabled = false;
  };
  btn.addEventListener("click", submit);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
}

function psEnterEdit(page){
  document.body.classList.add("ps-edit-on");
  const bar = document.createElement("div");
  bar.className = "ps-editbar";
  bar.id = "ps-editbar";
  bar.innerHTML = `<span>Editing peachstate.co.uk — only you and Josh see this. Changes go live as you save them.</span>
    <button id="ps-editbar-done">Done editing</button>`;
  document.body.prepend(bar);
  bar.querySelector("#ps-editbar-done").addEventListener("click", () => {
    document.body.classList.remove("ps-edit-on");
    psRemoveBar();
  });
}
function psRemoveBar(){ document.getElementById("ps-editbar")?.remove(); }

function psToast(msg){
  let t = document.querySelector(".ps-toast");
  if (!t) { t = document.createElement("div"); t.className = "ps-toast"; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._psTimer);
  t._psTimer = setTimeout(() => t.classList.remove("show"), 2400);
}

/* ---------- text ---------- */

function psEditText(el, page){
  if (el.classList.contains("ps-active")) return; // already editing this one
  const key = el.dataset.edit;
  const before = el.textContent;
  el.classList.add("ps-active");
  el.contentEditable = "true";
  el.focus();
  // Best-effort "select all so typing replaces it" - not every browser
  // context implements execCommand, so click-to-edit must still work
  // without it.
  try { document.execCommand("selectAll", false, null); } catch (e) {}

  const finish = async () => {
    el.removeEventListener("blur", finish);
    el.contentEditable = "false";
    el.classList.remove("ps-active");
    const after = el.textContent.trim();
    if (after === before.trim() || !after) { el.textContent = before; return; }
    try {
      await saveContent(page, key, after);
      CONTENT[key] = after;
      psToast("Saved · live now");
    } catch (e) {
      el.textContent = before;
      psToast("Couldn't save that — try again");
    }
  };
  el.addEventListener("blur", finish);
}

/* ---------- photos ---------- */

function psEditImage(el){
  const slot = el.dataset.img;
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/jpeg,image/png,image/webp";
  input.style.display = "none";
  document.body.appendChild(input);
  input.addEventListener("change", async () => {
    const file = input.files[0];
    input.remove();
    if (!file) return;
    const before = el.src;
    el.style.opacity = "0.5";
    try {
      let pin = null;
      try { pin = sessionStorage.getItem("ps_admin_pin"); } catch (e) {}
      const form = new FormData();
      form.append("pin", pin || "");
      form.append("slot", slot);
      form.append("file", file);
      const res = await fetch("/api/site-photo", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "PS-407: upload failed");

      const url = data.photo_url + "?v=" + Date.now();
      await saveContent("global", "img_" + slot, data.photo_url);
      CONTENT["img_" + slot] = data.photo_url;
      el.src = url;
      psToast("Saved · live now");
    } catch (e) {
      el.src = before;
      psToast("Couldn't upload that photo");
    }
    el.style.opacity = "";
  });
  input.click();
}
