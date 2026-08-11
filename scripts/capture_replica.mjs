#!/usr/bin/env node

/**
 * Capture inert, deterministic HTML snapshots of every indexed public route.
 *
 * Firefox runs the live page long enough for Wix and lazy media to render. The
 * resulting main-frame document is then stripped of executable and
 * data-collecting surfaces before it is serialized and compressed.
 */

import { createHash, randomBytes } from "node:crypto";
import { constants as fsConstants, realpathSync } from "node:fs";
import {
  access,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { hostname } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { gzipSync } from "fflate";
import { firefox } from "playwright";


const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, "..");
export const SOURCE_ORIGIN = "https://www.fortunedigitalequity.org";
export const VIEWPORT = Object.freeze({ width: 1440, height: 1200 });
export const FIXED_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:128.0) " +
  "Gecko/20100101 Firefox/128.0 FortuneReplicaCapture/1.0";
export const DEFAULT_CONCURRENCY = 2;
export const DEFAULT_NAVIGATION_TIMEOUT_MS = 90_000;

const SAFE_ID = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/i;
const FORBIDDEN_MARKUP = [
  [/<\s*script\b/i, "script element"],
  [/<\s*(?:template|noscript)\b/i, "template or noscript element"],
  [/<\s*(?:object|embed|iframe|form)\b/i, "active embedded or form element"],
  [/<\s*meta\b[^>]*http-equiv\s*=\s*["']?\s*refresh\b/i, "meta refresh"],
  [/\ssrcdoc\s*=/i, "iframe srcdoc"],
  [/\son[a-z][a-z0-9_-]*\s*=/i, "inline event handler"],
  [/(?:href|action|formaction|xlink:href)\s*=\s*["']?\s*(?:javascript|vbscript|data)\s*:/i, "executable navigation URL"],
  [/(?:src)\s*=\s*["']?\s*(?:javascript|vbscript)\s*:/i, "executable source URL"],
  [/wix-(?:essential-)?viewer-model/i, "Wix viewer model"],
  [/(?:x-)?xsrf-token/i, "XSRF token"],
  [/["'](?:sessionToken|accessToken)["']\s*[:=]/i, "session or access token"],
  [/--cookie-banner-/i, "transient cookie-banner style"],
  [/<button\b(?![^>]*\bdisabled(?:\s|=|>))[^>]*>/i, "active button"],
];


export class CaptureError extends Error {
  constructor(message) {
    super(message);
    this.name = "CaptureError";
  }
}


function valueAfter(argv, index, option) {
  if (index + 1 >= argv.length || argv[index + 1].startsWith("--")) {
    throw new CaptureError(`${option} requires a value`);
  }
  return argv[index + 1];
}


function positiveInteger(value, option) {
  if (!/^\d+$/.test(value) || Number(value) < 1 || !Number.isSafeInteger(Number(value))) {
    throw new CaptureError(`${option} must be a positive integer`);
  }
  return Number(value);
}


export function parseArgs(argv) {
  const options = {
    indexPath: path.join(ROOT, "site-index.json"),
    outputDir: ROOT,
    concurrency: DEFAULT_CONCURRENCY,
    navigationTimeoutMs: DEFAULT_NAVIGATION_TIMEOUT_MS,
    routes: [],
    limit: null,
    allowedStatuses: new Map(),
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }
    if (argument === "--index") {
      options.indexPath = path.resolve(valueAfter(argv, index, argument));
      index += 1;
      continue;
    }
    if (argument === "--output-dir") {
      options.outputDir = path.resolve(valueAfter(argv, index, argument));
      index += 1;
      continue;
    }
    if (argument === "--concurrency") {
      options.concurrency = positiveInteger(valueAfter(argv, index, argument), argument);
      index += 1;
      continue;
    }
    if (argument === "--navigation-timeout-ms") {
      options.navigationTimeoutMs = positiveInteger(valueAfter(argv, index, argument), argument);
      index += 1;
      continue;
    }
    if (argument === "--route") {
      options.routes.push(valueAfter(argv, index, argument));
      index += 1;
      continue;
    }
    if (argument === "--limit") {
      options.limit = positiveInteger(valueAfter(argv, index, argument), argument);
      index += 1;
      continue;
    }
    if (argument === "--allow-status") {
      const rule = valueAfter(argv, index, argument);
      const separator = rule.lastIndexOf("=");
      if (separator < 1 || !/^\d{3}$/.test(rule.slice(separator + 1))) {
        throw new CaptureError("--allow-status must use URL=STATUS");
      }
      const url = canonicalSourceUrl(rule.slice(0, separator));
      const status = Number(rule.slice(separator + 1));
      if (status < 100 || status > 599) {
        throw new CaptureError("--allow-status must contain an HTTP status from 100 through 599");
      }
      if (status === 200) {
        throw new CaptureError("--allow-status is only for an expected non-200 response");
      }
      if (options.allowedStatuses.has(url)) {
        throw new CaptureError(`duplicate --allow-status rule for ${url}`);
      }
      options.allowedStatuses.set(url, status);
      index += 1;
      continue;
    }
    throw new CaptureError(`unknown option: ${argument}`);
  }
  return options;
}


export function helpText() {
  return `Usage: node scripts/capture_replica.mjs [options]

Capture every route in site-index.json with Firefox, sanitize the rendered
main-frame HTML, and atomically publish deterministic gzip snapshots.

Options:
  --index PATH                 Read a different site index.
  --output-dir PATH            Put replica-manifest.json and replica-snapshots/
                               under PATH. Required for a partial smoke run.
  --concurrency NUMBER         Capture this many routes at once (default: 2).
  --navigation-timeout-ms MS   Set the per-route navigation timeout (default: 90000).
  --route URL_OR_PATH          Capture one indexed route; repeat to select more.
  --limit NUMBER               Capture only the first NUMBER selected routes.
  --allow-status URL=STATUS    Permit one indexed URL to return an expected
                               non-200 status; repeat for additional exceptions.
  -h, --help                   Show this help text.

Examples:
  npm run capture:replica
  npm run capture:replica -- --concurrency 3
  npm run capture:replica -- --route / --output-dir /tmp/fortune-replica-smoke
`;
}


export function routePath(value) {
  let url;
  try {
    url = new URL(value, `${SOURCE_ORIGIN}/`);
  } catch (error) {
    throw new CaptureError(`invalid source URL: ${value} (${error.message})`);
  }
  if (
    url.origin !== SOURCE_ORIGIN ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new CaptureError(`route must be a public ${SOURCE_ORIGIN} URL without query or fragment: ${value}`);
  }
  if (/%(?:2f|5c)/i.test(url.pathname)) {
    throw new CaptureError(`route contains an encoded path separator: ${value}`);
  }
  if (/%2e/i.test(String(value))) {
    throw new CaptureError(`route contains an encoded dot segment: ${value}`);
  }
  let decodedPath;
  try {
    decodedPath = decodeURI(url.pathname);
  } catch (_error) {
    throw new CaptureError(`route contains invalid percent encoding: ${value}`);
  }
  const normalizedPath = decodedPath.replace(/\/{2,}/g, "/").replace(/\/+$/, "") || "/";
  if (normalizedPath.split("/").includes("..") || /(?:^|\/)\.\.(?:\/|$)/.test(String(value))) {
    throw new CaptureError(`route contains path traversal: ${value}`);
  }
  return normalizedPath;
}


export function canonicalSourceUrl(value) {
  const pagePath = routePath(value);
  return `${SOURCE_ORIGIN}${pagePath === "/" ? "/" : pagePath}`;
}


export function sameFilesystemPath(left, right) {
  const canonical = (value) => {
    try {
      return realpathSync.native(path.resolve(value));
    } catch (error) {
      if (error.code === "ENOENT") return path.resolve(value);
      throw error;
    }
  };
  return canonical(left) === canonical(right);
}


export function validateIndex(document) {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new CaptureError("site index must be a JSON object");
  }
  if (!Array.isArray(document.pages) || document.pages.length === 0) {
    throw new CaptureError("site index must contain a non-empty pages array");
  }
  if (document.unique_urls !== document.pages.length) {
    throw new CaptureError(
      `site index is incomplete: unique_urls=${document.unique_urls}, pages=${document.pages.length}`,
    );
  }

  const ids = new Set();
  const urls = new Set();
  const paths = new Set();
  const routes = document.pages.map((page, index) => {
    if (!page || typeof page !== "object") {
      throw new CaptureError(`page ${index + 1} is not an object`);
    }
    if (typeof page.id !== "string" || !SAFE_ID.test(page.id) || page.id.includes("..")) {
      throw new CaptureError(`page ${index + 1} has an unsafe id: ${page.id}`);
    }
    const pagePath = routePath(page.url);
    const url = canonicalSourceUrl(page.url);
    if (page.url !== url) {
      throw new CaptureError(`page ${page.id} does not use the canonical source URL: ${page.url}`);
    }
    if (ids.has(page.id)) throw new CaptureError(`duplicate page id: ${page.id}`);
    if (urls.has(url)) throw new CaptureError(`duplicate page URL: ${url}`);
    if (paths.has(pagePath)) throw new CaptureError(`duplicate route path: ${pagePath}`);
    ids.add(page.id);
    urls.add(url);
    paths.add(pagePath);
    return Object.freeze({ id: page.id, url, path: pagePath });
  });
  return routes;
}


function selectionKey(value) {
  if (value.startsWith("/")) return routePath(value);
  return canonicalSourceUrl(value);
}


export function selectRoutes(routes, options) {
  let selected = routes;
  if (options.routes.length > 0) {
    const requested = new Set(options.routes.map(selectionKey));
    selected = routes.filter((route) => requested.has(route.path) || requested.has(route.url));
    const found = new Set(selected.flatMap((route) => [route.path, route.url]));
    const missing = [...requested].filter((value) => !found.has(value));
    if (missing.length > 0) {
      throw new CaptureError(`requested route is absent from site-index.json: ${missing.join(", ")}`);
    }
  }
  if (options.limit !== null) selected = selected.slice(0, options.limit);
  if (selected.length === 0) throw new CaptureError("route selection is empty");

  const partial = selected.length !== routes.length;
  const canonicalOutput = sameFilesystemPath(options.outputDir, ROOT);
  if (partial && canonicalOutput) {
    throw new CaptureError("a partial capture requires --output-dir different from the repository root");
  }
  if (
    canonicalOutput &&
    !sameFilesystemPath(options.indexPath, path.join(ROOT, "site-index.json"))
  ) {
    throw new CaptureError("an alternate --index requires --output-dir different from the repository root");
  }
  if (canonicalOutput && options.allowedStatuses.size > 0) {
    throw new CaptureError("a non-200 status exception requires --output-dir different from the repository root");
  }
  for (const url of options.allowedStatuses.keys()) {
    if (!selected.some((route) => route.url === url)) {
      throw new CaptureError(`--allow-status URL is absent from the selected routes: ${url}`);
    }
  }
  return { selected, partial };
}


export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}


export async function deterministicGzip(bytes) {
  return Buffer.from(gzipSync(bytes, { level: 9, mtime: 0 }));
}


export function capturedAt(environment = process.env, now = new Date()) {
  const epoch = environment.SOURCE_DATE_EPOCH;
  if (epoch === undefined || epoch === "") return now.toISOString();
  if (!/^\d+$/.test(epoch)) {
    throw new CaptureError("SOURCE_DATE_EPOCH must be a non-negative integer");
  }
  const timestamp = new Date(Number(epoch) * 1000);
  if (Number.isNaN(timestamp.getTime())) {
    throw new CaptureError("SOURCE_DATE_EPOCH is outside the supported date range");
  }
  return timestamp.toISOString();
}


export function assertSanitized(html) {
  for (const [pattern, description] of FORBIDDEN_MARKUP) {
    if (pattern.test(html)) {
      throw new CaptureError(`sanitized snapshot still contains a ${description}`);
    }
  }
  if (!/<meta\b[^>]*name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(html)) {
    throw new CaptureError("sanitized snapshot is missing the noindex directive");
  }
  if (!/<meta\b[^>]*name=["']referrer["'][^>]*content=["']no-referrer["']/i.test(html)) {
    throw new CaptureError("sanitized snapshot is missing the no-referrer directive");
  }
}


/**
 * This function is passed directly to page.evaluate, so it must remain
 * self-contained and use browser globals only.
 */
export function sanitizeDocument() {
  const removeSelectors = [
    "script",
    "template",
    "noscript",
    "object",
    "embed",
    'meta[http-equiv="refresh" i]',
    'link[rel~="preload" i]',
    'link[rel~="prefetch" i]',
    'link[rel~="modulepreload" i]',
    'link[rel~="prerender" i]',
    'link[rel~="dns-prefetch" i]',
    'link[rel~="preconnect" i]',
  ];
  document.querySelectorAll(removeSelectors.join(",")).forEach((element) => element.remove());
  document.querySelectorAll("style").forEach((style) => {
    if (style.textContent.includes("--cookie-banner-")) style.remove();
  });

  document.querySelectorAll("img").forEach((image) => {
    if (image.currentSrc) image.setAttribute("src", image.currentSrc);
    image.removeAttribute("srcset");
    image.removeAttribute("sizes");
  });

  const navigationAttributes = new Set(["href", "action", "formaction", "xlink:href"]);
  const sensitiveAttribute = /(?:x-)?xsrf|csrf|(?:session|access)[-_:]?(?:token|key)/i;
  const sensitiveValue = /wix-(?:essential-)?viewer-model|(?:x-)?xsrf-token|["'](?:sessionToken|accessToken)["']\s*[:=]/i;
  document.querySelectorAll("*").forEach((element) => {
    let removeElement = false;
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (name.startsWith("on") || name === "srcdoc") {
        element.removeAttribute(attribute.name);
        continue;
      }
      if (navigationAttributes.has(name) && /^(?:javascript|vbscript|data)\s*:/i.test(value)) {
        element.removeAttribute(attribute.name);
        continue;
      }
      if (name === "src" && /^(?:javascript|vbscript)\s*:/i.test(value)) {
        element.removeAttribute(attribute.name);
        continue;
      }
      if (sensitiveAttribute.test(name) || sensitiveValue.test(value)) {
        removeElement = true;
        break;
      }
    }
    if (removeElement) element.remove();
  });

  document.querySelectorAll("form").forEach((form) => {
    const shell = document.createElement("div");
    for (const attribute of [...form.attributes]) {
      if (!["action", "method", "enctype", "target", "autocomplete", "name"].includes(attribute.name.toLowerCase())) {
        shell.setAttribute(attribute.name, attribute.value);
      }
    }
    shell.setAttribute("inert", "");
    shell.setAttribute("role", "group");
    shell.setAttribute("aria-disabled", "true");
    shell.setAttribute("data-replica-inert", "form");
    shell.replaceChildren(...form.childNodes);
    form.replaceWith(shell);
  });
  document.querySelectorAll('button, input[type="button" i], input[type="submit" i], input[type="reset" i]').forEach((button) => {
    button.setAttribute("disabled", "");
    button.setAttribute("aria-disabled", "true");
    button.setAttribute("data-replica-inert", "button");
  });
  document.querySelectorAll('[role="button" i]').forEach((button) => {
    if (button.matches("a[href]")) return;
    button.setAttribute("inert", "");
    button.setAttribute("aria-disabled", "true");
    button.setAttribute("tabindex", "-1");
    button.setAttribute("data-replica-inert", "button");
  });

  document.querySelectorAll("iframe").forEach((frame) => {
    frame.removeAttribute("srcdoc");
    const rawSource = frame.getAttribute("src");
    const previewSource = frame.getAttribute("data-replica-preview") || "";
    let source;
    if (rawSource) {
      try {
        source = new URL(rawSource, document.baseURI);
      } catch (_error) {
        source = null;
      }
    }

    const placeholder = document.createElement("div");
    placeholder.setAttribute("data-replica-embed-placeholder", "true");
    placeholder.setAttribute("role", "group");
    placeholder.setAttribute("aria-label", frame.title || "Embedded content");
    for (const attribute of ["class", "style", "width", "height"]) {
      if (frame.hasAttribute(attribute)) {
        placeholder.setAttribute(attribute, frame.getAttribute(attribute));
      }
    }
    if (source && (source.protocol === "https:" || source.protocol === "http:")) {
      const link = document.createElement("a");
      link.href = source.href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      const label = frame.title
        ? `Open embedded content: ${frame.title}`
        : `Open embedded content from ${source.hostname}`;
      if (/^data:image\/png;base64,[a-z0-9+/]+=*$/i.test(previewSource)) {
        const preview = document.createElement("img");
        preview.src = previewSource;
        preview.alt = `${label} (static preview)`;
        preview.setAttribute("data-replica-embed-preview", "true");
        preview.style.cssText = "display:block;width:100%;height:100%;object-fit:cover";
        link.setAttribute("aria-label", label);
        link.style.cssText = "display:block;width:100%;height:100%";
        link.append(preview);
        placeholder.setAttribute("data-replica-static-preview", "true");
      } else {
        link.textContent = label;
      }
      placeholder.append(link);
    } else {
      placeholder.textContent = frame.title || "Embedded content is available on the original page.";
    }
    frame.replaceWith(placeholder);
  });

  document.querySelectorAll("a[target=\"_blank\"]").forEach((anchor) => {
    const values = new Set((anchor.getAttribute("rel") || "").split(/\s+/).filter(Boolean));
    values.add("noopener");
    values.add("noreferrer");
    anchor.setAttribute("rel", [...values].join(" "));
  });

  document.querySelectorAll('meta[name="robots" i]').forEach((meta) => meta.remove());
  document.querySelectorAll('meta[name="referrer" i]').forEach((meta) => meta.remove());
  const noindex = document.createElement("meta");
  noindex.setAttribute("name", "robots");
  noindex.setAttribute("content", "noindex,nofollow,noarchive");
  const noReferrer = document.createElement("meta");
  noReferrer.setAttribute("name", "referrer");
  noReferrer.setAttribute("content", "no-referrer");
  const head = document.head || document.documentElement;
  head.prepend(noReferrer, noindex);
  if (document.head) {
    [...document.head.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE && !node.textContent.trim())
      .forEach((node) => node.remove());
  }
  document.documentElement.setAttribute("data-replica-snapshot", "true");
}


/** This function also runs in the browser after sanitizeDocument. */
export function auditSanitizedDocument() {
  const issues = [];
  const add = (message) => {
    if (issues.length < 50) issues.push(message);
  };
  if (document.querySelector("script,template,noscript,object,embed,iframe,form")) {
    add("executable or hidden element remains");
  }
  if (document.querySelector('meta[http-equiv="refresh" i]')) add("meta refresh remains");
  if (document.querySelector('link[rel~="preload" i],link[rel~="prefetch" i],link[rel~="modulepreload" i],link[rel~="prerender" i],link[rel~="dns-prefetch" i],link[rel~="preconnect" i]')) {
    add("transient resource hint remains");
  }
  document.querySelectorAll("*").forEach((element) => {
    for (const attribute of element.attributes) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (name.startsWith("on")) add(`inline handler remains on ${element.localName}`);
      if (name === "srcdoc") add("iframe srcdoc remains");
      if (["href", "action", "formaction", "xlink:href"].includes(name) && /^(?:javascript|vbscript|data)\s*:/i.test(value)) {
        add(`executable ${name} remains on ${element.localName}`);
      }
      if (name === "src" && /^(?:javascript|vbscript)\s*:/i.test(value)) {
        add(`executable src remains on ${element.localName}`);
      }
    }
  });
  document.querySelectorAll('button,input[type="button" i],input[type="submit" i],input[type="reset" i]').forEach((button) => {
    if (!button.disabled) add("active button remains");
  });
  document.querySelectorAll('[role="button" i]:not(a[href])').forEach((button) => {
    if (!button.hasAttribute("inert")) add("active button role remains");
  });
  if (document.querySelector("img[srcset],img[sizes]")) add("responsive image candidates remain");
  if (document.querySelectorAll('meta[name="robots" i][content*="noindex" i]').length !== 1) {
    add("noindex directive is missing or duplicated");
  }
  if (document.querySelectorAll('meta[name="referrer" i][content="no-referrer" i]').length !== 1) {
    add("no-referrer directive is missing or duplicated");
  }
  if (document.documentElement.outerHTML.match(/wix-(?:essential-)?viewer-model|(?:x-)?xsrf-token|["'](?:sessionToken|accessToken)["']\s*[:=]|--cookie-banner-/i)) {
    add("viewer, session, or transient cookie data remains");
  }
  return issues;
}


async function hydratePage(page) {
  await page.locator("body").waitFor({ state: "attached" });
  await page.locator('#PAGES_CONTAINER,main,[data-main-content="true" i]').first().waitFor({
    state: "attached",
    timeout: 30_000,
  });
  await page.evaluate(() => {
    document.querySelectorAll("img").forEach((image) => {
      image.loading = "eager";
    });
  });

  try {
    await page.waitForLoadState("networkidle", { timeout: 15_000 });
  } catch (_error) {
    // Wix telemetry can keep a connection active; scrolling below remains bounded.
  }

  let previousHeight = -1;
  let stablePasses = 0;
  for (let step = 0; step < 120 && stablePasses < 3; step += 1) {
    const metrics = await page.evaluate(() => ({
      height: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
      y: window.scrollY,
      viewport: window.innerHeight,
    }));
    const nextY = Math.min(metrics.height, metrics.y + Math.max(400, Math.floor(metrics.viewport * 0.75)));
    await page.evaluate((y) => window.scrollTo(0, y), nextY);
    await page.waitForTimeout(120);
    if (nextY >= metrics.height - metrics.viewport && metrics.height === previousHeight) {
      stablePasses += 1;
    } else {
      stablePasses = 0;
    }
    previousHeight = metrics.height;
  }

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(500);
  try {
    await page.waitForFunction(
      () => [...document.images].every((image) => !image.currentSrc || image.complete),
      null,
      { timeout: 10_000 },
    );
  } catch (_error) {
    // Broken remote media remains represented by its resolved currentSrc.
  }
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
    window.scrollTo(0, 0);
  });
  await page.evaluate(
    ({ quietMilliseconds, maximumMilliseconds }) => new Promise((resolve) => {
      let quietTimer;
      let maximumTimer;
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        observer.disconnect();
        clearTimeout(quietTimer);
        clearTimeout(maximumTimer);
        resolve();
      };
      const restartQuietWindow = () => {
        clearTimeout(quietTimer);
        quietTimer = setTimeout(finish, quietMilliseconds);
      };
      const observer = new MutationObserver(restartQuietWindow);
      observer.observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["src", "srcset"],
      });
      maximumTimer = setTimeout(finish, maximumMilliseconds);
      restartQuietWindow();
    }),
    { quietMilliseconds: 1_500, maximumMilliseconds: 10_000 },
  );
}


async function captureIframePreviews(page) {
  const frames = page.locator("iframe");
  const count = await frames.count();
  const previews = new Array(count).fill("");
  for (let index = 0; index < count; index += 1) {
    const frame = frames.nth(index);
    const box = await frame.boundingBox();
    if (!box || box.width < 2 || box.height < 2 || box.width * box.height > 8_000_000) continue;
    try {
      const png = await frame.screenshot({
        animations: "disabled",
        caret: "hide",
        timeout: 15_000,
      });
      previews[index] = `data:image/png;base64,${png.toString("base64")}`;
    } catch (_error) {
      // The outbound link remains when a public embed cannot be rendered safely.
    }
  }
  await page.evaluate((values) => {
    document.querySelectorAll("iframe").forEach((frame, index) => {
      if (values[index]) frame.setAttribute("data-replica-preview", values[index]);
    });
    window.scrollTo(0, 0);
  }, previews);
  return previews.filter(Boolean).length;
}


function expectedStatus(route, allowedStatuses) {
  return allowedStatuses.get(route.url) ?? 200;
}


async function captureRoute(browser, route, snapshotDirectory, options) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    userAgent: FIXED_USER_AGENT,
    locale: "en-US",
    timezoneId: "America/New_York",
    colorScheme: "light",
    reducedMotion: "reduce",
    serviceWorkers: "block",
    storageState: { cookies: [], origins: [] },
    extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9" },
  });

  try {
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(options.navigationTimeoutMs);
    const response = await page.goto(route.url, {
      waitUntil: "domcontentloaded",
      timeout: options.navigationTimeoutMs,
    });
    if (!response) throw new CaptureError(`${route.url} did not return a main-frame response`);

    const status = response.status();
    const permittedStatus = expectedStatus(route, options.allowedStatuses);
    if (status !== permittedStatus) {
      throw new CaptureError(`${route.url} returned ${status}; expected ${permittedStatus}`);
    }
    const finalUrl = canonicalSourceUrl(page.url());
    if (finalUrl !== route.url) {
      throw new CaptureError(`${route.url} redirected to a different indexed route: ${page.url()}`);
    }

    await hydratePage(page);
    const embedPreviews = await captureIframePreviews(page);
    const capturedCookies = await context.cookies();
    if (capturedCookies.length > 0) {
      throw new CaptureError(`${route.url} stored cookies despite the no-cookie Firefox policy`);
    }
    const metadata = await page.evaluate(() => ({
      title: document.title.trim(),
      siteRevision:
        document.querySelector('meta[http-equiv="X-Wix-Published-Version" i]')?.getAttribute("content")?.trim() || null,
    }));
    if (!metadata.title) throw new CaptureError(`${route.url} has an empty document title`);
    if (!metadata.siteRevision || !/^\d+$/.test(metadata.siteRevision)) {
      throw new CaptureError(`${route.url} is missing a numeric Wix published revision`);
    }
    const siteRevision = Number(metadata.siteRevision);
    if (!Number.isSafeInteger(siteRevision)) {
      throw new CaptureError(`${route.url} has an unsupported Wix published revision`);
    }

    await page.evaluate(sanitizeDocument);
    const sanitizationIssues = await page.evaluate(auditSanitizedDocument);
    if (sanitizationIssues.length > 0) {
      throw new CaptureError(`${route.url} failed sanitization: ${sanitizationIssues.join("; ")}`);
    }
    const html = await page.content();
    assertSanitized(html);
    const source = Buffer.from(html, "utf8");
    const snapshot = await deterministicGzip(source);
    const file = `replica-snapshots/${route.id}.html.gz`;
    await writeFile(path.join(snapshotDirectory, `${route.id}.html.gz`), snapshot, { flag: "wx" });
    const responseHeaders = await response.allHeaders();

    return Object.freeze({
      id: route.id,
      url: route.url,
      final_url: finalUrl,
      path: route.path,
      file,
      status,
      title: metadata.title,
      site_revision: siteRevision,
      etag: responseHeaders.etag || null,
      embed_previews: embedPreviews,
      source_bytes: source.byteLength,
      snapshot_bytes: snapshot.byteLength,
      source_sha256: sha256(source),
      snapshot_sha256: sha256(snapshot),
    });
  } finally {
    await context.close();
  }
}


async function captureRoutes(browser, routes, snapshotDirectory, options) {
  const results = new Array(routes.length);
  let cursor = 0;
  let failure = null;
  const workerCount = Math.min(options.concurrency, routes.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (!failure) {
      const index = cursor;
      cursor += 1;
      if (index >= routes.length) return;
      const route = routes[index];
      try {
        results[index] = await captureRoute(browser, route, snapshotDirectory, options);
        process.stderr.write(`[${index + 1}/${routes.length}] captured ${route.path}\n`);
      } catch (error) {
        failure = error;
      }
    }
  });
  await Promise.all(workers);
  if (failure) throw failure;
  if (results.some((result) => !result)) {
    throw new CaptureError("capture ended without an artifact for every selected route");
  }
  return results;
}


export function validateCapturedPages(routes, pages) {
  if (pages.length !== routes.length) {
    throw new CaptureError(`captured ${pages.length} pages for ${routes.length} selected routes`);
  }
  const files = new Set();
  for (let index = 0; index < routes.length; index += 1) {
    const route = routes[index];
    const page = pages[index];
    if (page.id !== route.id || page.url !== route.url || page.path !== route.path) {
      throw new CaptureError(`captured route ${index + 1} does not match site-index.json`);
    }
    if (files.has(page.file)) throw new CaptureError(`duplicate snapshot file: ${page.file}`);
    files.add(page.file);
  }
  const revisions = new Set(pages.map((page) => page.site_revision));
  if (revisions.size !== 1 || !Number.isSafeInteger([...revisions][0])) {
    throw new CaptureError(`capture contains mixed or missing Wix revisions: ${[...revisions].join(", ")}`);
  }
  return [...revisions][0];
}


async function pathExists(filePath) {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}


function publicationPaths(outputRoot, suffix) {
  return {
    targetSnapshots: path.join(outputRoot, "replica-snapshots"),
    targetManifest: path.join(outputRoot, "replica-manifest.json"),
    backupSnapshots: path.join(outputRoot, `.replica-snapshots.previous-${suffix}`),
    backupManifest: path.join(outputRoot, `.replica-manifest.previous-${suffix}.json`),
    transaction: path.join(outputRoot, `.replica-publish-${suffix}.json`),
  };
}


async function writeDurableJson(filePath, value) {
  const handle = await open(filePath, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}


async function recoverPublication(outputRoot, transactionPath) {
  let state;
  try {
    state = JSON.parse(await readFile(transactionPath, "utf8"));
  } catch (error) {
    throw new CaptureError(`cannot recover interrupted publication ${transactionPath}: ${error.message}`);
  }
  if (
    !state ||
    typeof state !== "object" ||
    !/^[0-9]+-[a-f0-9]{10}$/.test(state.suffix || "") ||
    typeof state.old_snapshots !== "boolean" ||
    typeof state.old_manifest !== "boolean"
  ) {
    throw new CaptureError(`interrupted publication has invalid recovery data: ${transactionPath}`);
  }
  const paths = publicationPaths(outputRoot, state.suffix);
  const present = {
    targetSnapshots: await pathExists(paths.targetSnapshots),
    targetManifest: await pathExists(paths.targetManifest),
    backupSnapshots: await pathExists(paths.backupSnapshots),
    backupManifest: await pathExists(paths.backupManifest),
  };
  const complete =
    present.targetSnapshots &&
    present.targetManifest &&
    (!state.old_snapshots || present.backupSnapshots) &&
    (!state.old_manifest || present.backupManifest);

  if (!complete) {
    if (state.old_snapshots && present.backupSnapshots) {
      if (present.targetSnapshots) await rm(paths.targetSnapshots, { recursive: true, force: true });
      await rename(paths.backupSnapshots, paths.targetSnapshots);
    } else if (!state.old_snapshots && present.targetSnapshots) {
      await rm(paths.targetSnapshots, { recursive: true, force: true });
    }
    if (state.old_manifest && present.backupManifest) {
      if (present.targetManifest) await rm(paths.targetManifest, { force: true });
      await rename(paths.backupManifest, paths.targetManifest);
    } else if (!state.old_manifest && present.targetManifest) {
      await rm(paths.targetManifest, { force: true });
    }
  }

  await rm(paths.backupSnapshots, { recursive: true, force: true });
  await rm(paths.backupManifest, { force: true });
  await rm(transactionPath, { force: true });
}


export async function recoverInterruptedPublications(outputRoot) {
  const entries = await readdir(outputRoot, { withFileTypes: true });
  const transactions = entries
    .filter((entry) => entry.isFile() && /^\.replica-publish-[0-9]+-[a-f0-9]{10}\.json$/.test(entry.name))
    .map((entry) => path.join(outputRoot, entry.name))
    .sort();
  for (const transaction of transactions) {
    await recoverPublication(outputRoot, transaction);
  }
}


export async function atomicPublish(stagingRoot, outputRoot) {
  const sourceSnapshots = path.join(stagingRoot, "replica-snapshots");
  const sourceManifest = path.join(stagingRoot, "replica-manifest.json");
  const suffix = `${process.pid}-${randomBytes(5).toString("hex")}`;
  const paths = publicationPaths(outputRoot, suffix);
  const state = {
    suffix,
    old_snapshots: await pathExists(paths.targetSnapshots),
    old_manifest: await pathExists(paths.targetManifest),
  };
  await writeDurableJson(paths.transaction, state);

  try {
    if (state.old_snapshots) {
      await rename(paths.targetSnapshots, paths.backupSnapshots);
    }
    if (state.old_manifest) {
      await rename(paths.targetManifest, paths.backupManifest);
    }
    await rename(sourceSnapshots, paths.targetSnapshots);
    await rename(sourceManifest, paths.targetManifest);
  } catch (error) {
    await recoverPublication(outputRoot, paths.transaction);
    throw error;
  }

  await recoverPublication(outputRoot, paths.transaction);
}


async function acquireCaptureLock(outputRoot) {
  const lockPath = path.join(outputRoot, ".replica-capture.lock");
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(lockPath, "wx", 0o600);
      const value = {
        pid: process.pid,
        host: hostname(),
        started_at: new Date().toISOString(),
      };
      await handle.writeFile(`${JSON.stringify(value)}\n`, "utf8");
      await handle.sync();
      return async () => {
        await handle.close();
        await rm(lockPath, { force: true });
      };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      let owner;
      try {
        owner = JSON.parse(await readFile(lockPath, "utf8"));
      } catch (readError) {
        throw new CaptureError(`capture lock exists and cannot be read: ${readError.message}`);
      }
      let active = owner.host !== hostname() || !Number.isSafeInteger(owner.pid);
      if (!active) {
        try {
          process.kill(owner.pid, 0);
          active = true;
        } catch (processError) {
          if (processError.code !== "ESRCH") active = true;
        }
      }
      if (active || attempt === 1) {
        throw new CaptureError(`another capture owns ${lockPath}`);
      }
      await rm(lockPath, { force: true });
    }
  }
  throw new CaptureError(`could not acquire capture lock in ${outputRoot}`);
}


export function buildManifest({ timestamp, browserVersion, pages }) {
  return {
    captured_at: timestamp,
    source_origin: SOURCE_ORIGIN,
    route_count: pages.length,
    capture: {
      browser: { name: "firefox", version: browserVersion },
      viewport: VIEWPORT,
    },
    pages,
  };
}


export async function run(options) {
  const indexDocument = JSON.parse(await readFile(options.indexPath, "utf8"));
  const indexedRoutes = validateIndex(indexDocument);
  const { selected, partial } = selectRoutes(indexedRoutes, options);
  await mkdir(options.outputDir, { recursive: true });
  const releaseLock = await acquireCaptureLock(options.outputDir);
  let stagingRoot;

  let browser;
  try {
    await recoverInterruptedPublications(options.outputDir);
    stagingRoot = await mkdtemp(path.join(options.outputDir, ".replica-capture-"));
    const snapshotDirectory = path.join(stagingRoot, "replica-snapshots");
    await mkdir(snapshotDirectory);
    browser = await firefox.launch({
      headless: true,
      firefoxUserPrefs: {
        "network.cookie.cookieBehavior": 2,
        "network.cookie.cookieBehavior.pbmode": 2,
      },
    });
    const pages = await captureRoutes(browser, selected, snapshotDirectory, options);
    validateCapturedPages(selected, pages);
    const manifest = buildManifest({
      timestamp: capturedAt(),
      browserVersion: browser.version(),
      pages,
    });
    await writeFile(
      path.join(stagingRoot, "replica-manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      { encoding: "utf8", flag: "wx" },
    );
    await atomicPublish(stagingRoot, options.outputDir);
    return { manifest, partial };
  } finally {
    if (browser) await browser.close();
    if (stagingRoot) await rm(stagingRoot, { recursive: true, force: true });
    await releaseLock();
  }
}


async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      process.stdout.write(helpText());
      return;
    }
    const { manifest, partial } = await run(options);
    process.stdout.write(
      `${partial ? "Smoke capture" : "Full capture"} published ${manifest.route_count} route${manifest.route_count === 1 ? "" : "s"} ` +
      `at Wix revision ${manifest.pages[0].site_revision}.\n`,
    );
  } catch (error) {
    process.stderr.write(`capture failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}


const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) await main();
