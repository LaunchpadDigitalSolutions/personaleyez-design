/* ============================================================
   admin-shop.js — "Shop" tab: manage the public catalog on shop.html.
   Mirrors the club-shop product pattern in admin.js, but flat (one
   shop, not per-club) and includes a pause/reactivate toggle, since
   items here go live on the public site the moment they're active.
   ============================================================ */

let shopProducts = [];

async function loadShopProducts(){
  try{ shopProducts = await adminListShopProducts(); }
  catch(e){ shopProducts = []; }
}

function renderShop(p){
  p.innerHTML = `
    <div class="newcard" style="margin-bottom:18px">
      <h2 style="font-size:20px;font-family:var(--display)">Add a shop item</h2>
      <p style="font-size:14px;color:var(--muted);margin:6px 0 0">
        Goes live on the shop page as soon as you add it.</p>
      <div class="fld"><label for="sp-name">Item name</label>
        <input id="sp-name" type="text" placeholder="Peach tote bag" autocomplete="off"></div>
      <div class="fld"><label for="sp-desc">Description (optional)</label>
        <input id="sp-desc" type="text" placeholder="Canvas tote, personalised with a name" autocomplete="off"></div>
      <div class="fld"><label for="sp-price">Price (£)</label>
        <input id="sp-price" type="number" step="0.01" inputmode="decimal" autocomplete="off"></div>
      <div class="fld"><label for="sp-cat">Category (optional)</label>
        <input id="sp-cat" type="text" placeholder="gifts" autocomplete="off"></div>
      <div class="fld"><label for="sp-sizes">Sizes, comma separated (optional)</label>
        <input id="sp-sizes" type="text" placeholder="S, M, L" autocomplete="off"></div>
      <div class="fld"><label for="sp-cols">Colours, comma separated (optional)</label>
        <input id="sp-cols" type="text" placeholder="Navy, Black" autocomplete="off"></div>
      <div class="fld"><label for="sp-img">Image URL (optional)</label>
        <input id="sp-img" type="url" placeholder="https://…" autocomplete="off"></div>
      <div class="notice" id="sp-notice"></div>
      <button class="btn-solid" id="sp-save" onclick="saveShopProduct()" style="margin-top:18px">Add item</button>
    </div>

    ${shopProducts.length ? shopProducts.map(pr => `
      <div class="orow">
        <div class="orow-top">
          <span class="oref" style="font-size:15px">${pr.name}</span>
          <span class="stat-word ${pr.active?"s-ready":"s-collected"}">${pr.active?"Live":"Paused"}</span>
          <span class="otime">${money(pr.price)}</span>
        </div>
        ${pr.description?`<div class="odesc">${pr.description}</div>`:""}
        <div class="ometa">${pr.category?pr.category+" · ":""}${pr.sizes?"Sizes: "+pr.sizes:""}${pr.colours?" · Colours: "+pr.colours:""}</div>
        <div class="oact">
          <button class="ghost" onclick="toggleShopProduct('${pr.id}',${!pr.active})">${pr.active?"Pause":"Reactivate"}</button>
          <button class="ghost" onclick="removeShopProduct('${pr.id}')">Remove</button>
        </div>
      </div>`).join("")
    : `<p style="text-align:center;color:var(--muted);padding:50px 0">Nothing in the shop yet.</p>`}`;
}

async function saveShopProduct(){
  const v = id => $(id).value.trim();
  const n = $("sp-notice"), btn = $("sp-save");
  if(!v("sp-name")){ n.className="notice show err"; n.textContent="Give the item a name."; return; }
  if(!v("sp-price") || Number(v("sp-price")) <= 0){ n.className="notice show err"; n.textContent="Give it a price."; return; }

  btn.disabled = true; n.className="notice show busy"; n.textContent="Adding…";
  try{
    await createShopProduct({
      name: v("sp-name"), description: v("sp-desc") || null,
      price: Number(v("sp-price")), category: v("sp-cat") || null,
      sizes: v("sp-sizes") || null, colours: v("sp-cols") || null,
      image_url: v("sp-img") || null, sort_order: shopProducts.length
    });
    await loadShopProducts();
    toast("Item added"); render();
  }catch(e){ n.className="notice show err"; n.textContent="Couldn't add that ("+e.message+")."; }
  btn.disabled = false;
}

async function toggleShopProduct(id, active){
  try{ await updateShopProduct(id,{active}); toast(active?"Reactivated":"Paused"); await loadShopProducts(); render(); }
  catch(e){ toast("Couldn't update"); }
}

async function removeShopProduct(id){
  try{ await deleteShopProduct(id); await loadShopProducts(); toast("Removed"); render(); }
  catch(e){ toast("Couldn't remove that"); }
}
