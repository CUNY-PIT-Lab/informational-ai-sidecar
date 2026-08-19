(() => {
  "use strict";

  const Core = window.FortuneGuideCore;
  if (!Core) throw new Error("FortuneGuideCore must load before site.js");
  const SITE_ORIGIN = "https://www.fortunedigitalequity.org";
  const CONTACT_URL = `${SITE_ORIGIN}/contact`;
  const WORKSHOPS_URL = `${SITE_ORIGIN}/workshops`;
  const CALENDAR_URL = `${SITE_ORIGIN}/calendar`;
  const DEVICES_URL = `${SITE_ORIGIN}/devices`;
  const SUPPORT_URL = `${SITE_ORIGIN}/support`;
  const PRACTICE_URL = `${SITE_ORIGIN}/practice`;
  const ASSET_BASE = String(window.FORTUNE_ASSET_BASE || "");
  const STATIC_ROUTES = Boolean(window.FORTUNE_STATIC_ROUTES);
  const BOT_MESSAGE_WORD_LIMIT = 48;

  const state = {
    index: null,
    pages: [],
    byUrl: new Map(),
    current: null,
  };
  const GUIDE_CONTEXT_PAGES = [
    {
      id: "trainings",
      title: "Regular Workshops",
      url: WORKSHOPS_URL,
      description: "Beginner, intermediate, and advanced digital-skills workshops.",
      blocks: ["Use the live workshop page for current topics and prerequisites."],
      authority: "answer",
      status: 200,
      volatile: true,
    },
    {
      id: "individual",
      title: "Individual Support",
      url: SUPPORT_URL,
      description: "One-to-one tutoring, computer-lab access, and technical support.",
      blocks: ["Use the live support page for current hours and appointments."],
      authority: "answer",
      status: 200,
      volatile: true,
    },
    {
      id: "contact",
      title: "Contact Digital Equity",
      url: CONTACT_URL,
      description: "Official contact information for Fortune’s Digital Equity team.",
      blocks: ["Use the official contact page for personal help."],
      authority: "answer",
      status: 200,
      volatile: true,
    },
  ];
  const memberSignedOut = document.querySelector("#member-signed-out");
  const memberProfile = document.querySelector("#member-profile");

  const BOILERPLATE = [
    /double click on the text box/i,
    /this space is a great opportunity/i,
    /every website has a story/i,
    /Description UNDER DEVELOPMENT/i,
    /use tab to navigate/i,
    /^icon representing\b/i,
    /^(?:image|photo|photograph)\s+(?:of|showing)\b/i,
    /^a digital navigator helping\b/i,
    /^participant being helped\b/i,
    /^the crowd at the annual fortune society tech fair\b/i,
  ];

  function canonicalUrl(value) {
    return Core.canonicalUrl(value);
  }

  function safeMemberUrl(value, fallback = `${SITE_ORIGIN}/members`) {
    try {
      const url = new URL(String(value || fallback), SITE_ORIGIN);
      if (url.protocol !== "https:" || !/^(?:www\.)?fortunedigitalequity\.org$/i.test(url.hostname)) return fallback;
      return url.href;
    } catch {
      return fallback;
    }
  }

  function setMemberState(context = {}) {
    const signedIn = Boolean(context?.signedIn);
    memberSignedOut.hidden = signedIn;
    memberProfile.hidden = !signedIn;
    if (signedIn) memberProfile.href = safeMemberUrl(context.profileUrl);
  }

  function pathFor(value) {
    return Core.pathFor(value);
  }

  function cleanText(value) {
    return Core.cleanText(value);
  }

  function cleanTitle(value) {
    return Core.cleanTitle(value);
  }

  function clipWords(value, limit = 48) {
    const words = cleanText(value).split(/\s+/).filter(Boolean);
    if (words.length <= limit) return words.join(" ");
    return `${words.slice(0, limit).join(" ").replace(/[,;:]$/, "")}…`;
  }

  function usefulBlocks(page) {
    if (!page || page.authority === "excluded" || Number(page.status) !== 200) return [];
    const title = cleanTitle(page.title).toLowerCase();
    const seen = new Set();
    return (Array.isArray(page.blocks) ? page.blocks : [])
      .map(block => cleanText(block)
        .replace(/^Home Service list\s+/i, "")
        .replace(/\bUpcoming Sessions All Locations\b/gi, "")
        .replace(/\bLoading (?:days|times|availability)\b/gi, "")
        .replace(/\bBook Now\b/gi, "")
        .trim())
      .filter(block => block.length >= 34)
      .filter(block => !BOILERPLATE.some(pattern => pattern.test(block)))
      .map(block => block.replace(new RegExp(`^${escapeRegExp(title)}\\s+`, "i"), ""))
      .map(block => block.replace(/^.*?\bDescription\s+/i, ""))
      .filter(block => {
        const key = block.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function pageFamily(page) {
    return Core.pageFamily(page);
  }

  function selectedUrl() {
    if (window.FORTUNE_ROUTE_URL) return canonicalUrl(window.FORTUNE_ROUTE_URL);
    const fromQuery = new URLSearchParams(window.location.search).get("page");
    return canonicalUrl(fromQuery || SITE_ORIGIN);
  }

  function hrefFor(value) {
    return Core.hrefFor(value, {
      staticRoutes: STATIC_ROUTES,
      assetBase: ASSET_BASE,
      knownUrls: state.byUrl,
    });
  }

  function renderPage(page) {
    state.current = page;
    const family = pageFamily(page);
    const title = cleanTitle(page?.title);
    const heading = document.querySelector("#page-heading");
    const loading = document.querySelector("#page-loading");
    const documentPanel = document.querySelector("#page-document");
    const summary = document.querySelector("#page-summary");
    const blocks = document.querySelector("#page-blocks");
    const liveLink = document.querySelector("#live-page-link");

    document.title = `${title} · Website Guide demo`;
    document.body.dataset.page = pathFor(page.url);
    document.body.dataset.sourceUrl = page.url;
    heading.textContent = title;
    loading.hidden = true;
    documentPanel.hidden = false;
    blocks.replaceChildren();
    liveLink.href = page.url;

    if (family === "excluded") {
      summary.textContent = "This route is retained in the site inventory but is not reproduced in the public demonstration.";
      appendStatus(blocks, "Use the current public service directory or contact Digital Equity staff for help.");
    } else if (family === "archive") {
      summary.textContent = "This page contains historical information. Current services, dates, and registration may have changed.";
      appendStatus(blocks, "The guide can take you to the current calendar, training directory, or staff contact.");
    } else if (Number(page.status) !== 200) {
      summary.textContent = "The public index found this route but did not receive a complete page record.";
      appendStatus(blocks, "Use the live page, current training directory, or staff contact before relying on details.");
    } else {
      const pageBlocks = usefulBlocks(page);
      summary.textContent = clipWords(page.description || pageBlocks[0] || "Use the page guide to find the relevant Digital Equity information and next page.", 58);
      pageBlocks.slice(page.description ? 0 : 1, 5).forEach((text, index) => {
        const section = document.createElement("section");
        const paragraph = document.createElement("p");
        paragraph.textContent = clipWords(text, index === 0 ? 90 : 70);
        section.append(paragraph);
        blocks.append(section);
      });
    }

    document.querySelectorAll("[data-site-url]").forEach(link => {
      const url = canonicalUrl(link.dataset.siteUrl);
      link.href = hrefFor(url);
      link.toggleAttribute("aria-current", pathFor(url) === pathFor(page.url));
    });

    window.dispatchEvent(new CustomEvent("fortune:pagechange", { detail: { page, starter: Core.starterFor(page) } }));
  }

  function appendStatus(container, text) {
    const section = document.createElement("section");
    section.className = "page-status";
    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    section.append(paragraph);
    container.append(section);
  }

  function navigate(value) {
    const canonical = canonicalUrl(value);
    const page = state.byUrl.get(canonical);
    if (!page) {
      window.location.assign(value);
      return;
    }
    if (STATIC_ROUTES) {
      window.location.assign(hrefFor(canonical));
      return;
    }
    window.history.pushState({ page: pathFor(canonical) }, "", hrefFor(canonical));
    renderPage(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function initialize() {
    const response = await fetch(`${ASSET_BASE}site-index.json`, { cache: "no-store" });
    if (!response.ok) throw new Error("The public page index could not be loaded.");
    state.index = await response.json();
    state.pages = Array.isArray(state.index.pages) ? state.index.pages : [];
    state.pages.forEach(page => state.byUrl.set(canonicalUrl(page.url), page));
    GUIDE_CONTEXT_PAGES.forEach(page => {
      const url = canonicalUrl(page.url);
      if (state.byUrl.has(url)) return;
      state.pages.push(page);
      state.byUrl.set(url, page);
    });
    const page = state.byUrl.get(selectedUrl()) || state.byUrl.get(`${SITE_ORIGIN}/`) || state.pages[0];
    if (!page) throw new Error("No public page records are available.");
    renderPage(page);
    return page;
  }

  document.addEventListener("click", event => {
    const link = event.target.closest("a[data-site-url], a[data-mock-url]");
    if (!link || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (STATIC_ROUTES) return;
    const url = link.dataset.siteUrl || link.dataset.mockUrl;
    const canonical = canonicalUrl(url);
    if (!canonical || !state.byUrl.has(canonical)) return;
    event.preventDefault();
    navigate(canonical);
  });

  window.addEventListener("popstate", () => {
    if (STATIC_ROUTES) return;
    const page = state.byUrl.get(selectedUrl()) || state.byUrl.get(`${SITE_ORIGIN}/`);
    if (page) renderPage(page);
  });
  window.addEventListener("fortune:memberstate", event => setMemberState(event.detail));
  setMemberState(window.FORTUNE_MEMBER_CONTEXT);

  const ready = initialize().catch(error => {
    const loading = document.querySelector("#page-loading");
    if (loading) loading.textContent = error.message;
    throw error;
  });

  window.FortuneMockSite = Object.freeze({
    ready,
    canonicalUrl,
    cleanTitle,
    getCurrentPage: () => state.current,
    getIndex: () => state.index,
    getStarter: page => Core.starterFor(page || state.current),
    hrefFor,
    isKnown: value => state.byUrl.has(canonicalUrl(value)),
    navigate,
    setMemberState,
  });
})();
