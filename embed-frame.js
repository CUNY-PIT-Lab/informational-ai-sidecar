(() => {
  "use strict";

  const search = new URLSearchParams(window.location.search);
  if (search.get("embed") !== "1" || window.parent === window) return;

  const panel = document.querySelector("#guide-panel");
  const parentOrigin = window.location.origin;

  function notifyState() {
    const expanded = Boolean(panel && !panel.hidden);
    window.parent.postMessage({ type: "fortune-sidecar-state", expanded }, parentOrigin);
  }

  function sourceDestination(anchor) {
    const declared = anchor.dataset.siteUrl || anchor.dataset.mockUrl || "";
    let linked;
    try {
      linked = new URL(anchor.href, window.location.href);
    } catch (_error) {
      return "";
    }
    let candidate = declared;
    if (!candidate) {
      if (/^(?:www\.)?fortunedigitalequity\.org$/i.test(linked.hostname)) {
        candidate = linked.href;
      } else if (linked.origin === window.location.origin) {
        candidate = linked.searchParams.get("page") || "";
      }
    }
    if (!candidate) return "";
    try {
      const url = new URL(candidate, "https://www.fortunedigitalequity.org/");
      if (!/^(?:www\.)?fortunedigitalequity\.org$/i.test(url.hostname)) return "";
      if (linked.searchParams.get("open") === "1") url.searchParams.set("open", "1");
      return url.href;
    } catch (_error) {
      return "";
    }
  }

  const observer = new MutationObserver(notifyState);
  if (panel) observer.observe(panel, { attributes: true, attributeFilter: ["class", "hidden"] });
  window.addEventListener("load", notifyState);
  window.addEventListener("resize", notifyState);
  notifyState();

  document.addEventListener("click", (event) => {
    const anchor = event.target.closest("a[href]");
    if (!anchor) return;
    const destination = sourceDestination(anchor);
    if (!destination) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.parent.postMessage(
      { type: "fortune-sidecar-navigate", url: destination },
      parentOrigin
    );
  }, true);
})();
