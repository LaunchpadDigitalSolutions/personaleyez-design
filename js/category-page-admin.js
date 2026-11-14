/* Launchpad Feature — Category page: "add an item to a page" form for the admin.

   Two steps:
     Step 1: destination chips (school, workwear, sportswear, gifts, clubshop).
     Step 2: product fields (name, price, sizes, colours, photo, allow_notes toggle).

   School uniform reveals a school <select> from ps_schools (passed as o.schools).
   Selecting "A club shop" shows a redirect message — no form, no insert.

   mountAddItem({
     el, rpc: (name, params) => Promise, pin: () => string,
     sortOrder: where => number, onAdded: (row, where) => {}, toast: msg => {},
     where: 'workwear',
     onWhere: where => {},
     schools: ['School A', 'School B', …]  // from ps_schools, incl. 'All schools (shared)'
   })
   Error codes: PS-703 upload, PS-704 create.
*/

export const WHERE = [
  ['school', 'School uniform'], ['workwear', 'Workwear'],
  ['sportswear', 'Sportswear'], ['gifts', 'Gifts & Accessories'],
  ['clubshop', 'A club shop']
];

const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const orNull = v => (String(v ?? '').trim() || null);

export function productParams(f) {
  if (f.where === 'clubshop') throw new Error('Use the Club shops tab to add club products.');
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
    p_is_school_item: school, p_page_key: school ? null : f.where,
    p_allow_notes: !!f.allow_notes
  };
}

export function newPhotoKey() {
  const c = globalThis.crypto;
  return 'shop-' + (c && c.randomUUID ? c.randomUUID() : Date.now().toString(36) + Math.random().toString(16).slice(2));
}

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

const schoolOptions = (schools, chosen) =>
  `<option value="">Choose a school…</option>` +
  schools.map(s => `<option value="${esc(s)}"${s === chosen ? ' selected' : ''}>${esc(s)}</option>`).join('');

export const formHtml = (where, { photoUrl = '', schools = [] } = {}) => {
  if (where === 'clubshop') {
    return `<div class="cp-admin">
  <h2>Add a shop item</h2>
  <div class="cp-fld"><span>Where does it go?</span>
    <div class="cp-chips">${WHERE.map(w => `<button type="button" class="cp-chip${w[0] === where ? ' on' : ''}" data-ca="where" data-v="${w[0]}">${esc(w[1])}</button>`).join('')}</div></div>
  <div class="cp-note show info">Club shop products are managed in the <strong>Club shops</strong> tab above. Tap that tab to add or change items.</div>
</div>`;
  }
  return `<div class="cp-admin">
  <h2>Add a shop item</h2>
  <div class="cp-fld"><span>Where does it go?</span>
    <div class="cp-chips">${WHERE.map(w => `<button type="button" class="cp-chip${w[0] === where ? ' on' : ''}" data-ca="where" data-v="${w[0]}">${esc(w[1])}</button>`).join('')}</div></div>
  <div class="cp-fld"><span>Photo</span>
    <div class="cp-photo"><div class="cp-thumb" data-ca="thumb">${photoUrl ? `<img src="${esc(photoUrl)}" alt="">` : 'No photo'}</div>
      <button type="button" class="cp-chip" data-ca="photo">${photoUrl ? 'Replace photo' : 'Add photo'}</button>
      <input type="file" data-ca="file" accept="image/jpeg,image/png,image/webp" hidden></div></div>
  <label class="cp-fld"><span>Item name</span><input data-ca="name" type="text" autocomplete="off"></label>
  <label class="cp-fld"><span>Price (£)</span><input data-ca="price" type="number" step="0.01" inputmode="decimal" autocomplete="off"></label>
  <label class="cp-fld"><span>Description (optional)</span><input data-ca="description" type="text" autocomplete="off"></label>
  <label class="cp-fld"><span>Sizes, comma separated (optional)</span><input data-ca="sizes" type="text" placeholder="S, M, L" autocomplete="off"></label>
  <label class="cp-fld"><span>Colours, comma separated (optional)</span><input data-ca="colours" type="text" placeholder="Navy, Black" autocomplete="off"></label>
  <div class="cp-fld" data-ca="catrow" ${where === 'school' ? '' : 'hidden'}><span>School</span>
    ${schools.length
      ? `<select data-ca="category">${schoolOptions(schools, '')}</select>`
      : `<input data-ca="category" type="text" placeholder="School name" autocomplete="off">`
    }</div>
  <label class="cp-fld cp-toggle"><input type="checkbox" data-ca="allow_notes"> <span>Customers can add a personalisation note</span></label>
  <div class="cp-note" data-ca="note" role="status"></div>
  <button type="button" class="cp-btn" data-ca="add">Add item</button></div>`;
};

export function mountAddItem(o) {
  if (!o || !o.el || !o.rpc) throw new Error('PS-711: mountAddItem needs el and rpc');
  let where = WHERE.some(w => w[0] === o.where) ? o.where : 'workwear';
  let photoUrl = '', busy = false;
  const toast = o.toast || (() => {});
  const schools = o.schools || [];
  const q = n => o.el.querySelector(`[data-ca="${n}"]`);
  const say = (cls, msg) => { q('note').className = 'cp-note show ' + cls; q('note').textContent = msg; };
  const paint = () => { o.el.innerHTML = formHtml(where, { photoUrl, schools }); };
  paint();

  o.el.addEventListener('click', async e => {
    const w = e.target.closest('[data-ca="where"]');
    if (w) {
      where = w.dataset.v;
      if (o.onWhere) o.onWhere(where);
      const keep = ['name', 'price', 'description', 'sizes', 'colours'].map(n => { const el = q(n); return el ? el.value : ''; });
      paint();
      ['name', 'price', 'description', 'sizes', 'colours'].forEach((n, i) => { const el = q(n); if (el) el.value = keep[i]; });
      return;
    }
    if (e.target.closest('[data-ca="photo"]')) { const f = q('file'); if (f) f.click(); return; }
    if (e.target.closest('[data-ca="add"]') && !busy) await add();
  });

  o.el.addEventListener('change', async e => {
    if (e.target !== q('file') || !e.target.files[0]) return;
    const f = e.target.files[0]; e.target.value = '';
    busy = true; say('busy', 'Uploading photo…');
    try {
      photoUrl = await uploadPhoto(await downscale(f), { pin: o.pin ? o.pin() : '', key: newPhotoKey() });
      const thumb = q('thumb');
      if (thumb) { thumb.innerHTML = `<img src="${esc(photoUrl)}" alt="">`; }
      const btn = q('photo'); if (btn) btn.textContent = 'Replace photo';
      say('ok', 'Photo ready.');
    } catch (err) { say('err', "Couldn't upload that photo (" + err.message.slice(0, 6) + ')'); }
    busy = false;
  });

  async function add() {
    let params;
    try {
      const noteEl = q('allow_notes');
      params = productParams({
        where,
        name: q('name') ? q('name').value : '',
        price: q('price') ? q('price').value : '',
        description: q('description') ? q('description').value : '',
        sizes: q('sizes') ? q('sizes').value : '',
        colours: q('colours') ? q('colours').value : '',
        category: q('category') ? q('category').value : '',
        image_url: photoUrl,
        sort_order: o.sortOrder ? o.sortOrder(where) : 0,
        allow_notes: noteEl ? noteEl.checked : false
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
