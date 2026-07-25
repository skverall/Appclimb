(function () {
  "use strict";

  var script = document.currentScript;
  if (!script || navigator.doNotTrack === "1") return;

  var token = script.getAttribute("data-token");
  if (!token) return;

  var endpoint =
    script.getAttribute("data-endpoint") ||
    new URL("/api/track", script.src).toString();
  var storageMode = script.getAttribute("data-storage") || "session";
  var visitorStorage =
    storageMode === "persistent" ? window.localStorage : window.sessionStorage;
  var sessionStorage = window.sessionStorage;

  function uuid() {
    if (window.crypto && window.crypto.randomUUID) {
      return window.crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
      /[xy]/g,
      function (character) {
        var random = (Math.random() * 16) | 0;
        var value = character === "x" ? random : (random & 3) | 8;
        return value.toString(16);
      },
    );
  }

  function readID(storage, key) {
    try {
      var current = storage.getItem(key);
      if (current) return current;
      current = uuid();
      storage.setItem(key, current);
      return current;
    } catch {
      return uuid();
    }
  }

  var visitorID = readID(visitorStorage, "appclimb_visitor_id");
  var sessionID = readID(sessionStorage, "appclimb_session_id");
  var pageStartedAt = Date.now();
  var lastPath = "";
  var sentEngagement = false;

  function dimensions() {
    var params = new URLSearchParams(window.location.search);
    return {
      utmSource: params.get("utm_source") || "",
      utmMedium: params.get("utm_medium") || "",
      utmCampaign: params.get("utm_campaign") || "",
      utmTerm: params.get("utm_term") || "",
      utmContent: params.get("utm_content") || "",
    };
  }

  function send(kind, extra) {
    var payload = Object.assign(
      {
        token: token,
        eventId: uuid(),
        kind: kind,
        visitorId: visitorID,
        sessionId: sessionID,
        occurredAt: new Date().toISOString(),
        hostname: window.location.hostname,
        path: window.location.pathname,
        referrer: document.referrer || "",
      },
      dimensions(),
      extra || {},
    );
    try {
      window.fetch(endpoint, {
        method: "POST",
        mode: "cors",
        credentials: "omit",
        keepalive: true,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(function () {});
    } catch {}
  }

  function pageview() {
    var path = window.location.pathname + window.location.search;
    if (path === lastPath) return;
    lastPath = path;
    pageStartedAt = Date.now();
    sentEngagement = false;
    send("page_view");
    window.setTimeout(function () {
      if (!sentEngagement && lastPath === path) {
        sentEngagement = true;
        send("engagement", { durationMs: Date.now() - pageStartedAt });
      }
    }, 10000);
  }

  function routeChanged(original) {
    return function () {
      var result = original.apply(this, arguments);
      window.setTimeout(pageview, 0);
      return result;
    };
  }

  window.history.pushState = routeChanged(window.history.pushState);
  window.history.replaceState = routeChanged(window.history.replaceState);
  window.addEventListener("popstate", pageview);
  window.addEventListener("pagehide", function () {
    if (!sentEngagement) {
      sentEngagement = true;
      send("engagement", { durationMs: Date.now() - pageStartedAt });
    }
  });

  window.appclimbAnalytics = {
    track: function (kind, options) {
      if (kind === "conversion") {
        send("conversion", {
          goal:
            options && typeof options.goal === "string"
              ? options.goal
              : "conversion",
        });
      }
    },
  };
  pageview();
})();
