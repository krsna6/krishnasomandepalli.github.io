// Checks Werk's data (m/data) against m/AGENTS.md and the atlas: run `node tools/werk/validate.mjs`.
// Exits 1 with one line per problem, naming the file and entry, so an agent can fix exactly that.
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));
const problems = [];
const bad = (where, msg) => problems.push(`${where}: ${msg}`);

const atlas = new Set(read("m/model/manifest.json").muscles.map((o) => o.name.replace(/\.(l|r)$/, "")));
const ex = read("m/data/exercises.json");
for (const [name, e] of Object.entries(ex.exercises)) {
  for (const role of ["primary", "secondary", "stabilizers"]) {
    if (!Array.isArray(e[role])) bad(`exercises.json "${name}"`, `"${role}" must be a list`);
    else for (const m of e[role]) if (!atlas.has(m)) bad(`exercises.json "${name}"`, `"${m}" is not a muscle in the atlas`);
  }
  if (!["draft", "reviewed"].includes(e.status)) bad(`exercises.json "${name}"`, `status must be "draft" or "reviewed"`);
}
const seen = new Map();
for (const r of ex.regions || []) for (const g of r.groups) for (const m of g.parts) {
  if (!atlas.has(m)) bad(`exercises.json group "${r.region} / ${g.name}"`, `"${m}" is not a muscle in the atlas`);
  if (seen.has(m)) bad(`exercises.json group "${g.name}"`, `"${m}" is already in group "${seen.get(m)}"`); else seen.set(m, g.name);
}
for (const r of ex.regions || []) for (const g of r.groups) if (!["front", "back"].includes(g.view)) bad(`exercises.json group "${g.name}"`, `"view" must be "front" or "back"`);
if (!Array.isArray(ex.regions)) bad("exercises.json", `"regions" must be a list`);
// every muscle an exercise names should be readable in some group
for (const [name, e] of Object.entries(ex.exercises)) for (const m of [...(e.primary || []), ...(e.secondary || [])]) if (!seen.has(m)) bad(`exercises.json "${name}"`, `"${m}" is in no group`);
const names = new Set(Object.keys(ex.exercises));

const prof = read("m/data/profile.json");
for (const k of ["age", "height_in", "weight_lb"]) if (typeof prof[k] !== "number" || prof[k] <= 0) bad("profile.json", `"${k}" must be a positive number`);
if (!/^\d{4}-\d{2}-\d{2}$/.test(prof.as_of || "")) bad("profile.json", `"as_of" must be YYYY-MM-DD`);

const isNum = (v, lo, hi) => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
const perSet = (v, sets, lo, hi) => isNum(v, lo, hi) || (Array.isArray(v) && v.length === sets && v.every((x) => isNum(x, lo, hi)));
const ALLOWED = new Set(["date", "exercise", "sets", "reps", "weight_lb", "rir", "note", "unmapped"]);
const dir = path.join(root, "m/data/log");
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
  const where0 = `log/${f}`;
  if (!/^\d{4}-\d{2}\.json$/.test(f)) { bad(where0, "file name must be YYYY-MM.json"); continue; }
  let doc;
  try { doc = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch (e) { bad(where0, `not valid JSON (${e.message})`); continue; }
  const month = f.slice(0, 7);
  if (doc.month !== month) bad(where0, `"month" must be "${month}"`);
  if (!Array.isArray(doc.entries)) { bad(where0, `"entries" must be a list`); continue; }
  if (doc.sessions !== undefined) {
    if (!Array.isArray(doc.sessions)) bad(where0, `"sessions" must be a list`);
    else doc.sessions.forEach((x, i) => {
      const w = `${where0} session ${i + 1}${x && x.date ? ` (${x.date})` : ""}`;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(x.date || "") || !x.date.startsWith(month)) bad(w, `"date" must be YYYY-MM-DD in ${month}`);
      if (x.duration !== undefined && !/^(\d+:)?\d{1,2}:\d{2}(\.\d+)?$/.test(x.duration)) bad(w, `"duration" must be m:ss or h:mm:ss as the watch shows it`);
      for (const k of ["active_cal", "total_cal"]) if (x[k] !== undefined && !isNum(x[k], 0, 10000)) bad(w, `"${k}" must be a number of kilocalories`);
    });
  }
  let last = "";
  doc.entries.forEach((e, i) => {
    const where = `${where0} entry ${i + 1}${e && e.exercise ? ` (${e.date} ${e.exercise})` : ""}`;
    if (!e || typeof e !== "object") return bad(where, "must be an object");
    for (const k of Object.keys(e)) if (!ALLOWED.has(k)) bad(where, `unknown field "${k}"`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date || "") || isNaN(Date.parse(e.date))) bad(where, `"date" must be YYYY-MM-DD`);
    else if (!e.date.startsWith(month)) bad(where, `date ${e.date} is not in ${month}`);
    else { if (e.date < last) bad(where, "entries must be in date order"); last = e.date; }
    if (typeof e.exercise !== "string" || !e.exercise.trim()) bad(where, `"exercise" is required`);
    else if (!names.has(e.exercise) && e.unmapped !== true) bad(where, `"${e.exercise}" is not in exercises.json; use its exact name, or log it with "unmapped": true`);
    if (e.unmapped !== undefined && e.unmapped !== true) bad(where, `"unmapped" may only be true`);
    if (!Number.isInteger(e.sets) || e.sets < 1 || e.sets > 20) bad(where, `"sets" must be a whole number from 1 to 20`);
    else {
      if (!perSet(e.reps, e.sets, 1, 100)) bad(where, `"reps" must be a number from 1 to 100, or one per set`);
      if (!perSet(e.weight_lb, e.sets, 0, 2000)) bad(where, `"weight_lb" must be pounds (0 for bodyweight), or one per set`);
    }
    if (e.rir !== undefined && !isNum(e.rir, 0, 5)) bad(where, `"rir" must be 0 to 5`);
    if (e.note !== undefined && (typeof e.note !== "string" || e.note.length > 200)) bad(where, `"note" must be text under 200 characters`);
  });
}
if (problems.length) { console.log(problems.join("\n")); process.exit(1); }
console.log("Werk data is valid.");
