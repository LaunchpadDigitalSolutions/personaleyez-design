/* Checks js/nav-fit.js: the header drops to the burger when logo + menu + phone/Enquire do not fit, and never otherwise.
   Runs the real file in a stub page (no browser): fake measurements stand in for layout.
   Layout used: 44px padding both sides, logo 210, 20px gaps, phone/Enquire 209, menu N. The bar needs 547 + N layout px.
   Run: npm run test:menu */
import { readFile, readdir } from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const rd = f => readFile(new URL('../' + f, import.meta.url), 'utf8');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const src = await rd('js/nav-fit.js');

function page({ win = 1280, layout = 1265, nav = 684, panelOpen = false, noHeader = false, navOverflow = 0 } = {}) {
  const st = { win, layout, nav, navOverflow, toggles: 0, compact: false, handlers: {}, observers: [], panelOpen, warn: [] };
  const edge = () => st.layout - 44;
  const el = {
    inner: { getBoundingClientRect: () => ({ right: st.layout }) },
    nav: { get scrollWidth() { return st.nav + st.navOverflow; }, get clientWidth() { return st.nav; } },
    acts: { getBoundingClientRect: () => ({ right: 44 + 210 + 20 + st.nav + 20 + 209 }) }
  };
  const classes = { add: c => { if (c === 'nav-compact') st.compact = true; }, remove: c => { if (c === 'nav-compact') st.compact = false; } };
  const ctx = vm.createContext({
    console: { warn: (...a) => st.warn.push(a) }, setTimeout, clearTimeout, parseFloat,
    toggleNav: () => { st.toggles++; st.panelOpen = !st.panelOpen; },
    getComputedStyle: () => ({ paddingRight: '44px' }),
    MutationObserver: class { constructor(cb) { this.cb = cb; st.observers.push(this); } observe() {} },
    document: {
      readyState: 'complete', body: { classList: classes },
      fonts: { ready: Promise.resolve() },
      querySelector: s => noHeader ? null : ({ '.header-inner': el.inner, '.nav-desktop': el.nav, '.header-actions': el.acts })[s] || null,
      getElementById: id => id === 'site-header' ? {} : id === 'nav-mobile' ? { classList: { contains: c => c === 'open' && st.panelOpen } } : null,
      addEventListener() {}
    },
    addEventListener: (e, f) => { st.handlers[e] = f; }
  });
  ctx.window = ctx; ctx.matchMedia = q => ({ matches: st.win >= +q.match(/\d+/)[0] });
  vm.runInContext(src, ctx);
  st.ctx = ctx; st.check = () => ctx.NavFit.check();
  return st;
}

/* ---- the decision ---- */
ok(!page({ win: 1280, layout: 1265 }).compact, '1280 window, default menu: full bar');
ok(!page({ win: 1246, layout: 1231 }).compact, 'exactly enough room: full bar');
ok(page({ win: 1240, layout: 1225 }).compact, '1240 window (6px short): burger');
ok(page({ win: 1200, layout: 1185 }).compact, '1200 window: burger');
ok(page({ win: 1100, layout: 1085 }).compact, '1100 window: burger');
ok(page({ win: 1000, layout: 985 }).compact, '1000 window: burger');
ok(!page({ win: 900, layout: 885 }).compact, 'below 1000 style.css already shows the burger: nothing to do');
ok(page({ win: 1280, layout: 1265, nav: 944 }).compact, 'a long custom page in the menu pushes the switch wider');
ok(!page({ win: 1520, layout: 1505, nav: 944 }).compact, 'a long menu keeps the full bar when the layout has room (the real header is capped at 1320px, so in practice it switches)');
ok(page({ win: 1280, layout: 1265, navOverflow: 30 }).compact, 'a menu wider than its own box also switches');

/* ---- safety ---- */
const nh = page({ noHeader: true }); ok(!nh.compact && nh.toggles === 0, 'a page with no header is left alone');
const open1 = page({ win: 1280, layout: 1265, panelOpen: true }); ok(open1.toggles === 1 && !open1.panelOpen, 'full bar showing: a stuck phone panel is closed');
const open2 = page({ win: 1100, layout: 1085, panelOpen: true }); ok(open2.toggles === 0 && open2.panelOpen, 'burger showing: an open panel stays open');

/* ---- re-checks ---- */
const r = page({ win: 1280, layout: 1265 }); ok(!r.compact, 'starts as the full bar');
r.win = 1100; r.layout = 1085; r.handlers.resize(); await sleep(80); ok(r.compact, 'resize to a narrower window switches to the burger');
r.win = 1400; r.layout = 1385; r.handlers.resize(); await sleep(80); ok(!r.compact, 'resize back to wide returns to the full bar');
r.nav = 944; r.observers[0].cb(); await sleep(80); ok(r.compact, 'editing a label longer redraws the header and re-checks');
ok(typeof r.handlers.load === 'function', 'also re-checks when images and fonts have loaded');
const b = page({ win: 1280, layout: 1265 });
ok(b.observers.length === 1, 'watches the header for redraws');

/* ---- source contracts ---- */
ok(src.split('\n').length < 300, 'nav-fit.js stays under 300 lines');
ok(!/\.(innerHTML|textContent|innerText)\s*=/.test(src), 'nav-fit.js never rewrites or shortens a label');
ok(src.includes('PS-730'), 'nav-fit.js reports its error code');
const css = await rd('css/nav-dropdown-theme.css');
ok(css.split('\n').length < 200, 'theme css stays under 200 lines');
ok(/body\.nav-compact \.nav-desktop,body\.nav-compact \.header-actions\{display:none\}/.test(css) && /body\.nav-compact \.burger\{display:flex\}/.test(css) && /body\.nav-compact \.nav-mobile\{display:block\}/.test(css), 'compact mode hides the bar and shows the burger and panel');
ok(/\.nav-desktop>a,\.nav-desktop \.nd-parent\{white-space:nowrap\}/.test(css) && !/text-overflow:ellipsis/.test(css), 'labels never wrap and are never cut with an ellipsis');
let withHeader = 0;
for (const f of (await readdir(new URL('../', import.meta.url))).filter(x => x.endsWith('.html'))) {
  const h = await rd(f);
  if (!h.includes('id="site-header"')) continue;
  withHeader++;
  ok(/<script src="js\/partials\.js[^"]*"><\/script>\s*<script src="js\/nav-fit\.js[^"]*"><\/script>/.test(h), f + ' loads nav-fit.js right after partials.js');
}
ok(withHeader >= 17, 'checked every page with a header (' + withHeader + ')');
console.log(n + ' checks passed');
