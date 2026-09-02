/* ============================================================
   admin-square.js — "Products" tab: read-only view of Jo's live
   Square catalog, with a photo upload per item. Square stays the
   single source of truth for name/price/stock - we only ever
   store a photo alongside each item id.
   ============================================================ */

let squareItems = [];
let squareSyncedAt = null;
let squareLoadError = null;

async function loadSquareCatalog(){
  squareLoadError = null;
  try{
    const res = await fetch("/api/square-catalog");
    const data = await res.json();
    if(!res.ok) throw new Error(data.error || "PSQ-000");
    squareItems = data.items;
    squareSyncedAt = data.synced_at;
  }catch(e){
    squareItems = [];
    squareLoadError = e.message;
  }
}

function renderSquareProducts(p){
  if(squareLoadError){
    p.innerHTML = `
      <div class="newcard" style="text-align:center">
        <p style="color:var(--muted)">Couldn't load the Square catalog (${squareLoadError}).</p>
        <button class="btn-solid" onclick="reloadSquareTab()" style="margin-top:14px">Try again</button>
      </div>`;
    return;
  }

  const syncedLabel = squareSyncedAt
    ? "Synced " + new Date(squareSyncedAt).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})
    : "";

  p.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;max-width:1200px;margin:0 auto 14px">
      <span style="font-size:13px;color:var(--muted)">Pulled live from Square · ${syncedLabel}</span>
      <button class="ghost" onclick="reloadSquareTab()">Refresh</button>
    </div>
    ${!squareItems.length
      ? `<p style="text-align:center;color:var(--muted);padding:50px 0">No items found in Square yet.</p>`
      : squareItems.map(renderSquareItem).join("")}
    <input type="file" id="sq-file-input" accept="image/jpeg,image/png,image/webp" style="display:none" onchange="onSquarePhotoChosen(event)">
  `;
}

function renderSquareItem(item){
  const variationCount = item.variations.length;
  const variationLabel = variationCount > 1 ? variationCount + " variations" : (item.variations[0]?.name || "");
  return `
    <div class="orow" data-item-id="${item.id}">
      <div class="orow-top">
        <div style="width:56px;height:56px;border-radius:8px;overflow:hidden;flex-shrink:0;background:var(--cream-deep);
             display:flex;align-items:center;justify-content:center">
          ${item.photo_url
            ? `<img src="${item.photo_url}" alt="" style="width:100%;height:100%;object-fit:cover">`
            : `<span style="font-size:11px;color:var(--muted)">No photo</span>`}
        </div>
        <div style="flex:1;min-width:0">
          <span class="oref" style="font-size:15px">${item.name}</span>
          <div class="ometa">${variationLabel}${item.price_from!=null ? " · from "+money(item.price_from) : ""}</div>
        </div>
      </div>
      <div class="oact">
        <button class="ghost" onclick="chooseSquarePhoto('${item.id}')">${item.photo_url ? "Replace photo" : "Add photo"}</button>
      </div>
    </div>`;
}

function chooseSquarePhoto(itemId){
  const input = $("sq-file-input");
  input.dataset.itemId = itemId;
  input.click();
}

async function onSquarePhotoChosen(event){
  const file = event.target.files[0];
  const itemId = event.target.dataset.itemId;
  if(!file || !itemId) return;

  const row = document.querySelector(`.orow[data-item-id="${itemId}"] .oact button`);
  const originalLabel = row ? row.textContent : "";
  if(row){ row.disabled = true; row.textContent = "Uploading…"; }

  try{
    const form = new FormData();
    form.append("item_id", itemId);
    form.append("file", file);
    const res = await fetch("/api/product-photo", { method:"POST", body: form });
    const data = await res.json();
    if(!res.ok) throw new Error(data.error || "PSQ-100");

    const item = squareItems.find(i => i.id === itemId);
    if(item) item.photo_url = data.photo_url + "?v=" + Date.now();
    toast(data.pushed_to_square ? "Photo saved and pushed to Square" : "Photo saved (didn't reach Square - check connection)");
    render();
  }catch(e){
    toast("Couldn't upload that photo");
    if(row){ row.disabled = false; row.textContent = originalLabel; }
  }
  event.target.value = "";
}

async function reloadSquareTab(){
  toast("Syncing…");
  await loadSquareCatalog();
  render();
}
