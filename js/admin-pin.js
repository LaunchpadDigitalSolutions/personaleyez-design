/* ============================================================
   admin-pin.js — the PIN screen's lockout messages.
   Loaded after admin.js, so it replaces admin.js's tryPin().
   The locking itself happens on the server (functions/_middleware.js);
   this only shows tries left, the lockout countdown and the
   "contact Josh" line. Error codes: PS-ADMIN-AUTH, PS-ADMIN-LOCKED
   ============================================================ */
let pinLockTimer = null;
let pinOriginal = null;

function pinEls() {
  return {
    h: document.querySelector(".pinbox h1"), p: document.querySelector(".pinbox p"),
    input: document.getElementById("pin"), btn: document.getElementById("pinbtn"),
    err: document.getElementById("pinerr")
  };
}
function pinClock(s) {
  return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
}
function pinMessage(text) {
  const e = pinEls();
  e.err.textContent = text;
  e.err.classList.add("show");
}

// Locked: disable the screen, count down, and check every 15s in case Josh unlocked it.
function pinLock(seconds) {
  const e = pinEls();
  if (!pinOriginal) pinOriginal = { h: e.h.textContent, p: e.p.textContent };
  clearInterval(pinLockTimer);
  const end = Date.now() + seconds * 1000;
  let ticks = 0;
  e.h.textContent = "Locked";
  e.input.disabled = true; e.btn.disabled = true; e.input.value = "";
  pinMessage("Can't wait? Contact Josh and he'll unlock it straight away.");
  const tick = async () => {
    const left = Math.max(0, Math.round((end - Date.now()) / 1000));
    e.p.textContent = "Too many wrong PINs. Try again in " + pinClock(left);
    ticks++;
    if (left === 0 || (ticks % 15 === 0 && !(await pinCheckLocked()))) pinUnlockScreen();
  };
  tick();
  pinLockTimer = setInterval(tick, 1000);
}
function pinUnlockScreen() {
  clearInterval(pinLockTimer);
  const e = pinEls();
  if (pinOriginal) { e.h.textContent = pinOriginal.h; e.p.textContent = pinOriginal.p; }
  e.err.classList.remove("show");
  e.input.disabled = false; e.btn.disabled = false; e.input.focus();
}

// Asks the server if this connection is locked. Costs no tries.
async function pinCheckLocked() {
  try {
    const res = await fetch("/api/admin", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rpc: "status" })
    });
    return res.status === 429;
  } catch (e) { return true; } // can't tell: stay locked
}

async function tryPin() {
  const e = pinEls();
  const v = e.input.value.trim();
  e.btn.disabled = true;
  let res = null, data = {};
  try {
    res = await fetch("/api/admin", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: v, rpc: "ping" })
    });
    try { data = await res.json(); } catch (x) { data = {}; }
  } catch (x) { res = null; }

  if (res && res.ok) {
    try { sessionStorage.setItem("ps_admin_pin", v); } catch (x) {}
    e.err.classList.remove("show");
    unlockAdmin();
    return;
  }
  if (res && res.status === 429) { pinLock(data.retry_after || 900); return; }

  if (res && res.status === 401) {
    const n = data.tries_left;
    if (n === 1) pinMessage("That's not right. 1 try left before this locks.");
    else if (n > 1) pinMessage("That's not right. " + n + " tries left.");
    else pinMessage("That's not right. Try again.");
  } else {
    pinMessage("Couldn't reach the order system. Try again.");
  }
  e.input.value = "";
  e.input.focus();
  e.btn.disabled = false;
}

// If this connection is already locked, show that straight away.
document.addEventListener("DOMContentLoaded", async () => {
  const gate = document.getElementById("pingate");
  if (!gate || gate.classList.contains("hidden")) return;
  try {
    const res = await fetch("/api/admin", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rpc: "status" })
    });
    if (res.status === 429) { const d = await res.json(); pinLock(d.retry_after || 900); }
  } catch (x) { /* offline: normal screen */ }
});
