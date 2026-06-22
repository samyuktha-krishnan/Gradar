/*
  panel.js
  Builds the Gradar panel: a search box + the course card
  (grades, GPA prediction, lecture/quiz picker, planned state, conflict warning).
*/

function _el(tag, props = {}, children = []) {
  const e = document.createElement(tag);
  for (const k in props) { if (props[k] != null) e[k] = props[k]; }
  for (const c of [].concat(children)) {
    if (c) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return e;
}

// a line of professor names with their RateMyProfessors average rating
function profsLine(section) {
  const names = (section.instructors && section.instructors.length)
    ? section.instructors
    : (section.inst && section.inst !== "Staff" ? [section.inst] : []);
  if (!names.length) return null;
  const wrap = _el("div", { className: "gr-profs" }, [
    _el("span", { className: "gr-profs-label", textContent: names.length > 1 ? "Professors" : "Professor" }),
  ]);
  names.forEach(n => {
    const rating = _el("span", { className: "gr-prof-rating", textContent: "\u2026" });
    wrap.appendChild(_el("span", { className: "gr-prof" }, [
      _el("span", { className: "gr-prof-name", textContent: n }),
      rating,
    ]));
    rmpRating(n).then(node => {
      if (node && node.avgRating != null && node.numRatings) {
        rating.textContent = Number(node.avgRating).toFixed(1) + "\u2605 (" + node.numRatings + ")";
      } else {
        rating.textContent = "no rating"; rating.classList.add("muted");
      }
    }).catch(() => { rating.textContent = "no rating"; rating.classList.add("muted"); });
  });
  return wrap;
}

function buildCourseCard(course, prediction, schedule) {
  const card = _el("div", { className: "gr-card" });
  let plan = schedule || [];   // local Gradar list — only a fallback for conflicts
  let realPlan = null;          // your actual MyPlan plan; authoritative once loaded
  let planSettled = false;      // true once the real-plan fetch resolves (or fails)

  // what conflicts are checked against: the real plan if we have it, else (only
  // after the fetch settles) the local list. Before settle, check nothing — that
  // avoids a stale warning flashing in and then correcting itself.
  function conflictList() {
    if (realPlan != null) return realPlan;
    return planSettled ? plan : [];
  }

  // header + title
  card.appendChild(_el("div", { className: "gr-head" }, [
    _el("span", { className: "gr-code", textContent: course.code }),
    _el("span", { className: "gr-credits", textContent: course.credits ? course.credits + " cr" : "" }),
    ...(course.genEd || []).map(g => _el("span", { className: "gr-gened", textContent: g })),
  ]));
  if (course.title) card.appendChild(_el("div", { className: "gr-title", textContent: course.title }));

  // prediction (computed live from DawgPath + the user's transcript + professor RMP)
  const pred = _el("div", { className: "gr-pred" });
  card.appendChild(pred);
  function renderPred(p) {
    pred.textContent = "";
    if (p && p.taken != null) {
      const g = parseFloat(p.taken);
      pred.classList.add("gr-pred-taken");
      pred.appendChild(_el("div", { className: "gr-pred-top" }, [
        _el("span", { className: "gr-pred-num", textContent: isNaN(g) ? String(p.taken) : g.toFixed(1) }),
        _el("span", { className: "gr-pred-label", textContent: "\u2713 already taken \u00b7 your grade" }),
      ]));
      return;
    }
    pred.classList.remove("gr-pred-taken");
    if (p && p.ok) {
      pred.appendChild(_el("div", { className: "gr-pred-top" }, [
        _el("span", { className: "gr-pred-num", textContent: p.predicted.toFixed(1) }),
        _el("span", { className: "gr-pred-label",
          textContent: "your likely GPA \u00b7 " + p.range[0].toFixed(1) + "\u2013" + p.range[1].toFixed(1) + " range" }),
      ]));
      const basis = (p.sameSubjectCount && p.dept)
        ? "weighted toward your " + p.sameSubjectCount + " " + p.dept + " course" + (p.sameSubjectCount > 1 ? "s" : "")
        : "across your record";
      const ease = p.courseEase ? " \u00b7 this course " + p.courseEase
        + (p.courseMedian != null ? " (median " + p.courseMedian.toFixed(1) + ")" : "") : "";
      pred.appendChild(_el("div", { className: "gr-pred-sub",
        textContent: basis + " \u00b7 " + p.confidence + " confidence" + ease }));
      if (p.profLine) pred.appendChild(_el("div", { className: "gr-pred-sub", textContent: p.profLine }));
    } else {
      pred.appendChild(_el("div", { className: "gr-pred-sub", textContent: (p && p.reason) || "Estimating\u2026" }));
    }
  }
  renderPred({ ok: false, reason: "Estimating your GPA from DawgPath\u2026" });

  // sections: lectures (primary) vs quiz/lab (secondary)
  const all = course.sections || [];
  let primaries = all.filter(s => s.primary);
  if (!primaries.length) primaries = all;
  const quizzesOf = (p) => all.filter(s => !s.primary && s.parent === p.sec);

  let selP = primaries.find(s => s.open > 0) || primaries[0];
  let selQ = null;
  let planned = null;  // { p, q } once added

  // Compute the GPA estimate live: target course curve from DawgPath, your real
  // grades mapped onto each past course's curve, nudged by the selected lecture's
  // professor (RMP). Re-runs when you pick a different lecture. Fully isolated.
  let _predToken = 0;
  async function computePrediction() {
    const my = ++_predToken;
    try {
      // already taken? show the actual grade instead of a prediction.
      const taken = await gradeIfTaken(course.code);
      if (my !== _predToken) return;
      if (taken != null) { renderPred({ taken: taken }); return; }

      const targetDist = await getDawgpathDist(course.code);
      if (my !== _predToken) return;
      if (!targetDist || !targetDist.length) {
        return renderPred({ ok: false, reason: "DawgPath has no grade data for this course yet." });
      }
      const tx = await getTranscriptWithDist();
      if (my !== _predToken) return;
      const targetKw = await getCourseKeywords(course.code);
      if (my !== _predToken) return;

      // professor effect from the selected lecture's first instructor.
      // Prefer REAL per-prof grade data (how students actually scored) when available;
      // otherwise fall back to the RMP sentiment nudge. Build a line either way.
      let profShift = 0, profLine = null;
      const profs = (selP && selP.instructors && selP.instructors.length) ? selP.instructors
        : (selP && selP.inst && selP.inst !== "Staff" ? [selP.inst] : []);
      if (profs.length) {
        const prof = profs[0];
        try {
          const gradeDelta = await getProfGradeDelta(course.code, prof, targetDist);
          if (my !== _predToken) return;
          if (gradeDelta != null) {
            profShift = Math.max(-0.12, Math.min(0.12, gradeDelta * 0.5));   // GPA delta -> percentile-ish nudge
            profLine = "prof " + prof + ": grades " + (gradeDelta >= 0 ? "+" : "")
              + gradeDelta.toFixed(1) + " vs course avg";
          } else {
            const node = await rmpRating(prof);
            if (my !== _predToken) return;
            if (node && node.avgRating != null && node.numRatings) {
              profShift = profShiftFromRating(node);
              profLine = "prof " + prof + ": " + Number(node.avgRating).toFixed(1) + "\u2605 ("
                + node.numRatings + " RMP) \u2192 " + (profShift >= 0 ? "+" : "") + profShift.toFixed(2);
            } else {
              profLine = "prof " + prof + ": no RMP rating found";
            }
          }
        } catch (e) {}
      }
      const p = predictGPA(tx, { dist: targetDist },
        { profShift: profShift, targetCode: course.code, targetKw: targetKw });
      if (profLine) p.profLine = profLine;
      if (my === _predToken) renderPred(p);
    } catch (e) {
      if (my === _predToken) renderPred({ ok: false, reason: "Couldn't load grade data." });
    }
  }
  computePrediction();

  const controls = _el("div", { className: "gr-controls" });
  card.appendChild(controls);

  function row(s, opts) {
    const full = s.open === 0;
    const cls = "gr-srow" + (opts.active ? " sel" : "")
      + (full && !opts.locked ? " full" : "") + (opts.locked ? " locked" : "");
    const isBtn = !opts.locked;
    return _el(isBtn ? "button" : "div", {
      className: cls,
      disabled: isBtn && full && !opts.active ? true : null,
      onclick: isBtn && !full ? () => opts.pick(s) : null,
    }, [
      _el("code", { className: "gr-sln", textContent: s.sln }),
      _el("span", { className: "gr-sec", textContent: s.sec }),
      _el("span", { className: "gr-meta", textContent: (s.inst ? s.inst + " \u00b7 " : "") + s.when }),
      _el("span", { className: "gr-seats", textContent: full ? "FULL" : s.open + " open" }),
    ]);
  }

  function findConflict() {
    const list = conflictList();
    for (const c of [selP, selQ].filter(Boolean)) {
      const hit = conflictsWith(c, list, course.code, course.termId);
      if (hit) return hit;
    }
    return null;
  }

  function addSln() { return selQ ? selQ.sln : (selP ? selP.sln : "\u2014"); }

  async function doAdd() {
    const btn = controls.querySelector(".gr-add");
    if (btn) { btn.disabled = true; btn.textContent = "Adding to your plan\u2026"; }

    // 1) real MyPlan add. The quiz/secondary code is MyPlan's enrollment unit and
    // already encodes its lecture (the "B" in "BC"), so adding it pulls the lecture
    // in too — that's the single item MyPlan's own UI sends ("CSE 333 AB"). Fall
    // back to the lecture code only for lecture-only courses with no quiz.
    let result = null;
    const chosen = selQ ? selQ.sec : (selP ? selP.sec : null);
    const secs = (chosen && chosen !== "\u2014") ? [chosen] : [];
    try { result = await addCourseToMyPlan(course, secs); } catch (e) {}

    if (!result || !result.ok) {
      console.warn("[Gradar] add failed \u2192", result);
      if (btn) {
        btn.disabled = false;
        if (result && result.reason === "no-term") {
          btn.textContent = "Can't add \u2014 quarter unknown";
        } else {
          const last = result && result.results && result.results[result.results.length - 1];
          const status = last && last.r && last.r.status;
          btn.textContent = "Couldn't add"
            + (result && result.code ? " (" + result.code + ")" : "")
            + (status ? " \u2014 HTTP " + status : "")
            + " \u2014 tap to retry";

          // show what we sent + the server's own message, so no console is needed
          const detail = last && last.r && (last.r.data != null ? last.r.data : last.r.error);
          let txt = detail == null ? "" : (typeof detail === "string" ? detail : JSON.stringify(detail));
          txt = txt.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
          if (txt.length > 400) txt = txt.slice(0, 400) + "\u2026";
          let note = controls.querySelector(".gr-error");
          if (!note) { note = _el("div", { className: "gr-warn gr-error" }); controls.appendChild(note); }
          const via = last && last.r && last.r.via;
          const csrfHint = last && last.r && last.r.csrfHint;
          note.textContent = "Sent \u201c" + course.code + " " + (chosen || "") + "\u201d for termId "
            + course.termId
            + (via ? " [via " + via + ", csrf " + (csrfHint ? csrfHint + "\u2026" : "none") + "]" : "")
            + (txt ? " \u2014 server said: " + txt : " \u2014 (no message returned)");
        }
      }
      return;
    }

    // 2) record Gradar's own section choice (used for conflict checks)
    const items = [selP, selQ].filter(Boolean).map(s =>
      ({ code: course.code, sec: s.sec, sln: s.sln, when: s.when, meets: s.meets || [] }));
    try { await addPlanned(items, course.code); plan = await getPlanned(); } catch (e) {}
    planned = { p: selP, q: selQ };
    render();
  }

  function render() {
    controls.textContent = "";

    if (!planned) {
      controls.appendChild(_el("div", { className: "gr-section-label",
        textContent: primaries.length > 1 ? "Pick a section" : "Section" }));
      const plist = _el("div", { className: "gr-sections" });
      primaries.forEach(s => plist.appendChild(row(s, { active: s === selP, pick: (x) => { selP = x; selQ = null; computePrediction(); render(); } })));
      controls.appendChild(plist);

      const qs = quizzesOf(selP);
      if (qs.length) {
        if (!selQ) selQ = qs.find(s => s.open > 0) || qs[0];
        controls.appendChild(_el("div", { className: "gr-section-label", textContent: "Pick a quiz section" }));
        const qlist = _el("div", { className: "gr-sections" });
        qs.forEach(s => qlist.appendChild(row(s, { active: s === selQ, pick: (x) => { selQ = x; render(); } })));
        controls.appendChild(qlist);
      }

      const pl = profsLine(selP);
      if (pl) controls.appendChild(pl);

      if (realPlan && alreadyPlanned(realPlan, course.code, course.termId)) {
        controls.appendChild(_el("div", { className: "gr-warn",
          textContent: "\u26a0 " + course.code + " is already planned for "
            + (course.term || "this quarter") }));
      }

      const conflict = findConflict();
      if (conflict) {
        controls.appendChild(_el("div", { className: "gr-warn",
          textContent: "\u26a0 Time conflict with " + conflict.code + " " + conflict.sec
            + (conflict.when ? " (" + conflict.when + ")" : "") }));
      }
      controls.appendChild(_el("button", { className: "gr-add" + (conflict ? " warn" : ""),
        textContent: "+ Add to MyPlan" + (course.term ? " \u00b7 " + course.term : ""), onclick: doAdd }));
    } else {
      controls.appendChild(_el("div", { className: "gr-section-label", textContent: "Planned" }));
      const list = _el("div", { className: "gr-sections" });
      list.appendChild(row(planned.p, { active: true, locked: true }));
      if (planned.q) list.appendChild(row(planned.q, { active: true, locked: true }));
      controls.appendChild(list);
      controls.appendChild(_el("div", { className: "gr-locked-note",
        textContent: "Planned \u2014 only one section per course." }));
      controls.appendChild(_el("button", { className: "gr-add done", disabled: true,
        textContent: "\u2713 Planned \u00b7 SLN " + (planned.q ? planned.q.sln : planned.p.sln) }));
      controls.appendChild(_el("button", { className: "gr-link", textContent: "Change section",
        onclick: () => { planned = null; render(); } }));
    }
  }
  render();

  // Load your REAL plan once, then render warnings a single time (no flicker).
  // Isolated: any failure just marks it settled and falls back to the local list;
  // never touches the add path.
  if (course.termId && typeof getRealSchedule === "function") {
    Promise.resolve()
      .then(function () { return getRealSchedule(course.termId); })
      .then(function (real) { planSettled = true; if (Array.isArray(real)) realPlan = real; if (!planned) render(); })
      .catch(function () { planSettled = true; if (!planned) render(); });
  } else {
    planSettled = true;
  }

  card.appendChild(_el("div", { className: "gr-note",
    textContent: "Course & seats from MyPlan \u00b7 grade prediction needs DawgPath data." }));
  return card;
}

// ---- the whole panel: header + search box + the course card ----
function buildGradarPanel(initialCourse, transcript, schedule, opts) {
  opts = opts || {};
  const root = _el("div", { className: "gr-panel" + (opts.collapsed ? " gr-collapsed" : "") });

  // header: title + collapse toggle (panel now shows on every MyPlan page)
  const toggle = _el("button", { className: "gr-collapse-btn",
    textContent: opts.collapsed ? "+" : "\u2013", title: "Collapse / expand" });
  const header = _el("div", { className: "gr-header" }, [
    _el("span", { className: "gr-logo", textContent: "Gradar" }),
    toggle
  ]);
  toggle.addEventListener("click", () => {
    const nowCollapsed = !root.classList.contains("gr-collapsed");
    root.classList.toggle("gr-collapsed", nowCollapsed);
    toggle.textContent = nowCollapsed ? "+" : "\u2013";
    if (opts.onToggle) opts.onToggle(nowCollapsed);
  });
  root.appendChild(header);

  // body wrapper (hidden when collapsed)
  const body = _el("div", { className: "gr-body" });
  root.appendChild(body);

  const search = _el("input", { className: "gr-search", type: "text",
    placeholder: "Type any course \u2014 e.g. STAT 390" });
  const msg = _el("div", { className: "gr-search-msg" });
  body.appendChild(_el("div", { className: "gr-search-wrap" }, [search, msg]));

  const box = _el("div", { className: "gr-coursebox" });
  body.appendChild(box);

  let curSchedule = schedule || [];

  function show(course) {
    box.textContent = "";
    box.appendChild(buildCourseCard(course, null, curSchedule));
    if (opts.onShow) opts.onShow(course);
  }
  function showHint() {
    box.textContent = "";
    box.appendChild(_el("div", { className: "gr-hint",
      textContent: "Open any course on MyPlan to see its sections, seats, professor ratings, and a GPA estimate." }));
    if (opts.onShow) opts.onShow(null);
  }

  search.addEventListener("keydown", async e => {
    if (e.key !== "Enter") return;
    const q = search.value.trim();
    if (!q) return;
    msg.textContent = "Looking up\u2026";
    let course = null;
    try { course = await searchCourse(q); } catch (_) {}
    if (course) { msg.textContent = ""; show(course); }
    else { msg.textContent = "Couldn't find that course \u2014 try the exact code, like STAT 390."; }
  });

  // let content.js drive the panel without rebuilding it on every navigation
  root._grShow = show;
  root._grShowHint = showHint;
  root._grSetSchedule = (s) => { curSchedule = s || []; };

  if (initialCourse) show(initialCourse);
  else showHint();
  return root;
}
