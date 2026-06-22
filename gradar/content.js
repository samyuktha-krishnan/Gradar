/*
  content.js
  Mounts the Gradar panel ONCE and keeps it alive as you move around MyPlan.
  - Land on a new course page -> the card swaps to that course.
  - Browse other (non-course) MyPlan pages -> whatever you last viewed or
    searched stays put (no rebuild, no flicker).
  MyPlan is a single-page app, so the floating panel survives navigation; we
  only re-create it if MyPlan ever detaches it (e.g. a full page reload).
*/
(function () {
  let panelRoot = null;       // the .gr-panel element (exposes _grShow / _grSetSchedule)
  let displayedCode = null;   // course currently shown (searched OR viewed), normalized
  let collapsed = false;      // survives across navigations

  // course code from the current MyPlan URL, normalized to e.g. "CSE 421"
  function pageCode() {
    const ref = getCourseRefFromPage();
    if (!ref) return null;
    try { return decodeURIComponent(ref.code).replace(/\s+/g, " ").trim().toUpperCase(); }
    catch (e) { return ref.code; }
  }
  function norm(code) { return (code || "").replace(/\s+/g, " ").trim().toUpperCase(); }

  function buildShell(initialCourse, schedule) {
    const m = document.createElement("div");
    m.id = "gr-mount";
    m.className = "gr-floating";
    panelRoot = buildGradarPanel(initialCourse, getTranscript(), schedule, {
      collapsed: collapsed,
      onToggle: function (v) { collapsed = v; },
      onShow:   function (course) { displayedCode = course ? norm(course.code) : null; }
    });
    m.appendChild(panelRoot);
    document.body.appendChild(m);
  }

  async function showPageCourse() {
    let course = null;
    try { course = await readCourseFromPageAsync(); } catch (e) {}
    if (!course) course = getCourse();
    let schedule = [];
    try { schedule = await getPlanned(); } catch (e) {}
    if (panelRoot && panelRoot._grShow) {
      panelRoot._grSetSchedule(schedule);
      panelRoot._grShow(course);
    }
  }

  async function init() {
    let schedule = [];
    try { schedule = await getPlanned(); } catch (e) {}
    let course = null;
    if (pageCode()) {
      try { course = await readCourseFromPageAsync(); } catch (e) {}
      if (!course) course = getCourse();
    }
    buildShell(course, schedule);   // course = null -> hint shows
  }

  function check() {
    // re-create the shell only if MyPlan tore it out of the DOM
    if (!panelRoot || !document.body.contains(document.getElementById("gr-mount"))) {
      init();
      return;
    }
    const pc = pageCode();
    // on a course page that differs from what's shown -> swap to it.
    // on a non-course page -> leave the last searched/viewed course alone.
    if (pc && pc !== displayedCode) showPageCourse();
  }

  init();
  window.addEventListener("hashchange", check);
  window.addEventListener("popstate", check);
  setInterval(check, 1000);
})();
