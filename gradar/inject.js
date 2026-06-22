/*
  inject.js — runs in the PAGE's main world (see manifest "world": "MAIN").

  MyPlan keeps its CSRF token only in page memory. We capture it two ways and
  park the latest on a DOM attribute that Gradar's content script can read:
    1) off the x-csrf-token header MyPlan stamps on its own write requests, and
    2) out of the response BODY MyPlan loads it from at page load (so we have it
       BEFORE any write — no cold-start "csrf none").
  We only read; we never modify or block the page's requests. Once we have a
  token we stop scanning.
*/
(function () {
  function have() {
    try { return !!document.documentElement.getAttribute("data-gr-csrf"); }
    catch (e) { return false; }
  }
  function stash(tok) {
    if (tok && typeof tok === "string" && !have()) {
      try { document.documentElement.setAttribute("data-gr-csrf", tok); } catch (e) {}
    }
  }
  function fromHeaders(h) {
    try {
      if (!h) return null;
      if (h instanceof Headers) return h.get("x-csrf-token");
      if (Array.isArray(h)) {
        const e = h.find(p => String(p[0]).toLowerCase() === "x-csrf-token");
        return e && e[1];
      }
      for (const k in h) if (String(k).toLowerCase() === "x-csrf-token") return h[k];
    } catch (e) {}
    return null;
  }
  // walk a parsed JSON response for the token: prefer a csrf/xsrf-named string,
  // else a long pure-hex string (the token is a long hex blob; GUIDs have dashes).
  function findToken(obj, depth) {
    if (obj == null || depth > 6 || typeof obj !== "object") return null;
    for (const k in obj) {
      const v = obj[k];
      if (typeof v === "string" && /csrf|xsrf/i.test(k) && v.length >= 16) return v;
    }
    for (const k in obj) {
      const v = obj[k];
      if (typeof v === "string") { if (/^[0-9a-f]{64,}$/i.test(v)) return v; }
      else if (typeof v === "object") { const r = findToken(v, depth + 1); if (r) return r; }
    }
    return null;
  }
  function scanText(text) {
    if (have() || !text || text.length > 2000000) return;
    let j; try { j = JSON.parse(text); } catch (e) { return; }
    const t = findToken(j, 0); if (t) stash(t);
  }

  const _fetch = window.fetch;
  if (typeof _fetch === "function") {
    window.fetch = function () {
      const args = arguments;
      try { const t = fromHeaders((args[1] || {}).headers); if (t) stash(t); } catch (e) {}
      const p = _fetch.apply(this, args);
      try {
        if (!have()) p.then(function (res) {
          try {
            const ct = res.headers.get("content-type") || "";
            if (ct.indexOf("json") >= 0 && !have()) res.clone().text().then(scanText).catch(function () {});
          } catch (e) {}
        }).catch(function () {});
      } catch (e) {}
      return p;
    };
  }

  const _setH = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
    try { if (String(k).toLowerCase() === "x-csrf-token" && v) stash(v); } catch (e) {}
    return _setH.apply(this, arguments);
  };
  const _send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function () {
    try {
      const xhr = this;
      this.addEventListener("load", function () {
        try {
          if (have()) return;
          const ct = xhr.getResponseHeader("content-type") || "";
          if (ct.indexOf("json") >= 0) scanText(xhr.responseText);
        } catch (e) {}
      });
    } catch (e) {}
    return _send.apply(this, arguments);
  };

  // Relay: Gradar's content script asks us (running as the page) to fetch the
  // user's plan, so the request carries the page's origin + credentials exactly
  // like MyPlan's own. Restricted to the plan API; read-only.
  window.addEventListener("message", function (ev) {
    try {
      if (ev.source !== window || !ev.data || ev.data.__grReq !== "plan") return;
      var id = ev.data.id, url = ev.data.url;
      if (typeof url !== "string" ||
          url.indexOf("https://plan-app-api.planning.sis.uw.edu/") !== 0) return;
      fetch(url, { credentials: "include", headers: { Accept: "application/json" } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (json) { window.postMessage({ __grRes: "plan", id: id, json: json }, location.origin); })
        .catch(function () { window.postMessage({ __grRes: "plan", id: id, json: null }, location.origin); });
    } catch (e) {}
  });
})();
