/* Job 16: admin "Not shown to customers" section. No browser, no network (vm + stubs).
   Run: node tests/schools-hidden-admin.mjs */
import vm from "node:vm";
import fs from "node:fs";
let pass = 0, fail = 0;
const check = (n, ok) => { ok ? pass++ : (fail++, console.log("FAIL", n)); };

const ctx = vm.createContext({
  esc: v => v == null ? "" : String(v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])),
  money: n => n == null ? "—" : "£" + Number(n).toFixed(2),
  plural: (n, w) => n + " " + w + (Number(n) === 1 ? "" : "s"),
  catThumb: c => c.image_url ? `<img src="${c.image_url}">` : `<div>No photo</div>`,
  schList: [{ name: "Fens Primary School" }, { name: "Hart Primary School" }],
  schAll: [], schListHtml: () => "<LIST>"
});
vm.runInContext(fs.readFileSync("js/admin-schools-hidden.js", "utf8"), ctx, { filename: "js/admin-schools-hidden.js" });
const run = c => vm.runInContext(c, ctx);
const set = items => { ctx.schAll = items; };
const it = (id, name, category, price, extra) => Object.assign({ id, name, category, price, image_url: null, active: true }, extra || {});

set([it("1", "Cardigan", "Fens Primary School", 14), it("2", "Grey Trousers", "All Schools", 9.5), it("3", "Polo", "Hart Primary School", 8)]);
check("nothing unmatched: empty state", run("schListHtml()").includes("Nothing here. Every school item is linked to a school."));
check("nothing unmatched: no warning box", !run("schListHtml()").includes("Not shown to customers</div><span") && !run("schListHtml()").includes("EF9F27"));

set([
  it("1", "Cardigan", "Fens Primary School", 14), it("2", "Grey Trousers", "All Schools", 9.5),
  it("3", "Royal Blue V Neck Sweatshirt", "Needs Sorting", 14), it("4", null, "Needs Sorting", null), it("5", "  ", "Needs Sorting", 12),
  it("6", "Navy Polo", "Fenns Primary School", 8), it("7", "Old", "Needs Sorting", 5, { active: false })
]);
const hidden = run("schHiddenItems(schList, schAll)");
check("only unmatched active items listed", JSON.stringify(hidden.map(i => i.id)) === JSON.stringify(["3", "4", "5", "6"]));
check("registry schools never listed", !hidden.some(i => i.category === "Fens Primary School"));
check("All Schools shared rows never listed", !hidden.some(i => i.category === "All Schools"));
const html = run("schListHtml()");
check("original list kept", html.startsWith("<LIST>"));
check("count shown", html.includes("4 items"));
check("unnamed shows (unnamed item), twice", (html.match(/\(unnamed item\)/g) || []).length === 2);
check("no price shown as No price", html.includes("No price"));
check("typo flagged as no matching school", html.includes("Fenns Primary School") && html.includes("(no matching school)"));
check("Needs Sorting not flagged as a typo", !/Needs Sorting <span/.test(html));
check("paused item not listed", !html.includes(">Old<"));
check("explains what to do", html.includes("Tell Josh which school each one belongs to"));
set([it("9", "<b>x</b>", "Needs Sorting", 1)]);
check("names escaped", run("schListHtml()").includes("&lt;b&gt;x&lt;/b&gt;"));
set([]);
check("empty data does not throw", run("schListHtml()").includes("Nothing here"));
check("under 300 lines", fs.readFileSync("js/admin-schools-hidden.js", "utf8").split("\n").length < 300);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
