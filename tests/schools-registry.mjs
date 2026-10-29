/* Job 03: the school list comes from the ps_schools registry.
   No network, no browser (vm + fake DOM). Run: node tests/schools-registry.mjs */
import vm from "node:vm";
import fs from "node:fs";

let pass = 0, fail = 0;
const check = (name, ok) => { ok ? pass++ : (fail++, console.log("FAIL", name)); };

const JO = ["Barnard Grove Primary School","Brougham Primary School","Clavering Primary School","Eldon Grove Academy","Eskdale Academy","Fens Primary School","Golden Flatts Primary School","Grange Primary School","Greatham Church of England Primary School","Hart Primary School","Holy Trinity Church of England Primary School","Jesmond Gardens Primary School","Kingsley Primary School","Lynnfield Primary School","Rift House Primary School","Rossmere Academy","Sacred Heart Catholic Primary School","St Aidan's Church of England Memorial Primary School","St Bega's Catholic Primary School","St Cuthbert's Catholic Primary School","St John Vianney Catholic Primary School","St Joseph's Catholic Primary School","St Teresa's Catholic Primary School","St. Helen's Primary School","St. Peter's Elwick Church of England Primary School","Stranton Primary School","Throston Primary School","Ward Jackson Church of England Primary School","West Park Primary School","West View Primary School"];
const slug = n => n.toLowerCase().replace(/[.']/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const REG = JO.map((name, i) => ({ name, slug: slug(name), phase: "primary", crest_url: name === "Hart Primary School" ? "https://x/hart.png" : null, sort_order: (i + 1) * 10 }));

function makeCtx(sbImpl){
  const els = {};
  const el = id => els[id] || (els[id] = { id, innerHTML: "", textContent: "", className: "", value: "", style: {}, contains(){ return false; } });
  const ctx = vm.createContext({
    document: { getElementById: el, addEventListener(){}, activeElement: null, querySelector(){ return null; } },
    sessionStorage: { getItem(){ return null; }, setItem(){} },
    toast(){}, healthCheck: async () => true, location: {}, console: { log: console.log, error(){} },
    sb: sbImpl, listShopProducts: async () => [], phaseIcon: p => `<svg data-p="${p}"></svg>`
  });
  for(const f of ["js/escape.js", "js/schools-registry.js", "js/schools-shop.js"]) vm.runInContext(fs.readFileSync(f, "utf8"), ctx, { filename: f });
  return { ctx, els, run: c => vm.runInContext(c, ctx) };
}
const mk = (id, name, category) => ({ id, name, category, price: 10, is_school_item: true, sizes: "4-5", colours: "Grey" });
const unesc = t => t.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const names = html => [...html.matchAll(/<span class="su-school-name">([^<]*)<\/span>/g)].map(m => unesc(m[1]));
const init = async (run, products) => { run(`ALL_PRODUCTS = ${JSON.stringify(products)}`); await run("loadSchoolRegistry()"); run(`SCHOOLS = buildSchoolList(Object.keys(groupBySchool(ALL_PRODUCTS)))`); };

check("fixture: Jo's list is 30", JO.length === 30);
check("slug: St. Helen's -> st-helens-primary-school", slug("St. Helen's Primary School") === "st-helens-primary-school");
check("slug: St John Vianney -> st-john-vianney-catholic-primary-school", slug("St John Vianney Catholic Primary School") === "st-john-vianney-catholic-primary-school");
check("slugs unique", new Set(REG.map(r => r.slug)).size === 30);

// 1. all 30, Jo's exact names and order, with only 3 having products
{
  const products = [mk("1","Cardigan","Fens Primary School"), mk("2","Sweatshirt","Rossmere Academy"), mk("3","Polo","St John Vianney Catholic Primary School"), mk("s","Grey Trousers","All Schools")];
  const { els, run } = makeCtx(async path => { check("PS-510 read targets ps_schools, active only", path.startsWith("ps_schools?") && path.includes("active=eq.true")); return REG; });
  await init(run, products);
  run(`selectPhase("primary")`);
  const shown = names(els["su-tabs"].innerHTML);
  check("30 schools in Primary", shown.length === 30);
  check("Jo's exact names, Jo's order", JSON.stringify(shown) === JSON.stringify(JO));
  check("St. Helen's keeps its punctuation", shown.includes("St. Helen's Primary School") && shown.includes("St John Vianney Catholic Primary School"));
  check("Academies are primary via the phase column", ["Eldon Grove Academy","Eskdale Academy","Rossmere Academy"].every(n => run(`classifyPhase(${JSON.stringify(n)})`) === "primary"));
  check("All Schools is not a school", !shown.includes("All Schools"));
  check("Hart crest comes from registry", run(`schoolCircle("Hart Primary School")`).includes("https://x/hart.png"));
  check("No crest -> initials", run(`schoolCircle("Brougham Primary School")`).includes(">BP<"));
  // 2. empty school: friendly line, shared rows still orderable, no error
  run(`selectSchool("Brougham Primary School")`);
  check("empty school shows friendly line", els["su-list"].innerHTML.includes("No uniform listed for this school yet"));
  check("empty school still lists shared item", els["su-list"].innerHTML.includes('data-item="s"'));
  run(`selectSchool("Fens Primary School")`);
  check("school with items has no empty line", !els["su-list"].innerHTML.includes("No uniform listed"));
  // St Aidan's apostrophe round-trips through the data-school attribute (no inline JS)
  run(`selectPhase("primary")`);
  check("apostrophe names escaped in data-school", els["su-tabs"].innerHTML.includes('data-school="St Aidan&#39;s Church of England Memorial Primary School"') && !els["su-tabs"].innerHTML.includes("onclick"));
  run(`selectSchool("St Aidan's Church of England Memorial Primary School")`);
  check("apostrophe school selectable", run("activeSchool") === "St Aidan's Church of England Memorial Primary School");
}

// 3. products not in the registry stay visible under Other (e.g. Needs Sorting)
{
  const { els, run } = makeCtx(async () => REG);
  await init(run, [mk("n","Purple Cardigan","Needs Sorting"), mk("t","Typo","Fenns Primary School")]);
  run(`selectPhase("other")`);
  const shown = names(els["su-tabs"].innerHTML);
  check("unknown categories land in Other, visible", shown.includes("Needs Sorting") && shown.includes("Fenns Primary School"));
  check("Needs Sorting keeps no crest option", run(`isCrestedItem(${JSON.stringify(mk("n","x","Needs Sorting"))})`) === false);
}

// 4. registry down / empty: never throws, shop still shows schools from products
for(const [label, impl] of [["read fails", async () => { throw new Error("PS-510"); }], ["table empty", async () => []]]){
  const { els, run } = makeCtx(impl);
  await init(run, [mk("1","Cardigan","Fens Primary School"), mk("2","Sweatshirt","Eldon Grove Academy")]);
  run(`renderPhases()`);
  check(`${label}: no throw, falls back to product schools`, JSON.stringify(run("SCHOOLS")) === JSON.stringify(["Fens Primary School","Eldon Grove Academy"]));
  check(`${label}: primary circle still shown`, els["su-phases"].innerHTML.includes("Primary Schools, 2 schools"));
}

// 5. adding a 31st school needs no code change
{
  const { els, run } = makeCtx(async () => REG.concat([{ name: "New Test Primary School", slug: "new-test-primary-school", phase: "primary", crest_url: null, sort_order: 310 }]));
  await init(run, []);
  run(`selectPhase("primary")`);
  const shown = names(els["su-tabs"].innerHTML);
  check("31st school appears with no code change", shown.length === 31 && shown[30] === "New Test Primary School");
}

// 6. secondary phase from the same table (Job 08 hook)
{
  const { els, run } = makeCtx(async () => REG.concat([{ name: "Example High School", slug: "example-high-school", phase: "secondary", crest_url: null, sort_order: 400 }]));
  await init(run, []);
  run(`renderPhases()`);
  check("secondary circle appears from registry", els["su-phases"].innerHTML.includes("Secondary Schools, 1 school"));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
