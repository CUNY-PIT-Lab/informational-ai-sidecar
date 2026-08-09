(() => {
  "use strict";

  const script = document.currentScript;
  if (!script) return;

  const sourceUrl = script.dataset.sourceUrl || "";
  const assetRoot = new URL("./", script.src);
  const allowedHosts = new Set([
    "fortunedigitalequity.org",
    "www.fortunedigitalequity.org",
  ]);
  const liveOnlyPaths = new Set([
    "/file-share",
    "/groups",
    "/members",
    "/pdf2-upload",
  ]);
  let knownRoutes = null;

  function canonicalUrl(value) {
    try {
      const url = new URL(value, sourceUrl || "https://www.fortunedigitalequity.org/");
      if (url.protocol !== "https:" || !allowedHosts.has(url.hostname.toLowerCase())) {
        return "";
      }
      const path = url.pathname.replace(/\/+$/, "") || "/";
      return `https://www.fortunedigitalequity.org${path}`;
    } catch (_error) {
      return "";
    }
  }

  function validatedLiveUrl(value) {
    try {
      const url = new URL(value, sourceUrl || "https://www.fortunedigitalequity.org/");
      if (url.protocol !== "https:" || !allowedHosts.has(url.hostname.toLowerCase())) return null;
      return url;
    } catch (_error) {
      return null;
    }
  }

  function replicaUrl(value) {
    if (!knownRoutes) return null;
    let original;
    try {
      original = new URL(value, sourceUrl);
    } catch (_error) {
      return null;
    }
    const canonical = canonicalUrl(original.href);
    if (!canonical || !knownRoutes.has(canonical)) return null;
    const canonicalPath = new URL(canonical).pathname;
    if (liveOnlyPaths.has(canonicalPath)) return null;
    const path = canonicalPath.replace(/^\//, "");
    const destination = new URL(path, assetRoot);
    destination.search = original.search;
    destination.hash = original.hash;
    return destination;
  }

  function rewriteInternalLinks() {
    if (!knownRoutes) return;
    document.querySelectorAll("a[href]").forEach((anchor) => {
      if (anchor.dataset.liveAction === "true") return;
      const destination = replicaUrl(anchor.href);
      if (destination) anchor.href = destination.href;
    });
  }

  fetch(new URL("site-index.json", assetRoot), { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error(`route index returned ${response.status}`);
      return response.json();
    })
    .then((index) => {
      knownRoutes = new Set((index.pages || []).map((page) => canonicalUrl(page.url)).filter(Boolean));
      rewriteInternalLinks();
    })
    .catch(() => {
      knownRoutes = new Set();
    });

  document.addEventListener("click", (event) => {
    const anchor = event.target.closest("a[href]");
    if (!anchor) return;
    if (anchor.dataset.liveAction === "true") return;
    const destination = replicaUrl(anchor.href);
    if (destination) anchor.href = destination.href;
  }, true);

  const notice = document.createElement("div");
  notice.id = "fortune-replica-notice";
  notice.setAttribute("role", "note");
  notice.append("Static snapshot of the live Fortune site · Interactive services open on ");
  const liveLink = document.createElement("a");
  liveLink.href = canonicalUrl(sourceUrl) || "https://www.fortunedigitalequity.org/";
  liveLink.target = "_blank";
  liveLink.rel = "noreferrer";
  liveLink.dataset.liveAction = "true";
  liveLink.textContent = "Fortune's current website";
  notice.append(liveLink, ".");
  document.body.prepend(notice);

  if (new URLSearchParams(window.location.search).get("guide") === "0") return;

  const host = document.createElement("div");
  host.id = "fortune-sidecar-host";
  host.dataset.expanded = "false";

  const frame = document.createElement("iframe");
  frame.id = "fortune-sidecar-frame";
  frame.title = "Website Guide";
  frame.loading = "eager";
  frame.setAttribute(
    "sandbox",
    "allow-forms allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
  );

  const frameUrl = new URL("sidecar.html", assetRoot);
  frameUrl.searchParams.set("embed", "1");
  frameUrl.searchParams.set("page", canonicalUrl(sourceUrl) || sourceUrl);
  const pageSearch = new URLSearchParams(window.location.search);
  if (pageSearch.get("open") === "1") frameUrl.searchParams.set("open", "1");
  frame.src = frameUrl.href;
  host.append(frame);
  document.body.append(host);

  window.addEventListener("message", (event) => {
    if (event.source !== frame.contentWindow || event.origin !== window.location.origin) return;
    const message = event.data || {};
    if (message.type === "fortune-sidecar-state") {
      host.dataset.expanded = message.expanded ? "true" : "false";
      return;
    }
    if (message.type === "fortune-sidecar-navigate") {
      const destination = replicaUrl(message.url);
      if (destination) {
        window.location.assign(destination.href);
        return;
      }
      const liveDestination = validatedLiveUrl(message.url);
      if (liveDestination) window.location.assign(liveDestination.href);
    }
  });
})();
