import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const require = createRequire(import.meta.url);
const TESTS = dirname(fileURLToPath(import.meta.url));
const DEMO = dirname(TESTS);
const Core = require(join(DEMO, "guide-core.js"));
const index = JSON.parse(readFileSync(join(DEMO, "site-index.json"), "utf8"));
const pages = index.pages;
const byPath = new Map(pages.map(page => [new URL(page.url).pathname, page]));
const evaluationSource = readFileSync(join(DEMO, "evaluation.js"), "utf8");

function runEmbedBridge({ panelHidden = true, anchor = null } = {}) {
  const messages = [];
  let clickHandler = null;
  const panel = { hidden: panelHidden };
  const parent = {
    postMessage(message, origin) { messages.push({ message, origin }); },
  };
  const location = {
    search: "?embed=1",
    origin: "https://zmuhls.github.io",
    href: "https://zmuhls.github.io/fortune-digital-equity-guide-demo/sidecar.html?embed=1",
  };
  const window = {
    parent,
    location,
    addEventListener() {},
  };
  const document = {
    querySelector(selector) {
      if (selector === "#guide-panel") return panel;
      return null;
    },
    addEventListener(type, handler) {
      if (type === "click") clickHandler = handler;
    },
  };
  class MutationObserver {
    constructor() {}
    observe() {}
  }
  runInNewContext(
    readFileSync(join(DEMO, "embed-frame.js"), "utf8"),
    { window, document, MutationObserver, URL, URLSearchParams },
  );
  if (anchor && clickHandler) {
    clickHandler({
      target: { closest: () => anchor },
      preventDefault() {},
      stopImmediatePropagation() {},
    });
  }
  return messages;
}

function evaluationTimestampHelpers() {
  const start = evaluationSource.indexOf("function timestampValue(value)");
  const end = evaluationSource.indexOf("function setStatus(message", start);
  assert.ok(start >= 0 && end > start, "evaluation timestamp helpers are present");
  return evaluationSource.slice(start, end);
}

test("evaluation conversations are ordered newest first before pagination", () => {
  const helpers = evaluationTimestampHelpers();
  const conversations = [
    { id: "older", last_turn_at: "2026-08-15T12:00:00Z" },
    { id: "same-b", last_turn_at: "2026-08-17T12:00:00Z" },
    { id: "invalid", last_turn_at: "" },
    { id: "newest", last_turn_at: "2026-08-18T12:00:00Z" },
    { id: "same-a", last_turn_at: "2026-08-17T12:00:00Z" },
  ];
  const orderedJson = runInNewContext(
    `${helpers}; JSON.stringify(newestFirst(${JSON.stringify(conversations)}).map(item => item.id))`,
    { Date, Intl, JSON, Number, String },
  );
  assert.deepEqual(JSON.parse(orderedJson), ["newest", "same-a", "same-b", "older", "invalid"]);
});

test("canonical URLs stay on the approved public host", () => {
  assert.equal(Core.canonicalUrl("https://fortunedigitalequity.org/devices/?x=1#top"), "https://www.fortunedigitalequity.org/devices");
  assert.equal(Core.canonicalUrl("/about/"), "https://www.fortunedigitalequity.org/about");
  assert.equal(Core.canonicalUrl("https://example.com/devices"), "");
  assert.equal(Core.pathFor("https://www.fortunedigitalequity.org/"), "/");
  assert.equal(Core.canonicalUrl("/trainings"), "https://www.fortunedigitalequity.org/workshops");
  assert.equal(Core.canonicalUrl("/individual"), "https://www.fortunedigitalequity.org/support");
  assert.equal(Core.canonicalUrl("/reserve"), "https://www.fortunedigitalequity.org/calendar");
  assert.equal(Core.canonicalUrl("/about/partners"), "https://www.fortunedigitalequity.org/about");
});

test("all 138 routes receive one of the reviewed page families", () => {
  const counts = {};
  for (const page of pages) {
    const family = Core.pageFamily(page);
    counts[family] = (counts[family] || 0) + 1;
  }
  assert.deepEqual(counts, {
    program: 3,
    excluded: 18,
    action: 3,
    directory: 6,
    support: 2,
    event: 4,
    archive: 21,
    news: 9,
    service: 72,
  });
  assert.equal(Object.values(counts).reduce((sum, value) => sum + value, 0), 138);
});

test("every page has a tailored heading, placeholder, and exactly two prompts", () => {
  for (const page of pages) {
    const starter = Core.starterFor(page);
    assert.ok(starter.heading.length > 8, page.url);
    assert.ok(starter.placeholder.endsWith("?"), page.url);
    assert.equal(starter.suggestions.length, 2, page.url);
    assert.equal(new Set(starter.suggestions).size, 2, page.url);
  }
  assert.equal(Core.starterFor(byPath.get("/devices")).placeholder, "Do you need a device or help using one?");
  assert.equal(Core.starterFor(byPath.get("/calendar")).suggestions[0], "Where and when are current classes?");
  assert.equal(Core.starterFor(byPath.get("/service-page/understanding-computers")).suggestions[0], "What does this class cover?");
});

test("starter prompts keep their full question while exposing compact button labels", () => {
  assert.equal(Core.suggestionLabel("What is the main information here?"), "Page summary");
  assert.equal(Core.suggestionLabel("Where should I go next?"), "Next step");
  assert.equal(Core.suggestionLabel("What does this class cover?"), "Class details");
  assert.equal(Core.suggestionLabel("I need information about getting a device"), "Get a device");
  assert.equal(Core.suggestionLabel("Where and when are current classes?"), "Class times");

  for (const page of pages) {
    for (const prompt of Core.starterFor(page).suggestions) {
      const label = Core.suggestionLabel(prompt);
      assert.ok(label.length > 0 && label.length <= 32, `${page.url}: ${label}`);
      assert.equal(/[?!.]$/.test(label), false, `${page.url}: ${label}`);
    }
  }
});

test("current-page evidence is recognized before a wider search", () => {
  const devices = byPath.get("/devices");
  const calendar = byPath.get("/calendar");
  assert.equal(Core.currentPageCanAnswer("Can I get a free laptop?", devices), true);
  assert.equal(Core.currentPageCanAnswer("Can I get a free laptop?", calendar), false);
  assert.equal(Core.currentPageCanAnswer("What does this page say?", calendar), true);
  assert.equal(Core.currentPageCanAnswer("What is the zzyzx quasar permit policy?", calendar), false);
});

test("excluded, archived, and partial records can never become current-page evidence", () => {
  for (const page of pages.filter(page => page.authority !== "answer" || Number(page.status) !== 200)) {
    assert.equal(Core.currentPageCanAnswer("What does this page say?", page), false, page.url);
  }
});

test("six-digit Fortune ID patterns are detected after Unicode normalization", () => {
  for (const value of [
    "123456",
    "123-456",
    "123–456",
    "123—456",
    "123 456",
    "１２３４５６",
    "١٢٣٤٥٦",
    "My Fortune ID is 654321",
  ]) {
    assert.equal(Core.personalInformationDetected(value), true, value);
  }
  assert.equal(Core.personalInformationDetected("Workshop 12345"), false);
  assert.equal(Core.personalInformationDetected("Workshop 1234567"), false);
});

test("other obvious personal-information forms are held", () => {
  for (const value of [
    "Email me at person@example.com",
    "My SSN is 123-45-6789",
    "My case number is ABC-12",
    "My address is 123 Example Street",
    "My diagnosis is private",
  ]) {
    assert.equal(Core.personalInformationDetected(value), true, value);
  }
});

test("redaction removes every six-digit representation from display text", () => {
  for (const value of ["123456", "123-456", "123–456", "123—456", "123 456", "１２３４５６", "١٢٣٤٥٦"]) {
    const redacted = Core.redactSixDigitValues(`ID ${value}`);
    assert.equal(redacted.includes("123456"), false, value);
    assert.equal(redacted.includes("123-456"), false, value);
    assert.match(redacted, /\[six-digit ID removed\]/);
  }
});

test("editing the latest exchange branches from the preceding bounded history", () => {
  const history = [
    { role: "user", content: "First question" },
    { role: "assistant", content: "First answer" },
    { role: "user", content: "Latest question" },
    { role: "assistant", content: "Latest answer" },
  ];
  assert.deepEqual(Core.historyBeforeLatestExchange(history), history.slice(0, 2));
  assert.deepEqual(Core.historyBeforeLatestExchange([]), []);
  assert.deepEqual(Core.historyBeforeLatestExchange(null), []);
});

test("mock hrefs preserve the repository base for root and nested routes", () => {
  const about = Core.canonicalUrl("/about");
  const root = Core.canonicalUrl("/");
  const known = new Set([about, root]);
  assert.equal(Core.hrefFor(about, { staticRoutes: false, knownUrls: known }), "?page=%2Fabout");
  assert.equal(Core.hrefFor(about, { staticRoutes: true, assetBase: "../../", knownUrls: known }), "../../about/");
  assert.equal(Core.hrefFor(root, { staticRoutes: true, assetBase: "../../", knownUrls: known }), "../../");
  assert.equal(Core.hrefFor("https://example.com/nope", { staticRoutes: true, assetBase: "../../", knownUrls: known }), "https://example.com/nope");
});

test("destination labels stay grammatical", () => {
  assert.equal(Core.destinationLabel("Regular Workshops | FS Digital Equity"), "Go to Regular Workshops");
  assert.equal(Core.destinationLabel("Confirm eligibility with staff"), "Confirm eligibility with staff");
  assert.equal(Core.destinationLabel("Contact Digital Equity"), "Contact Digital Equity");
});

test("public text cleanup removes duplicated sentences and source-title suffixes", () => {
  assert.equal(Core.cleanText("Great , start here.  Great , start here."), "Great, start here.");
  assert.equal(Core.cleanTitle("Devices | FS Digital Equity"), "Devices");
});

test("embedded guide reports an open panel before an answer expands it", () => {
  const messages = runEmbedBridge({ panelHidden: false });
  assert.equal(messages[0].message.type, "fortune-sidecar-state");
  assert.equal(messages[0].message.expanded, true);
  assert.equal(messages[0].origin, "https://zmuhls.github.io");
});

test("embedded guide sends source and query-based destinations to its parent", () => {
  const declared = runEmbedBridge({
    anchor: {
      href: "https://zmuhls.github.io/fortune-digital-equity-guide-demo/sidecar.html?page=%2Fabout&open=1",
      dataset: { mockUrl: "https://www.fortunedigitalequity.org/about" },
    },
  });
  assert.equal(declared.at(-1).message.url, "https://www.fortunedigitalequity.org/about?open=1");

  const queryFallback = runEmbedBridge({
    anchor: {
      href: "https://zmuhls.github.io/fortune-digital-equity-guide-demo/sidecar.html?page=%2Fcalendar",
      dataset: {},
    },
  });
  assert.equal(queryFallback.at(-1).message.url, "https://www.fortunedigitalequity.org/calendar");
});
