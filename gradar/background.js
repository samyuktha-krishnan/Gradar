/*
  background.js
  Cross-origin requests run here (the extension has host permission, so no CORS block).
   - gr-fetch: GET MyPlan's course API (with your session cookies)
   - gr-rmp:   POST RateMyProfessors' GraphQL to get a professor's average rating
*/
const RMP_SCHOOL_ID = "U2Nob29sLTE1MzA=";        // base64 of "School-1530" = UW Seattle
const RMP_AUTH = "Basic dGVzdDp0ZXN0";           // RMP's public frontend token ("test:test")
const RMP_QUERY = `query($text:String!,$schoolID:ID!){newSearch{teachers(query:{text:$text,schoolID:$schoolID}){edges{node{firstName lastName avgRating numRatings avgDifficulty wouldTakeAgainPercent legacyId school{name id}}}}}}`;

const COURSE_API = "https://course-app-api.planning.sis.uw.edu";

// MyPlan's API hands the CSRF token back in a response header on GETs; writes must
// reflect it. The worker can read these headers (no CORS limit on host_permissions).
let lastCsrf = null;
function readCsrfHeader(r) {
  return r.headers.get("x-csrf-token") || r.headers.get("X-CSRF-TOKEN")
      || r.headers.get("csrf-token")   || r.headers.get("x-xsrf-token") || null;
}
async function harvestCsrf(primeUrl) {
  const urls = [primeUrl, COURSE_API + "/api/plan/items", COURSE_API + "/api/system/config"].filter(Boolean);
  for (const u of urls) {
    try {
      const r = await fetch(u, { credentials: "include", headers: { Accept: "application/json" } });
      const t = readCsrfHeader(r);
      if (t) { lastCsrf = t; return t; }
    } catch (e) {}
  }
  return lastCsrf;   // fall back to anything a prior GET already captured
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "gr-fetch") {
    fetch(msg.url, { credentials: "include", headers: { Accept: "application/json" } })
      .then(r => { const t = readCsrfHeader(r); if (t) lastCsrf = t; return r.ok ? r.json() : null; })
      .then(data => sendResponse({ ok: true, data }))
      .catch(err => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (msg && msg.type === "gr-rmp") {
    fetch("https://www.ratemyprofessors.com/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": RMP_AUTH },
      body: JSON.stringify({ query: RMP_QUERY, variables: { text: msg.name, schoolID: RMP_SCHOOL_ID } }),
    })
      .then(r => (r.ok ? r.json() : null))
      .then(j => {
        const edges = (j && j.data && j.data.newSearch && j.data.newSearch.teachers && j.data.newSearch.teachers.edges) || [];
        sendResponse({ ok: true, data: edges.map(e => e.node) });   // all candidates; caller picks best
      })
      .catch(err => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  // add a course to the user's real MyPlan plan (the request MyPlan itself sends)
  if (msg && msg.type === "gr-plan-add") {
    (async () => {
      let csrf = msg.csrf || await harvestCsrf(msg.primeUrl);   // get the token MyPlan wants
      const headers = { "Content-Type": "application/json", "Accept": "application/json" };
      if (csrf) headers["x-csrf-token"] = csrf;
      try {
        const r = await fetch(COURSE_API + "/api/plan/items", {
          method: "POST",
          credentials: "include",
          headers,
          body: JSON.stringify(msg.body),
        });
        const t = readCsrfHeader(r); if (t) lastCsrf = t;
        const text = await r.text();
        let data; try { data = JSON.parse(text); } catch (e) { data = text; }
        console.log("[Gradar] plan-add", r.status, msg.body, "\u2192", data);
        sendResponse({ ok: r.ok, status: r.status, data, via: "bg",
          csrfHint: csrf ? csrf.slice(0, 6) : null });
      } catch (err) {
        sendResponse({ ok: false, status: 0, error: String(err), via: "bg",
          csrfHint: csrf ? csrf.slice(0, 6) : null });
      }
    })();
    return true;
  }
});
