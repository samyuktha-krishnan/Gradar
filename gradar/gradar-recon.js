/*
  gradar-recon.js  —  run this in the DevTools Console on myplan.uw.edu (logged in).

  HOW TO USE
  1. Log into myplan.uw.edu.
  2. Open DevTools (F12 or right-click > Inspect) and click the "Console" tab.
  3. Paste this whole file in and press Enter. You'll see "recon armed".
  4. Now browse to / search a course on MyPlan and watch the console.
  5. Find the log line whose data has the course's sections, seats, or grades.
     Right-click that logged object > "Copy object", and send it to Claude along
     with the URL printed next to it. That's everything needed to finish the wiring.

  It only logs network traffic to your own console. Nothing is sent anywhere.
*/
(() => {
  const tag = (kind, url, data) =>
    console.log("%c[Gradar] " + kind, "color:#4b2e83;font-weight:bold", url, data);

  // hook fetch()
  const _fetch = window.fetch;
  window.fetch = async (...args) => {
    const res = await _fetch(...args);
    const url = (args[0] && args[0].url) || args[0];
    try {
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("json")) res.clone().json().then(j => tag("fetch", url, j)).catch(() => {});
    } catch (e) {}
    return res;
  };

  // hook XMLHttpRequest
  const _open = XMLHttpRequest.prototype.open;
  const _send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) { this.__url = u; return _open.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function () {
    this.addEventListener("load", () => {
      const ct = this.getResponseHeader("content-type") || "";
      if (ct.includes("json")) { try { tag("xhr", this.__url, JSON.parse(this.responseText)); } catch (e) {} }
    });
    return _send.apply(this, arguments);
  };

  console.log("%c[Gradar] recon armed — now click around / search a course on MyPlan.",
    "color:#1f7a43;font-weight:bold");
})();
