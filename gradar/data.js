/*
  data.js
  Sample data so the extension runs offline today.

  REAL VERSION — read everything off the user's OWN logged-in session (see README):
    readCourseFromPage()     -> the course on the MyPlan page (DOM)
    readTranscriptFromMyUW() -> the user's unofficial transcript (their past grades)
    readCatalog()            -> search results / course lookups in-session
  Each distribution is a list of { gpa, n }: gpa = bucket midpoint, n = students.
*/

// the student's own past courses (their grade + that course's curve)
const SAMPLE_TRANSCRIPT = [
  { code: "CSE 142",  gpa: 3.7, credits: 4, dist: [ {gpa:0.5,n:5},{gpa:1.5,n:11},{gpa:2.5,n:35},{gpa:3.2,n:30},{gpa:3.8,n:40} ] },
  { code: "MATH 124", gpa: 3.1, credits: 5, dist: [ {gpa:0.5,n:8},{gpa:1.5,n:18},{gpa:2.5,n:42},{gpa:3.2,n:18},{gpa:3.8,n:14} ] },
  { code: "STAT 311", gpa: 3.5, credits: 5, dist: [ {gpa:0.5,n:5},{gpa:1.5,n:12},{gpa:2.5,n:40},{gpa:3.2,n:25},{gpa:3.8,n:24} ] },
  { code: "ENGL 131", gpa: 3.9, credits: 5, dist: [ {gpa:0.5,n:1},{gpa:1.5,n:3},{gpa:2.5,n:12},{gpa:3.2,n:18},{gpa:3.8,n:44} ] },
];

// a small sample catalog the search box looks through
const SAMPLE_CATALOG = [
  { code: "CSE 143", title: "Computer Programming II", credits: 5, genEd: ["NSc","RSN"],
    dist: [ {gpa:0.5,n:3},{gpa:1.5,n:9},{gpa:2.5,n:31},{gpa:3.2,n:28},{gpa:3.8,n:29} ],
    sections: [
      { sln:"12814", sec:"A", inst:"Hartman", when:"MWF 9:30",  open:0,  total:300, meets:[{days:["M","W","F"],start:570,end:620}] },
      { sln:"12819", sec:"B", inst:"Hu",      when:"MWF 11:30", open:14, total:300, meets:[{days:["M","W","F"],start:690,end:740}] },
      { sln:"12823", sec:"C", inst:"Hu",      when:"MWF 1:30",  open:47, total:300, meets:[{days:["M","W","F"],start:810,end:860}] },
    ] },
  { code: "MATH 124", title: "Calculus with Analytic Geometry I", credits: 5, genEd: ["NSc","RSN"],
    dist: [ {gpa:0.5,n:8},{gpa:1.5,n:18},{gpa:2.5,n:42},{gpa:3.2,n:18},{gpa:3.8,n:14} ],
    sections: [
      { sln:"17640", sec:"A", inst:"Patel", when:"MWF 8:30",  open:31, total:230 },
      { sln:"17645", sec:"C", inst:"Yang",  when:"MWF 10:30", open:0,  total:230 },
    ] },
  { code: "STAT 311", title: "Elements of Statistical Methods", credits: 5, genEd: ["NSc","RSN"],
    dist: [ {gpa:0.5,n:5},{gpa:1.5,n:12},{gpa:2.5,n:40},{gpa:3.2,n:25},{gpa:3.8,n:24} ],
    sections: [
      { sln:"19422", sec:"A", inst:"Nelson", when:"TTh 10:00", open:22, total:250 },
    ] },
  { code: "ENGL 131", title: "Composition: Exposition", credits: 5, genEd: ["C","W"],
    dist: [ {gpa:0.5,n:1},{gpa:1.5,n:3},{gpa:2.5,n:12},{gpa:3.2,n:18},{gpa:3.8,n:44} ],
    sections: [
      { sln:"14881", sec:"A", inst:"Ramos",  when:"MW 1:30",  open:6, total:24 },
      { sln:"14882", sec:"B", inst:"Okafor", when:"TTh 2:30", open:0, total:24 },
    ] },
  { code: "PHIL 100", title: "Introduction to Philosophy", credits: 5, genEd: ["A&H"],
    dist: [ {gpa:0.5,n:2},{gpa:1.5,n:6},{gpa:2.5,n:22},{gpa:3.2,n:27},{gpa:3.8,n:38} ],
    sections: [
      { sln:"16003", sec:"A", inst:"Lee", when:"MWF 12:30", open:48, total:200 },
    ] },
];

const SAMPLE_COURSE = SAMPLE_CATALOG[0]; // the course "on the page"

function readCourseFromPage()     { return SAMPLE_COURSE; }     // TODO: MyPlan DOM
function readTranscriptFromMyUW() { return SAMPLE_TRANSCRIPT; } // TODO: MyUW transcript
function readCatalog()            { return SAMPLE_CATALOG; }    // TODO: in-session search

function getCourse()     { return readCourseFromPage(); }
function getTranscript() { return readTranscriptFromMyUW(); }
function getCatalog()    { return readCatalog(); }

// ---- real in-session fetch (the live path) -------------------------------
// MyPlan's frontend loads each course from its course-app API using your session
// cookies. The course page URL holds the courseId (?id=<guid>); we read that and
// fetch the same "details" endpoint MyPlan itself uses, then map the JSON.

// CONFIRMED endpoint shape (from the real Request URL):
//   https://course-app-api.planning.sis.uw.edu/api/courses/<CODE>/details?courseId=<id>
const MYPLAN_DETAILS_URL = (ref) =>
  "https://course-app-api.planning.sis.uw.edu/api/courses/" + ref.code + "/details?courseId=" + ref.id;

// pull the course code + id straight from the MyPlan page URL,
// e.g. .../course/#/courses/CSE%20421?id=8765b136-...
function getCourseRefFromPage() {
  const href = location.href;
  const id = (href.match(/[?&]id=([0-9a-fA-F-]{36})/) || [])[1];
  let code = (href.match(/\/courses\/([^?#]+)/) || [])[1];
  if (!id || !code) return null;
  try { code = encodeURIComponent(decodeURIComponent(code)); } catch (e) {}  // -> CSE%20421
  return { id, code };
}

// map MyPlan's "details" JSON -> Gradar's course shape (verified on real CSE 421 data)

// "Autumn 2026" -> "20264"  (UW quarter codes: Winter1 Spring2 Summer3 Autumn4)
function termToId(termStr) {
  const m = (termStr || "").trim().match(/^(Winter|Spring|Summer|Autumn|Fall)\s+(\d{4})$/i);
  if (!m) return null;
  const q = { winter: 1, spring: 2, summer: 3, autumn: 4, fall: 4 }[m[1].toLowerCase()];
  return "" + m[2] + q;
}

function mapApiCourse(json) {
  const csd = json && json.courseSummaryDetails;
  if (!csd) return null;
  const inst = json.courseOfferingInstitutionList || [];
  const termObj = (inst[0] && inst[0].courseOfferingTermList && inst[0].courseOfferingTermList[0]) || {};
  const term = termObj.term || "";
  const sections = (termObj.activityOfferingItemList || []).map(a => {
    const md = (a.meetingDetailsList && a.meetingDetailsList[0]) || {};
    const start = (md.time || "").split("-")[0].trim();
    const max = parseInt(a.enrollMaximum, 10) || 0, cnt = parseInt(a.enrollCount, 10) || 0;
    const profs = (a.allInstructors && a.allInstructors.length)
      ? a.allInstructors.map(i => i.name).filter(Boolean)
      : (a.instructor ? [a.instructor] : []);
    return { sln: a.registrationCode, sec: a.code,
      inst: profs.join(", ") || "Staff", instructors: profs,
      when: (md.days ? md.days + " " : "") + start,
      open: Math.max(0, max - cnt), total: max,
      type: a.activityOfferingType, primary: !!a.primary,
      parent: a.primaryActivityOfferingCode || a.code,
      meets: meetsFromList(a.meetingDetailsList) };
  }).filter(s => s.sln);
  const genEd = ((csd.abbrGenEdRequirements && csd.abbrGenEdRequirements.length)
      ? csd.abbrGenEdRequirements : (csd.genEdRequirements || []))
    .map(g => typeof g === "string" ? g : (g.abbr || g.code || g.name)).filter(Boolean);
  return {
    code: (csd.code || "").replace(/\s+/g, " ").trim(),
    title: csd.courseTitle || "",
    credits: parseInt(csd.credit, 10) || csd.credit,
    genEd,
    dist: null,            // grade distribution comes from a separate DawgPath request (next capture)
    term: term,                    // e.g. "Autumn 2026"
    termId: termToId(term),        // e.g. "20264" (null if term unknown)
    sections: sections.length ? sections : [{ sln: "\u2014", sec: "\u2014", inst: "", when: "", open: 0, total: 0 }],
  };
}

// ask the background worker to fetch (bypasses the content-script CORS block)
function bgFetch(url) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type: "gr-fetch", url }, (resp) => {
        if (chrome.runtime.lastError || !resp || !resp.ok) return resolve(null);
        resolve(resp.data);
      });
    } catch (e) { resolve(null); }
  });
}

// read the course the user is currently viewing on MyPlan
async function readCourseFromPageAsync() {
  const ref = getCourseRefFromPage();
  if (!ref) return null;
  const json = await bgFetch(MYPLAN_DETAILS_URL(ref));
  return json ? mapApiCourse(json) : null;
}

// ---- real add to MyPlan plan (the POST MyPlan itself sends) ----
// POST https://course-app-api.planning.sis.uw.edu/api/plan/items
// Adding a whole course:   code = "CSE 332"
// Adding a section:        code = "CSE 332 A"   (course code + section)
// Section-add payload uses note:null, backup:null (verified on real CSE 332 A).
// MyPlan's write endpoints are guarded by a CSRF token (sent as x-csrf-token).
// The token lives only in page JS memory, so inject.js (MAIN world) captures it
// off MyPlan's own requests and parks it on a DOM attribute we read here. The
// cookie/meta/storage checks remain as fallbacks.
function getCsrfToken() {
  try {
    const t = document.documentElement.getAttribute("data-gr-csrf");
    if (t) return t;
  } catch (e) {}
  const cm = document.cookie.match(/(?:^|;\s*)([^=;]*(?:csrf|xsrf)[^=;]*)=([^;]+)/i);
  if (cm) return decodeURIComponent(cm[2]);
  const meta = document.querySelector('meta[name*="csrf" i], meta[name*="xsrf" i]');
  if (meta && meta.content) return meta.content;
  for (const store of [sessionStorage, localStorage]) {
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (/csrf|xsrf/i.test(k)) { const v = store.getItem(k); if (v) return v; }
    }
  }
  return null;
}

// background-worker path: it can read the API's CSRF response header (no CORS limit)
// and reflect it on the write, which a content-script fetch can't reliably do.
function _bgPlanAdd(body, csrf, primeUrl) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type: "gr-plan-add", body, csrf, primeUrl }, (resp) => {
        if (chrome.runtime.lastError || !resp) return resolve({ ok: false, reason: "msg" });
        resolve(resp);   // { ok, status, data, via, csrfHint }
      });
    } catch (e) { resolve({ ok: false, reason: "throw" }); }
  });
}

async function addPlanItem(code, termId) {
  if (!termId) return { ok: false, reason: "no-term" };
  const body = { code, termId, note: null, backup: null, recommended: false, adviserRegId: "" };
  const csrf = getCsrfToken();   // local sources first; usually null, worker harvests then
  // a known-good GET the worker can hit to pull the CSRF token from the response header
  const courseOnly = code.replace(/\s+[A-Za-z]+$/, "").trim();   // "STAT 390 A" -> "STAT 390"
  const primeUrl = "https://course-app-api.planning.sis.uw.edu/api/courses/"
    + encodeURIComponent(courseOnly) + "/details";
  return await _bgPlanAdd(body, csrf, primeUrl);
}

// add the user's chosen section(s) by SLN/section, e.g. ["A","AA"] -> two POSTs.
// if no sections are given, falls back to adding the course at the course level.
async function addCourseToMyPlan(course, sections) {
  if (!course || !course.termId) return { ok: false, reason: "no-term" };
  const codes = (sections && sections.length)
    ? sections.map(sec => course.code + " " + sec)
    : [course.code];
  const results = [];
  for (const code of codes) {
    const r = await addPlanItem(code, course.termId);
    results.push({ code, r });
    if (!r.ok) return { ok: false, reason: "item-failed", code, results };
  }
  return { ok: true, results };
}

// ---- free-text search: type a course -> fetch its details directly ----
// MyPlan's details endpoint is keyed by course code. We try fetching by code
// alone (no id); if MyPlan requires the id we fall back to a search endpoint
// once one is captured.

// details by code only, e.g. .../api/courses/STAT%20390/details
const MYPLAN_DETAILS_BY_CODE = (code) =>
  "https://course-app-api.planning.sis.uw.edu/api/courses/" + encodeURIComponent(code) + "/details";

// turn loose user input into a real course code: "stat390" / "stat 390" -> "STAT 390"
function normalizeCode(q) {
  let s = (q || "").trim().toUpperCase().replace(/\s+/g, " ");
  const m = s.match(/^([A-Z&][A-Z&\s]*?)\s*([0-9]{3}[A-Z]?)$/);   // dept letters + 3-digit number
  if (m) s = m[1].trim() + " " + m[2];
  return s;
}

// optional search endpoint (FILL IN from a capture only if details-by-code fails)
const MYPLAN_SEARCH_URL = null;
function pickSearchHit(results, query) { return null; }

async function searchCourse(query) {
  const code = normalizeCode(query);
  if (!code) return null;

  // primary path: fetch the course straight from the details endpoint by code
  let json = await bgFetch(MYPLAN_DETAILS_BY_CODE(code));
  let course = json ? mapApiCourse(json) : null;
  if (course) return course;

  // fallback: a captured search endpoint that resolves text -> { code, id }
  if (MYPLAN_SEARCH_URL) {
    const results = await bgFetch(MYPLAN_SEARCH_URL(query));
    const hit = pickSearchHit(results, query);
    if (hit) { json = await bgFetch(MYPLAN_DETAILS_URL(hit)); course = json ? mapApiCourse(json) : null; }
  }
  return course;
}

// ---- schedule conflict detection -----------------------------------------
function _parseDays(s) {
  const out = []; s = (s || "").replace(/Th/g, "\u0001"); // token Thursday
  for (const ch of s) { if (ch === "\u0001") out.push("Th"); else if ("MTWFS".includes(ch)) out.push(ch); }
  return out;
}
function _parseTime(t) {
  const m = (t || "").match(/(\d{1,2}):(\d{2})\s*([AaPp][Mm])/);
  if (!m) return null;
  let h = (+m[1]) % 12; if (/p/i.test(m[3])) h += 12;
  return h * 60 + (+m[2]);
}
function meetsFromList(list) {
  return (list || []).map(md => {
    const days = _parseDays(md.days);
    const parts = (md.time || "").split("-").map(x => x.trim());
    const start = _parseTime(parts[0]), end = _parseTime(parts[1]);
    return (days.length && start != null && end != null) ? { days, start, end } : null;
  }).filter(Boolean);
}
function meetsConflict(a, b) {
  for (const x of (a || [])) for (const y of (b || [])) {
    if (x.days.some(d => y.days.includes(d)) && x.start < y.end && y.start < x.end) return true;
  }
  return false;
}
function conflictsWith(section, planned, currentCode, termId) {
  for (const p of (planned || [])) {
    if (p.code === currentCode) continue;            // ignore the same course
    if (termId && p.termId && p.termId !== termId) continue;  // different term can't clash
    if (meetsConflict(section.meets, p.meets)) return p;
  }
  return null;
}

// is `course` already sitting in the plan list? (duplicate check)
function alreadyPlanned(planned, code, termId) {
  return (planned || []).some(p => p.code === code
    && (!termId || !p.termId || p.termId === termId));
}

// ---- the user's REAL MyPlan schedule (for conflict/duplicate checks) ------
// Their planned/registered courses live on plan-app-api. We fetch it straight
// from the page (content-script fetch, page origin) which MyPlan already allows
// via CORS — so NO manifest/permission change is needed. Any failure is swallowed
// and simply yields no warning; it never touches the add path.
const MYPLAN_PLAN_URL = (year) =>
  "https://plan-app-api.planning.sis.uw.edu/api/plan/terms?year=" + encodeURIComponent(year);

// Pull every scheduled section out of the plan response — Planned AND Registered
// (and any other list). We don't rely on the list's name; we collect any node
// that has meeting times + a course code, de-duped. That catches registered
// courses, which live in a sibling list to plannedList.
function mapPlanActivities(termsJson) {
  const out = [];
  const seen = new Set();
  function push(a, termId) {
    const code = a.courseCode || "";
    const sec = a.code || "";
    const key = code + "|" + sec + "|" + (a.registrationCode || "");
    if (!code || seen.has(key)) return;
    seen.add(key);
    const md = (a.meetingDetailsList && a.meetingDetailsList[0]) || {};
    const start = (md.time || "").split("-")[0].trim();
    out.push({
      code: code,
      sec: sec,
      sln: a.registrationCode || "",
      when: (md.days ? md.days + " " : "") + start,
      meets: meetsFromList(a.meetingDetailsList),
      termId: termId,
    });
  }
  function walk(node, termId, depth) {
    if (!node || depth > 8) return;
    if (Array.isArray(node)) { for (const x of node) walk(x, termId, depth + 1); return; }
    if (typeof node !== "object") return;
    // a scheduled section: has meeting details + a course code -> collect, don't recurse in
    if (Array.isArray(node.meetingDetailsList) && node.courseCode) { push(node, termId); return; }
    for (const k in node) {
      const v = node[k];
      if (v && typeof v === "object") walk(v, termId, depth + 1);
    }
  }
  for (const t of (termsJson || [])) {
    const termId = (t.term && t.term.id) || t.atpId || null;
    walk(t, termId, 0);
  }
  return out;
}

// ask inject.js (running as the page) to fetch the plan; resolves the raw JSON,
// or undefined if the relay never answers (so we can fall back to a direct fetch)
function _planViaPage(url) {
  return new Promise(function (resolve) {
    var id = "gr" + Date.now() + "_" + Math.random().toString(36).slice(2);
    var settled = false;
    function onMsg(ev) {
      if (ev.source !== window || !ev.data || ev.data.__grRes !== "plan" || ev.data.id !== id) return;
      settled = true; window.removeEventListener("message", onMsg);
      resolve(ev.data.json || null);
    }
    window.addEventListener("message", onMsg);
    try { window.postMessage({ __grReq: "plan", id: id, url: url }, location.origin); }
    catch (e) { window.removeEventListener("message", onMsg); return resolve(undefined); }
    setTimeout(function () {
      if (!settled) { window.removeEventListener("message", onMsg); resolve(undefined); }
    }, 2500);
  });
}

// fetch a plan-app-api URL's JSON via the page relay, with a direct fetch fallback
async function fetchPlanJson(url) {
  let json = await _planViaPage(url);
  if (typeof json === "undefined") {
    try {
      const r = await fetch(url, { credentials: "include", headers: { Accept: "application/json" } });
      json = r.ok ? await r.json() : null;
    } catch (e) { json = null; }
  }
  return json || null;
}

async function getRealSchedule(termId) {
  const year = String(termId || "").slice(0, 4);
  if (!/^\d{4}$/.test(year)) return null;
  const json = await fetchPlanJson(MYPLAN_PLAN_URL(year));
  return json ? mapPlanActivities(json) : null;
}

// the student's full academic history from MyPlan, read once: a numeric transcript
// (for prediction) plus a taken-map of every completed course -> grade (incl. CR),
// for the "already taken" check.
//
// Each transcript entry also carries the CONTEXT it was earned in: the course's
// credits, its term, and a `ctxShift` that nudges its percentile by how demanding
// that quarter was (heavier load + more STEM credits = grade understates ability,
// so its percentile is bumped up; a light quarter is nudged down).
const GR_STEM_DEPTS_D = new Set(["CSE","CSS","MATH","AMATH","STAT","BIOST","PHYS","CHEM","BIOL",
  "BIOC","BIOEN","GENOME","NEURO","MICROM","GENET","PHARM","E E","EE","A A","AA","M E","ME",
  "CEE","MSE","IND E","INDE","CHEM E","CHEME","HCDE","INFO","DATA","ASTR","ATM S","ESS","OCEAN",
  "ENGR","AMATH","BIO A","FISH","ENV H","NUTR"]);
function _deptD(code) { return (code || "").replace(/\s*\d.*$/, "").replace(/\s+/g, " ").trim().toUpperCase(); }
function _isStemD(code) { return GR_STEM_DEPTS_D.has(_deptD(code)); }

let _history = null;
async function getAcademicHistory() {
  if (_history) return _history;
  const nowY = new Date().getFullYear();
  const years = [];
  for (let y = nowY; y >= nowY - 5; y--) years.push(y);
  const lists = await Promise.all(years.map(async y => {
    const json = await fetchPlanJson(MYPLAN_PLAN_URL(y));
    const recs = [];
    for (const t of (json || [])) {
      for (const rec of (t.academicRecord || [])) {
        const code = (rec.courseCode || "").replace(/\s+/g, " ").trim();
        if (code && rec.grade != null && rec.grade !== "") {
          recs.push({ code: code, grade: String(rec.grade),
            credit: parseFloat(rec.credit) || 0, termId: String(rec.atpId || "") });
        }
      }
    }
    return recs;
  }));
  const taken = {}, transcript = [], seenTx = {};
  for (const list of lists) {            // most-recent year first
    for (const r of list) {
      const key = r.code.toUpperCase();
      if (!taken[key]) taken[key] = r.grade;
      const g = parseFloat(r.grade);
      if (/^\d(\.\d+)?$/.test(r.grade) && !isNaN(g) && !seenTx[key]) {
        seenTx[key] = true;
        transcript.push({ code: r.code, gpa: g, credit: r.credit, termId: r.termId, stem: _isStemD(r.code) });
      }
    }
  }

  // per-quarter demand: total credits scaled up by how STEM-dense the quarter was
  const byTerm = {};
  for (const e of transcript) {
    const b = byTerm[e.termId] || (byTerm[e.termId] = { cred: 0, stem: 0 });
    b.cred += e.credit; if (e.stem) b.stem += e.credit;
  }
  const demand = {};
  for (const tid in byTerm) {
    const b = byTerm[tid], frac = b.cred ? b.stem / b.cred : 0;
    demand[tid] = b.cred * (1 + 0.5 * frac);     // STEM-heavy quarters score higher
  }
  const dv = Object.values(demand);
  const meanD = dv.length ? dv.reduce((a, b) => a + b, 0) / dv.length : 0;
  for (const e of transcript) {
    const d = demand[e.termId];
    e.ctxShift = (meanD && d != null) ? Math.max(-0.06, Math.min(0.06, 0.18 * (d - meanD) / meanD)) : 0;
  }

  _history = { transcript: transcript, taken: taken };
  return _history;
}

async function getRealTranscript() {
  return (await getAcademicHistory()).transcript;
}

// "3.8" if you've taken `code`, "CR" if credit-only, or null if not taken
async function gradeIfTaken(code) {
  try {
    const taken = (await getAcademicHistory()).taken || {};
    return taken[(code || "").replace(/\s+/g, " ").trim().toUpperCase()] || null;
  } catch (e) { return null; }
}



// ---- persistent "planned in Gradar" store (drives conflict checks) -------
let _memPlanned = [];
const GR_PLANNED_KEY = "gr-planned";
function getPlanned() {
  return new Promise(resolve => {
    try { chrome.storage.local.get(GR_PLANNED_KEY, o => resolve((o && o[GR_PLANNED_KEY]) || [])); }
    catch (e) { resolve(_memPlanned); }
  });
}
function setPlanned(list) {
  _memPlanned = list;
  try { chrome.storage.local.set({ [GR_PLANNED_KEY]: list }); } catch (e) {}
}
async function addPlanned(items, code) {
  const cur = (await getPlanned()).filter(p => p.code !== code); // replace this course's entries
  setPlanned(cur.concat(items));
}

// ---- RateMyProfessors lookup (via background worker) ----
function _norm(s) { return (s || "").toLowerCase().replace(/[^a-z]/g, ""); }

// from RMP's candidate list, pick the UW professor whose name matches best
function bestRmpMatch(nodes, name) {
  if (!nodes || !nodes.length) return null;
  const parts = name.trim().split(/\s+/);
  const first = _norm(parts[0]), last = _norm(parts[parts.length - 1]);

  // 1) only consider University of Washington entries
  let pool = nodes.filter(n => /washington/i.test((n.school && n.school.name) || ""));
  if (!pool.length) return null;   // no UW match -> show "no rating" rather than a wrong school

  // 2) match the name within UW
  let named = pool.filter(n => _norm(n.lastName) === last &&
    (_norm(n.firstName) === first || _norm(n.firstName).startsWith(first[0] || "")));
  if (!named.length) named = pool.filter(n => _norm(n.lastName) === last);
  if (!named.length) return null;

  // 3) among matches, prefer the one with the most ratings (avoids sparse duplicates)
  named.sort((a, b) => (b.numRatings || 0) - (a.numRatings || 0));
  return named[0];
}

function rmpRating(name) {
  return new Promise(resolve => {
    try {
      chrome.runtime.sendMessage({ type: "gr-rmp", name }, resp => {
        if (chrome.runtime.lastError || !resp || !resp.ok) return resolve(null);
        resolve(bestRmpMatch(resp.data, name));   // matched node, or null
      });
    } catch (e) { resolve(null); }
  });
}

// ---- DawgPath grade distributions + the user's transcript (for prediction) ----
// DawgPath's details endpoint returns gpa_distro: [{gpa, count}] where gpa is the
// grade x10 as a string ("34" = 3.4). We map it to the model's [{gpa, n}] shape.
// CONFIRMED from a real capture of ACCTG 219.
const DAWGPATH_DETAILS_URL = (code) =>
  "https://dawgpath.uw.edu/api/v1/courses/details/" + encodeURIComponent(code);

function mapGpaDistro(distro) {
  return (distro || [])
    .map(d => ({ gpa: parseInt(d.gpa, 10) / 10, n: d.count || 0 }))
    .filter(d => !isNaN(d.gpa));
}

const _distCache = {};
async function getDawgpathDist(code) {
  const key = (code || "").replace(/\s+/g, " ").trim().toUpperCase();
  if (!key) return null;
  if (Object.prototype.hasOwnProperty.call(_distCache, key)) return _distCache[key];
  const json = await bgFetch(DAWGPATH_DETAILS_URL(key));
  const dist = (json && json.gpa_distro) ? mapGpaDistro(json.gpa_distro) : null;
  _distCache[key] = (dist && dist.length) ? dist : null;
  return _distCache[key];
}

// ---- course "material" keywords (from descriptions) for similarity matching ----
const _STOP = new Set(("the a an and or of to in for on with at by from as is are be this that "
  + "these those will may can students student course introduction intro topics study studies "
  + "including include includes use uses using basic advanced concepts concept methods method "
  + "analysis design system systems theory practice principles application applications "
  + "prerequisite prerequisites credit credits offered jointly emphasis focus various both each "
  + "their its through which such other more about how what their not but also more one two three")
  .split(/\s+/));

function _keywords(text) {
  return Array.from(new Set((text || "").toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/)
    .filter(w => w.length > 3 && !_STOP.has(w)))).slice(0, 40);
}

const _kwCache = {};
async function getCourseKeywords(code) {
  const key = (code || "").replace(/\s+/g, " ").trim().toUpperCase();
  if (!key) return null;
  if (Object.prototype.hasOwnProperty.call(_kwCache, key)) return _kwCache[key];
  let kw = null;
  try {
    const json = await bgFetch(MYPLAN_DETAILS_BY_CODE(key));
    const desc = json && (json.courseDescription || json.description
      || (json.courseSummaryDetails && json.courseSummaryDetails.courseDescription) || "");
    const title = json && (json.courseTitle || json.title || "");
    const words = _keywords((title + " " + desc));
    kw = words.length ? words : null;
  } catch (e) { kw = null; }
  _kwCache[key] = kw;
  return kw;
}

// the student's completed UW courses + grade — read live from MyPlan's plan data.
// This hardcoded list is only a fallback if the live read ever fails.
const GR_TRANSCRIPT = [
  { code: "CSE 123",  gpa: 3.0 },
  { code: "MATH 126", gpa: 2.3 },
  { code: "MATH 208", gpa: 2.3 },
  { code: "CLAS 205", gpa: 4.0 },
  { code: "CSE 311",  gpa: 3.8 },
  { code: "ENGL 131", gpa: 3.9 },
  { code: "MATH 207", gpa: 3.1 },
  { code: "ARCH 150", gpa: 4.0 },
  { code: "CSE 312",  gpa: 2.5 },
  { code: "CSE 332",  gpa: 3.3 },
  { code: "EDUC 215", gpa: 4.0 },
  { code: "STAT 302", gpa: 4.0 },
];

// build the transcript with each course's DawgPath curve + material keywords
// (parallel + cached once), dropping any course DawgPath has no distribution for.
let _txWithDist = null;
async function getTranscriptWithDist() {
  if (_txWithDist) return _txWithDist;
  let base = null;
  try { base = await getRealTranscript(); } catch (e) {}
  if (!base || base.length < 3) base = GR_TRANSCRIPT;   // fallback to hardcoded list
  const rows = await Promise.all(base.map(async c => {
    const [dist, kw] = await Promise.all([getDawgpathDist(c.code), getCourseKeywords(c.code)]);
    return (dist && dist.length) ? Object.assign({}, c, { dist: dist, kw: kw }) : null;
  }));
  _txWithDist = rows.filter(Boolean);
  return _txWithDist;
}

// RMP rating (0-5) -> a small percentile shift for the prediction (~3.5 = neutral)
// Per-professor GRADE data (how students actually score under an instructor) would
// make the prof effect grade-based instead of sentiment-based. DawgPath exposes this
// via an instructor endpoint we have not captured yet. Fill in DAWGPATH_TEACHER_URL
// + the parser once captured; getProfGradeDelta returns null (falls back to RMP) until then.
const DAWGPATH_TEACHER_URL = null;   // e.g. (idOrName) => "https://dawgpath.uw.edu/api/v1/teachers/<...>"
async function getProfGradeDelta(courseCode, profName, courseDist) {
  if (!DAWGPATH_TEACHER_URL || !profName) return null;
  try {
    const json = await bgFetch(DAWGPATH_TEACHER_URL(profName));
    // Expected (to confirm on capture): the prof's gpa_distro overall or for this course.
    const distro = json && (json.gpa_distro || (json.course_gpa && json.course_gpa[courseCode]));
    if (!distro) return null;
    const profMean = _distMean(mapGpaDistro(distro));
    const courseMean = courseDist ? _distMeanRaw(courseDist) : null;
    if (profMean == null || courseMean == null) return null;
    // how much higher/lower this prof grades vs the course average, as a capped GPA delta
    return Math.max(-0.35, Math.min(0.35, profMean - courseMean));
  } catch (e) { return null; }
}
function _distMean(d) { const t = (d || []).reduce((s, x) => s + x.n, 0); return t ? d.reduce((s, x) => s + x.gpa * x.n, 0) / t : null; }
function _distMeanRaw(d) { return _distMean(d); }

// RMP rating (0-5) -> a small percentile shift for the prediction (~3.5 = neutral)
// Population-level professor adjustment from RateMyProfessors. Combines quality
// (avgRating), difficulty (avgDifficulty), and would-take-again, then scales the
// whole thing by how many ratings exist (few ratings -> muted). Capped so it never
// overrides the grade data. NOTE: this is NOT personalized to how *this* student
// fares under tough profs — UW's completed-course records don't expose the
// instructor, so per-student prof sensitivity isn't recoverable.
function profShiftFromRating(node) {
  if (node == null) return 0;
  // tolerate being handed just a number (older callers)
  if (typeof node === "number") node = { avgRating: node };
  if (node.avgRating == null) return 0;
  const r = Number(node.avgRating);                       // 1-5, ~3.5 average
  const n = Number(node.numRatings) || 0;
  const diff = node.avgDifficulty != null ? Number(node.avgDifficulty) : null;  // 1-5
  const wta = (node.wouldTakeAgainPercent != null && node.wouldTakeAgainPercent >= 0)
    ? Number(node.wouldTakeAgainPercent) : null;          // 0-100
  let s = (r - 3.5) * 0.045;                              // better prof -> higher grade
  if (diff != null) s += (3.0 - diff) * 0.02;            // tougher prof -> lower (mild; curve already has course difficulty)
  if (wta != null)  s += ((wta - 70) / 100) * 0.03;      // would-take-again signal
  s *= Math.min(1, n / 12);                               // confidence by rating count
  return Math.max(-0.12, Math.min(0.12, s));
}
