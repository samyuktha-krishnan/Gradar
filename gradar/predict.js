/*
  predict.js
  Predict an achievable GPA in a target course.

  Idea (the honest version of "students like you"):
    We can't use other students' individual transcripts — those are FERPA-protected
    and not public. So instead we measure where YOU land within each course's curve,
    then read that same percentile off the TARGET course's curve.

  Steps:
    1. For each past course, find your percentile within its distribution.
    2. Average those -> how you tend to perform relative to the room.
    3. Map that percentile onto the target course's distribution -> predicted GPA.
    4. Use the spread of your percentiles to produce a range, not a false-precision point.
*/

function _total(dist) { return dist.reduce((s, d) => s + d.n, 0); }

function percentileOf(gpa, dist) {
  const total = _total(dist);
  if (!total) return 0.5;
  const atOrBelow = dist.filter(d => d.gpa <= gpa).reduce((s, d) => s + d.n, 0);
  return atOrBelow / total;
}

function gpaAtPercentile(p, dist) {
  const total = _total(dist);
  if (!total) return dist.length ? dist[dist.length - 1].gpa : 0;
  const asc = dist.slice().sort((a, b) => a.gpa - b.gpa);   // low -> high, regardless of input order
  let cum = 0, prevCum = 0, prevGpa = asc[0].gpa;
  for (const d of asc) {
    prevCum = cum;
    cum += d.n / total;
    if (cum >= p) {
      if (cum === prevCum) return d.gpa;
      const frac = (p - prevCum) / (cum - prevCum);          // interpolate -> continuous estimate
      return prevGpa + frac * (d.gpa - prevGpa);
    }
    prevGpa = d.gpa;
  }
  return asc[asc.length - 1].gpa;
}

function _mean(a) { return a.reduce((s, x) => s + x, 0) / a.length; }
function _std(a) { const m = _mean(a); return Math.sqrt(_mean(a.map(x => (x - m) ** 2))); }

// transcript: [{ code, gpa, dist }],  target: { dist }
// pull the department + level out of a course code: "CSE 421" -> "CSE", 400
function _dept(code) { return (code || "").replace(/\s*\d.*$/, "").replace(/\s+/g, " ").trim().toUpperCase(); }
function _level(code) { const m = (code || "").match(/(\d)\d{2}/); return m ? (+m[1]) * 100 : 0; }

const _STEM = new Set(["CSE","CSS","MATH","AMATH","STAT","BIOST","PHYS","CHEM","BIOL","BIOC",
  "BIOEN","GENOME","NEURO","MICROM","GENET","PHARM","E E","EE","A A","AA","M E","ME","CEE","MSE",
  "IND E","INDE","CHEM E","CHEME","HCDE","INFO","DATA","ASTR","ATM S","ESS","OCEAN","ENGR",
  "BIO A","FISH","ENV H","NUTR"]);
function _isStem(code) { return _STEM.has(_dept(code)); }

// material overlap between two keyword lists (course descriptions), 0..1
function _jaccard(a, b) {
  if (!a || !b || !a.length || !b.length) return 0;
  const A = new Set(a), B = new Set(b);
  let inter = 0;
  A.forEach(x => { if (B.has(x)) inter++; });
  const uni = A.size + B.size - inter;
  return uni ? inter / uni : 0;
}

// how much a past course should count toward predicting the target: same subject
// weighs most, then same STEM/non-STEM class (a STEM target leans on your STEM
// record, a gen-ed leans on your gen-eds), then similar course level. This is what
// makes the estimate vary by course instead of returning one global number.
function _weight(courseCode, targetCode) {
  if (!targetCode) return 1;
  let w = 1;
  if (_dept(courseCode) === _dept(targetCode)) w += 3;
  if (_isStem(courseCode) === _isStem(targetCode)) w += 0.8;
  const lc = _level(courseCode), lt = _level(targetCode);
  if (lc && lt) { const d = Math.abs(lc - lt); if (d === 0) w += 0.6; else if (d <= 100) w += 0.3; }
  return w;
}

function predictGPA(transcript, target, opts) {
  opts = opts || {};
  if (!target || !target.dist || !target.dist.length) {
    return { ok: false, reason: "Grade data for this course isn't loaded yet." };
  }
  const usable = transcript.filter(c => c.dist && c.dist.length);
  if (usable.length < 3) {
    return { ok: false, reason: "Add at least 3 past courses to get a prediction." };
  }

  // each past course's percentile, nudged by the quarter-load context it was earned in
  const pcts = usable.map(c => {
    const base = percentileOf(c.gpa, c.dist);
    return { code: c.code, kw: c.kw || null,
      pct: Math.max(0.02, Math.min(0.98, base + (c.ctxShift || 0))) };
  });

  // two readings of "how you tend to do":
  //  - subject view: weighted toward courses like the target (same dept/level, and
  //    — when descriptions are available — similar MATERIAL). A class you did well in
  //    that genuinely overlaps the target's content therefore pulls the estimate up.
  //  - overall view: your whole record, equally weighted (your general performance)
  const wItems = pcts.map(p => {
    let w = _weight(p.code, opts.targetCode);
    if (opts.targetKw && p.kw) w += 2.5 * _jaccard(p.kw, opts.targetKw);   // material overlap
    return { pct: p.pct, w: w };
  });
  const wsum = wItems.reduce((s, i) => s + i.w, 0) || 1;
  const pSubject = wItems.reduce((s, i) => s + i.pct * i.w, 0) / wsum;
  const pOverall = pcts.reduce((s, p) => s + p.pct, 0) / pcts.length;

  // How forgiving is the TARGET course, from its real DawgPath distribution?
  //  med   = typical grade
  //  floor = what even the bottom third earns. A HIGH floor means it's genuinely
  //          hard to do badly (real consensus that it's easy) — that's the signal
  //          that should override subject-specific weakness, NOT a merely high median.
  const med = gpaAtPercentile(0.5, target.dist);
  const floor = gpaAtPercentile(0.3, target.dist);
  const ease = Math.max(0, Math.min(1, (med - 3.0) / 0.85));      // for the label + range width only

  // Default: your prediction rests on your SUBJECT performance — how you've actually
  // done in courses like this. Only a genuinely forgiving course (high floor) leans
  // partway toward your overall record. A normal/hard course is driven by your grades.
  const forgive = Math.max(0, Math.min(1, (floor - 3.4) / 0.3));   // 0 at floor<=3.4, full at >=3.7
  const blend = forgive * 0.45;                                    // overall record caps at 45%
  let pMean = pSubject * (1 - blend) + pOverall * blend;

  const variance = wItems.reduce((s, i) => s + i.w * (i.pct - pSubject) * (i.pct - pSubject), 0) / wsum;
  const pSD = Math.sqrt(Math.max(0, variance));

  // professor nudge (RMP), capped so it never dominates the data
  const shift = Math.max(-0.12, Math.min(0.12, opts.profShift || 0));
  const pAdj = Math.max(0.02, Math.min(0.98, pMean + shift));

  const round = x => Math.round(x * 100) / 100;
  let predicted = gpaAtPercentile(pAdj, target.dist);

  // Consensus lift: only for genuinely forgiving courses, and gently.
  if (floor >= 3.55) {
    const lift = Math.min(1, (floor - 3.55) / 0.45);
    const high = gpaAtPercentile(0.9, target.dist);
    predicted = predicted + lift * 0.35 * (high - predicted);
  }

  // Demonstrated-average anchor (prioritizes your real grades): an estimate may not
  // sit far above your weighted average grade in related courses unless the course is
  // genuinely forgiving. One-directional — pulls optimism DOWN toward your track
  // record, never lifts a hard course up.
  const subjAvgGPA = wItems.reduce((s, i, idx) => s + usable[idx].gpa * i.w, 0) / wsum;
  const downAnchor = (1 - forgive) * 0.5;
  if (predicted > subjAvgGPA) {
    predicted = predicted * (1 - downAnchor) + subjAvgGPA * downAnchor;
  }
  predicted = Math.min(4.0, predicted);

  // Interval = uncertainty in the ESTIMATE, not your whole performance spread.
  // Use the standard error of your mean percentile (shrinks with more courses),
  // widened slightly, tightened for forgiving courses, then capped in GPA terms so
  // it stays a believable band rather than spanning the scale.
  const clampP = x => Math.max(0.02, Math.min(0.98, x));
  let kPct = (pSD / Math.sqrt(usable.length)) * 1.4 * (1 - ease * 0.4);
  kPct = Math.max(0.035, Math.min(0.12, kPct));
  let lo = gpaAtPercentile(clampP(pAdj - kPct), target.dist);
  let hi = gpaAtPercentile(clampP(pAdj + kPct), target.dist);
  lo = Math.min(predicted - 0.1, Math.max(lo, predicted - 0.4));  // bracket predicted, cap half-width
  hi = Math.max(predicted + 0.1, Math.min(hi, predicted + 0.4));
  hi = Math.min(4.0, hi);
  lo = Math.max(0, lo);
  if (hi - lo < 0.2) lo = Math.max(0, hi - 0.2);                  // never a degenerate band

  const sameSubj = opts.targetCode ? usable.filter(c => _dept(c.code) === _dept(opts.targetCode)).length : 0;
  return {
    ok: true,
    predicted: Math.round(predicted * 10) / 10,                 // tenths
    range: [round(lo), round(hi)],
    yourPercentile: Math.round(pMean * 100),
    confidence: usable.length >= 6 ? "higher" : "rough",
    profAdjusted: !!shift,
    sameSubjectCount: sameSubj,
    dept: _dept(opts.targetCode),
    courseEase: ease >= 0.66 ? "runs easy" : (ease <= 0.2 ? "tough curve" : null),
    courseMedian: round(med),
  };
}
