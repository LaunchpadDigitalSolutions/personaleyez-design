/* ============================================================
   admin-photo-history.js — keep earlier photos selectable in the
   Schools tab. Replacing a school item's photo used to overwrite the
   one stored file, so the old photo vanished from the list. Now each
   upload in this tab is saved under its own key (functions/api/
   photo-history.js) and the Photo dropdown offers the earlier ones.
   Wraps schEdit / schUpload from admin-schools.js, which stays as is.
   Error codes: PS-620 list earlier photos, PS-621 upload.
   ============================================================ */

const phApi = {
  pin: () => { try { return sessionStorage.getItem("ps_admin_pin") || ""; } catch (e) { return ""; } },
  async list(itemId) {
    const res = await fetch("/api/photo-history", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: phApi.pin(), item_id: itemId }) });
    const data = await res.json();
    if (!res.ok) throw new Error("PS-620");
    return data.photos || [];
  },
  async upload(itemId, file) {
    const form = new FormData();
    form.append("pin", phApi.pin()); form.append("item_id", itemId); form.append("file", file);
    const res = await fetch("/api/photo-history", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) throw new Error("PS-621");
    return data.photo_url;
  }
};

const phBase = u => String(u || "").split("?")[0];
const phWhen = ts => new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

(function () {
  const _edit = schEdit;
  schEdit = function (id) {
    _edit.apply(this, arguments);
    phApi.list(id).then(photos => {
      if (!schForm || schForm.id !== id || schView !== "form") return;
      const have = new Set([phBase(schForm.cur), ...schForm.alts.map(a => phBase(a.url))]);
      photos.forEach(p => {
        if (have.has(p.url)) return;
        have.add(p.url);
        schForm.alts.push({ url: p.url, label: "Earlier photo (" + phWhen(p.uploaded) + ")" });
      });
      if (photos.length) render();
    }).catch(() => { /* earlier photos are a bonus: the form works without them */ });
  };

  schUpload = async function (event) {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;
    const n = $("sch-notice");
    n.className = "notice show busy"; n.textContent = "Uploading…";
    try {
      schForm.photoUrl = await phApi.upload(schForm.id, file); schForm.photo = "new";
      render(); schShown();
    } catch (e) { n.className = "notice show err"; n.textContent = "Couldn't upload that photo. Try a different one. (PS-621)"; }
  };
})();
