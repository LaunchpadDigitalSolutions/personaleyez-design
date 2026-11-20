/* ============================================================
   admin-school-add-item.js — "Add new item" inside the school
   tick grid. Creates the item in Square (/api/square-item-create),
   optionally uploads a photo (/api/product-photo), then ticks it.
   Error codes: PS-640 create, PS-641 photo.
   ============================================================ */

let pkAdd = { open: false, name: "", price: "", sizes: "", file: null, busy: false, err: "" };

const pkPin = () => { try { return sessionStorage.getItem("ps_admin_pin") || ""; } catch (e) { return ""; } };

function pkAddToggle(on) { pkAdd = { open: on, name: "", price: "", sizes: "", file: null, busy: false, err: "" }; render(); }
function pkAddField(k, v) { pkAdd[k] = v; }
function pkAddFile(el) { pkAdd.file = el.files[0] || null; pkAdd.err = ""; render(); }

// The button, or the open form, shown above the tick grid.
function pkAddHtml() {
  if (!pkAdd.open) return `<button class="ghost" style="width:100%;min-height:44px;margin:8px 0" onclick="pkAddToggle(true)">+ Add new item</button>`;
  const inp = (k, label, ph, mode) => `<label style="display:block;font-size:13px;margin-top:10px">${label}
    <input value="${esc(pkAdd[k])}" placeholder="${ph}" inputmode="${mode}" oninput="pkAddField('${k}',this.value)" style="display:block;width:100%;font-size:16px;min-height:44px;margin-top:4px"></label>`;
  return `<div class="orow" style="display:block;margin:8px 0">
    <strong style="font-size:15px">Add new item</strong>
    ${inp("name", "Name (put the colour in the name)", "Red Polo Top", "text")}
    ${inp("price", "Price in pounds", "9.00", "decimal")}
    ${inp("sizes", "Sizes, separated by commas (leave blank for one size)", "3-4, 5-6, 7-8", "text")}
    <label style="display:block;font-size:13px;margin-top:10px">Photo (optional)
      <input type="file" accept="image/jpeg,image/png,image/webp" onchange="pkAddFile(this)" style="display:block;margin-top:4px;font-size:16px"></label>
    ${pkAdd.file ? `<span class="ometa">${esc(pkAdd.file.name)}</span>` : ""}
    ${pkAdd.err ? `<p style="color:#b3261e;font-size:13px;margin:10px 0 0">${esc(pkAdd.err)}</p>` : ""}
    <p class="ometa" style="margin:10px 0">Saved to your Square catalog, then ticked for this school.</p>
    <div style="display:flex;gap:8px"><button class="ghost" style="flex:1;min-height:44px" onclick="pkAddToggle(false)">Cancel</button>
      <button class="btn-solid" style="flex:1;min-height:44px" ${pkAdd.busy ? "disabled" : ""} onclick="pkAddCreate()">${pkAdd.busy ? "Adding…" : "Create and tick"}</button></div></div>`;
}

// Create in Square, upload photo if given, then tick it in the grid.
async function pkAddCreate() {
  pkAdd.busy = true; pkAdd.err = ""; render();
  try {
    const res = await fetch("/api/square-item-create", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: pkPin(), name: pkAdd.name, price: pkAdd.price, sizes: pkAdd.sizes.split(",") })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "PS-640");
    const item = data.item;
    let photoNote = "";
    if (pkAdd.file) {
      try {
        const form = new FormData();
        form.append("pin", pkPin()); form.append("item_id", item.id); form.append("file", pkAdd.file);
        const pr = await fetch("/api/product-photo", { method: "POST", body: form });
        if (!pr.ok) throw new Error((await pr.json()).error || "PS-641");
        item.photo_url = "/api/product-photo/" + item.id;
      } catch (e) { photoNote = " The photo didn't upload (" + e.message + ") - add it in the Products tab."; }
    }
    pkSquare.push(item); pkTicked.add(item.id);
    pkAdd = { open: false, name: "", price: "", sizes: "", file: null, busy: false, err: "" };
    schMsg = item.name + " added to Square and ticked. Press Save to put it on this school's shop." + photoNote;
  } catch (e) { pkAdd.busy = false; pkAdd.err = "Couldn't add it. " + e.message; }
  render();
}
