/* Launchpad Feature — Category page: "add an item to a page" form for the admin.

   One form, four destinations: School uniform, or one of the category pages.
   Photo is uploaded first (downscaled in the browser so a phone photo never
   trips the 5MB cap), then one Add tap creates the product row.

   No host globals:
     mountAddItem({
       el, rpc: (name, params) => Promise, pin: () => string,
       sortOrder: where => number, onAdded: (row, where) => {}, toast: msg => {},
       where: 'workwear',            // starting destination
       onWhere: where => {}          // called when the destination changes
     })
   Error codes: PS-703 upload, PS-704 create.
*/

export const WHERE = [
  ['school', 'School uniform'], ['workwear', 'Workwear'],
  ['sportswear', 'Sportswear'], ['gifts', 'Gifts & Accessories']
];

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const orNull = v => (String(v ?? '').trim() || null);

/* Form values -> RPC params. Throws a friendly message on bad input. */
export function productParams(f) {
  const where = WHERE.find(w => w[0] === f.where);
  if (!where) throw new Error('Choose where it goes.');
  if (!String(f.name || '').trim()) throw new Error('Give the item a name.');
  const price = Number(f.price);
  if (!(price > 0)) throw new Error('Give it a price.');
  const school = f.where === 'school';
  return {
    p_name: String(f.name).trim(), p_description: orNull(f.description), p_price: price,
    p_sizes: orNull(f.sizes), p_colours: orNull(f.colours), p_image_url: orNull(f.image_url),
    p_category: school ? orNull(f.category) : null, p_sort_order: Number(f.sort_order) || 0,
    p_is_school_item: school, p_page_key: school ? null : f.where
  };
}

export function newPhotoKey() {
  const c = globalThis.crypto;
  return 'shop-' + (c && c.randomUUID ? c.randomUUID() : Date.now().toString(36) + Math.random().toString(16).slice(2));
}

/* Phone photos are often over the 5MB upload cap. Shrink to 1600px JPEG when needed. */
export async function downscale(file, max = 1600) {
  if (!file || typeof document === 'undefined' || !/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (k === 1 && file.size <= 4 * 1024 * 1024) return file;
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
    return blob ? new File([blob], 'photo.jpg', { type: 'image/jpeg' }) : file;
  } catch (e) { return file; }
}

export async function uploadPhoto(file, { pin, key, fetchFn = globalThis.fetch, url = '/api/product-photo' }) {
  const form = new FormData();
  form.append('pin', pin || ''); form.append('item_id', key); form.append('file', file); form.append('skip_square', 'true');
  let res, data;
  try { res = await fetchFn(url, { method: 'POST', body: form }); data = await res.json(); }
  catch (e) { throw new Error('PS-703: upload failed'); }
  if (!res.ok) throw new Error('PS-703: ' + ((data && data.error) || 'upload failed'));
  return data.photo_url + '?v=' + Date.now();
}

export const formHtml = where => `<div class="cp-admin">
  <h2>Add a shop item</h2>
  <div class="cp-fld"><span>Where does it go?</span>
    <div class="cp-chips">${WHERE.map(w => `<button type="button" class="cp-chip${w[0] === where ? ' on' : ''}" data-ca="where" data-v="${w[0]}">${esc(w[1])}</button>`).join('')}</div></div>
  <div class="cp-fld"><span>Photo</span>
    <div class="cp-photo"><div class="cp-thumb" data-ca="thumb">No photo</div>
      <button type="button" class="cp-chip" data-ca="photo">Add photo</button>
      <input type="file" data-ca="file" accept="image/jpeg,image/png,image/webp" hidden></div></div>
  <label class="cp-fld"><span>Item name</span><input data-ca="name" type="text" autocomplete="off"></label>
  <label class="cp-fld"><span>Price (£)</span><input data-ca="price" type="number" step="0.01" inputmode="decimal" autocomplete="off"></label>
  <label class="cp-fld"><span>Description (optional)</span><input data-ca="description" type="text" autocomplete="off"></label>
  <label class="cp-fld"><span>Sizes, comma separated (optional)</span><input data-ca="sizes" type="text" placeholder="S, M, L" autocomplete="off"></label>
  <label class="cp-fld"><span>Colours, comma separated (optional)</span><input data-ca="colours" type="text" placeholder="Navy, Black" autocomplete="off"></label>
  <label class="cp-fld" data-ca="catrow" ${where === 'school' ? '' : 'hidden'}><span>School name</span><input data-ca="category" type="text" autocomplete="off"></label>
  <div class="cp-note" data-ca="note" role="status"></div>
  <button type="button" class="cp-btn" data-ca="add">Add item</button></div>`;

export function mountAddItem(o) {
  if (!o || !o.el || !o.rpc) throw new Error('PS-711: mountAddItem needs el and rpc');
  let where = WHERE.some(w => w[0] === o.where) ? o.where : 'workwear', photoUrl = '', busy = false;
  const toast = o.toast || (() => {});
  const q = n => o.el.querySelector(`[data-ca="${n}"]`);
  const say = (cls, msg) => { q('note').className = 'cp-note show ' + cls; q('note').textContent = msg; };
  const paint = () => {
    o.el.innerHTML = formHtml(where);
    if (photoUrl) { q('thumb').innerHTML = `<img src="${esc(photoUrl)}" alt="">`; q('photo').textContent = 'Replace photo'; }
  };
  paint();

  o.el.addEventListener('click', async e => {
    const w = e.target.closest('[data-ca="where"]');
    if (w) { where = w.dataset.v; if (o.onWhere) o.onWhere(where); const keep = ['name', 'price', 'description', 'sizes', 'colours'].map(n => q(n).value); paint(); ['name', 'price', 'description', 'sizes', 'colours'].forEach((n, i) => { q(n).value = keep[i]; }); return; }
    if (e.target.closest('[data-ca="photo"]')) { q('file').click(); return; }
    if (e.target.closest('[data-ca="add"]') && !busy) await add();
  });

  o.el.addEventListener('change', async e => {
    if (e.target !== q('file') || !e.target.files[0]) return;
    const f = e.target.files[0];
    e.target.value = '';
    busy = true; say('busy', 'Uploading photo…');
    try {
      photoUrl = await uploadPhoto(await downscale(f), { pin: o.pin ? o.pin() : '', key: newPhotoKey() });
      q('thumb').innerHTML = `<img src="${esc(photoUrl)}" alt="">`; q('photo').textContent = 'Replace photo';
      say('ok', 'Photo ready.');
    } catch (err) { say('err', "Couldn't upload that photo (" + err.message.slice(0, 6) + ')'); }
    busy = false;
  });

  async function add() {
    let params;
    try {
      params = productParams({
        where, name: q('name').value, price: q('price').value, description: q('description').value, sizes: q('sizes').value,
        colours: q('colours').value, category: q('category').value, image_url: photoUrl,
        sort_order: o.sortOrder ? o.sortOrder(where) : 0
      });
    } catch (err) { say('err', err.message); return; }
    busy = true; say('busy', 'Adding…');
    try {
      const row = await o.rpc('ps_admin_create_shop_product', params);
      const label = WHERE.find(w => w[0] === where)[1];
      photoUrl = '';
      paint();
      say('ok', 'Added. It is live on ' + (where === 'school' ? 'the school shop.' : 'the ' + label + ' page.'));
      toast('Item added');
      if (o.onAdded) o.onAdded(row, where);
    } catch (err) { say('err', "Couldn't add that (PS-704)."); }
    busy = false;
  }
}
