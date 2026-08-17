#!/usr/bin/env python3
"""Build an auditable retrieval index from the public Digital Equity sitemap.

The crawler keeps every sitemap URL in the index. Current operational pages
and active booking services may support participant answers. Old posts,
category archives, staging pages, and archived services remain visible in the
inventory but cannot become answer authority.
"""

from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from html import unescape
from html.parser import HTMLParser
import argparse
import hashlib
import json
import pathlib
import re
import sys
import threading
import time
import urllib.parse
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET


HERE = pathlib.Path(__file__).resolve().parents[1]
OUTPUT = HERE / "site-index.json"
ROOT_SITEMAP = "https://www.fortunedigitalequity.org/sitemap.xml"
BLOG_FEED = "https://www.fortunedigitalequity.org/blog-feed.xml"
ALLOWED_HOST = "www.fortunedigitalequity.org"
USER_AGENT = "FortuneDigitalEquityGuideIndex/1.0 (+public meeting prototype)"
NS = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
MIN_REQUEST_INTERVAL = 0.4
_RATE_LOCK = threading.Lock()
_LAST_REQUEST = 0.0

BLOCK_TAGS = {
    "address", "article", "aside", "blockquote", "br", "button", "dd", "div",
    "dl", "dt", "figcaption", "footer", "form", "h1", "h2", "h3", "h4",
    "h5", "h6", "header", "hr", "label", "li", "main", "nav", "p",
    "section", "table", "td", "th", "tr",
}
SKIP_TAGS = {"script", "style", "noscript", "svg", "template"}

EXCLUDED_PAGE_PATHS = {
    "/acp": "outdated program page",
    "/file-share": "member file area",
    "/groups": "member community area",
    "/home-new": "duplicate or staging home page",
    "/members": "member directory",
    "/pdf2-upload": "administrative upload page",
    "/test": "test page",
    "/test-calendy": "test page",
}
ARCHIVE_PAGE_PATHS = {
    "/techfair/techfair22", "/techfair/techfair23", "/techfair/techfair24",
    "/techfair/techfair25",
}
ADDITIONAL_PUBLIC_ROUTES = {
    "/news/page/2": "blog-categories",
    "/news/page/3": "blog-categories",
}


def fetch(url, timeout=40):
    global _LAST_REQUEST
    parsed = urllib.parse.urlsplit(url)
    request_url = urllib.parse.urlunsplit((
        parsed.scheme,
        parsed.netloc,
        urllib.parse.quote(urllib.parse.unquote(parsed.path), safe="/%:@"),
        parsed.query,
        "",
    ))
    request = urllib.request.Request(request_url, headers={"User-Agent": USER_AGENT})
    for attempt in range(5):
        with _RATE_LOCK:
            delay = MIN_REQUEST_INTERVAL - (time.monotonic() - _LAST_REQUEST)
            if delay > 0:
                time.sleep(delay)
            _LAST_REQUEST = time.monotonic()
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return response.read(), getattr(response, "status", 200)
        except urllib.error.HTTPError as error:
            if error.code != 429 or attempt == 4:
                raise
            retry_after = error.headers.get("Retry-After", "")
            wait = float(retry_after) if retry_after.isdigit() else 2 ** (attempt + 1)
            time.sleep(min(wait, 24))
        except (urllib.error.URLError, ConnectionResetError, TimeoutError, OSError):
            if attempt == 4:
                raise
            time.sleep(min(2 ** (attempt + 1), 16))
    raise RuntimeError("fetch retries exhausted")


def canonical_url(url):
    parsed = urllib.parse.urlsplit(url)
    if parsed.hostname and parsed.hostname not in {ALLOWED_HOST, "fortunedigitalequity.org"}:
        return ""
    path = parsed.path.rstrip("/") or "/"
    return urllib.parse.urlunsplit(("https", ALLOWED_HOST, path, "", ""))


def sitemap_entries():
    root_body, _ = fetch(ROOT_SITEMAP)
    root = ET.fromstring(root_body)
    rows = []
    for sitemap in root.findall("sm:sitemap", NS):
        location = sitemap.findtext("sm:loc", default="", namespaces=NS).strip()
        if not location:
            continue
        kind = pathlib.PurePosixPath(urllib.parse.urlsplit(location).path).name.replace("-sitemap.xml", "")
        body, _ = fetch(location)
        child = ET.fromstring(body)
        for item in child.findall("sm:url", NS):
            url = canonical_url(item.findtext("sm:loc", default="", namespaces=NS).strip())
            if urllib.parse.urlsplit(url).hostname != ALLOWED_HOST:
                continue
            rows.append({
                "url": url,
                "sitemap_kind": kind,
                "lastmod": item.findtext("sm:lastmod", default="", namespaces=NS).strip(),
            })

    feed_body, _ = fetch(BLOG_FEED)
    feed = ET.fromstring(feed_body)
    for item in feed.findall("./channel/item"):
        url = canonical_url(item.findtext("link", default="").strip())
        if urllib.parse.urlsplit(url).hostname != ALLOWED_HOST:
            continue
        rows.append({
            "url": url,
            "sitemap_kind": "blog-posts",
            "lastmod": item.findtext("pubDate", default="").strip(),
        })

    for path, kind in ADDITIONAL_PUBLIC_ROUTES.items():
        rows.append({
            "url": canonical_url(path),
            "sitemap_kind": kind,
            "lastmod": "",
        })

    deduplicated = {}
    for row in rows:
        existing = deduplicated.get(row["url"])
        if existing is None or existing["sitemap_kind"] == "blog-categories":
            deduplicated[row["url"]] = row
    return rows, list(deduplicated.values())


def normalize_text(value):
    value = unescape(value or "").replace("\u00a0", " ")
    return re.sub(r"\s+", " ", value).strip()


class PageExtractor(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title_parts = []
        self.description = ""
        self.blocks = []
        self.headings = []
        self.links = set()
        self._in_title = False
        self._main_depth = 0
        self._skip_depth = 0
        self._heading_depth = 0
        self._buffer = []

    @staticmethod
    def _attrs(attrs):
        return {key: value or "" for key, value in attrs}

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        values = self._attrs(attrs)
        if tag == "title":
            self._in_title = True
        if tag == "meta" and values.get("name", "").lower() == "description":
            self.description = normalize_text(values.get("content"))

        if tag == "main" and (
            values.get("data-main-content", "").lower() == "true"
            or values.get("id") == "PAGES_CONTAINER"
        ):
            self._main_depth = 1
            return
        if not self._main_depth:
            return
        self._main_depth += 1
        if tag in SKIP_TAGS:
            self._skip_depth += 1
            return
        if self._skip_depth:
            return
        if tag in BLOCK_TAGS:
            self._flush()
        if tag in {"h1", "h2", "h3", "h4", "h5", "h6"}:
            self._heading_depth += 1
        if tag == "a":
            href = values.get("href", "")
            if href:
                self.links.add(href)
        if tag == "img":
            alt = normalize_text(values.get("alt"))
            if alt:
                self._buffer.append(alt)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if self._main_depth:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        tag = tag.lower()
        if tag == "title":
            self._in_title = False
        if not self._main_depth:
            return
        if tag in SKIP_TAGS and self._skip_depth:
            self._skip_depth -= 1
        elif not self._skip_depth:
            if tag in {"h1", "h2", "h3", "h4", "h5", "h6"}:
                text = self._flush()
                if text:
                    self.headings.append(text)
                self._heading_depth = max(0, self._heading_depth - 1)
            elif tag in BLOCK_TAGS:
                self._flush()
        self._main_depth -= 1

    def handle_data(self, data):
        text = normalize_text(data)
        if not text:
            return
        if self._in_title:
            self.title_parts.append(text)
        if self._main_depth and not self._skip_depth:
            self._buffer.append(text)

    def _flush(self):
        text = normalize_text(" ".join(self._buffer))
        self._buffer = []
        if text:
            self.blocks.append(text)
        return text


def authority_for(row):
    path = urllib.parse.urlsplit(row["url"]).path.rstrip("/") or "/"
    kind = row["sitemap_kind"]
    if kind == "blog-posts":
        return "archive", "older news post; navigation only"
    if kind == "blog-categories" or path == "/news":
        return "navigation", "news index or category; navigation only"
    if kind == "profiles":
        return "excluded", "public author profile; excluded from participant retrieval"
    if path in EXCLUDED_PAGE_PATHS:
        return "excluded", EXCLUDED_PAGE_PATHS[path]
    if path in ARCHIVE_PAGE_PATHS:
        return "archive", "past Tech Fair page"
    if kind == "booking-services":
        slug = path.rsplit("/", 1)[-1]
        if "archive" in slug:
            return "archive", "service title is marked archive"
        if slug == "sample-class":
            return "excluded", "sample service page"
        if slug == "identity-theft-how-to-minimize-risk-1":
            return "excluded", "duplicate service page"
    return "answer", "current public operational page"


def page_id(row):
    path = urllib.parse.urlsplit(row["url"]).path.strip("/") or "home"
    prefix = {
        "pages": "page",
        "booking-services": "service",
        "blog-posts": "post",
        "blog-categories": "category",
        "profiles": "profile",
    }.get(row["sitemap_kind"], "page")
    slug = re.sub(r"[^a-z0-9]+", "-", path.lower()).strip("-")
    digest = hashlib.sha256(row["url"].encode()).hexdigest()[:8]
    return f"{prefix}-{slug[:72]}-{digest}"


def clean_blocks(blocks):
    output = []
    seen = set()
    generic = {
        "top of page", "bottom of page", "use tab to navigate through the menu items.",
    }
    for block in blocks:
        block = normalize_text(block)
        key = block.casefold()
        if len(block) < 2 or key in generic or key in seen:
            continue
        seen.add(key)
        output.append(block[:4000])
        if sum(len(item) for item in output) >= 60000:
            break
    return output


def internal_links(base_url, links):
    result = set()
    for raw in links:
        try:
            url = canonical_url(urllib.parse.urljoin(base_url, raw))
        except ValueError:
            continue
        if urllib.parse.urlsplit(url).hostname == ALLOWED_HOST and url != base_url:
            result.add(url)
    return sorted(result)


def reviewed_authority(row, previous=None):
    """Keep recorded source decisions; hold newly discovered URLs for review."""
    if previous:
        return (
            previous.get("authority", "excluded"),
            previous.get(
                "authority_reason",
                "existing source classification retained during content refresh",
            ),
        )
    proposed = authority_for(row)
    if proposed[0] != "answer":
        return proposed
    return "excluded", "new public URL pending Fortune staff source review"


def crawl_page(row, previous=None):
    record = dict(row)
    record["id"] = page_id(row)
    record["authority"], record["authority_reason"] = reviewed_authority(
        row, previous
    )
    path = urllib.parse.urlsplit(row["url"]).path
    record["volatile"] = any(token in path for token in (
        "/calendar", "/events", "/reserve", "/devices", "/opportunities", "/service-page/",
    ))
    try:
        body, status = fetch(row["url"])
        parser = PageExtractor()
        parser.feed(body.decode("utf-8", errors="replace"))
        blocks = clean_blocks(parser.blocks)
        content_characters = sum(len(block) for block in blocks)
        if record["authority"] == "answer" and content_characters < 80:
            record["authority"] = "excluded"
            record["authority_reason"] = "page returned too little public text for safe retrieval"
        record.update({
            "status": status,
            "title": normalize_text(" ".join(parser.title_parts)) or path.rsplit("/", 1)[-1].replace("-", " ").title(),
            "description": parser.description,
            "headings": clean_blocks(parser.headings)[:30],
            "blocks": blocks,
            "internal_links": internal_links(row["url"], parser.links),
            "content_characters": content_characters,
            "content_hash": hashlib.sha256("\n".join(blocks).encode()).hexdigest(),
            "source_owner": (previous or {}).get(
                "source_owner",
                "Fortune Society Digital Equity staff (confirmation pending)",
            ),
            "approval_state": (previous or {}).get(
                "approval_state", "pending Fortune staff review"
            ),
            "reviewed_on": (previous or {}).get("reviewed_on"),
        })
    except Exception as error:  # keep a failed URL visible in the audit inventory
        record.update({
            "status": 0,
            "title": path.rsplit("/", 1)[-1].replace("-", " ").title() or "Digital Equity home",
            "description": "",
            "headings": [],
            "blocks": [],
            "internal_links": [],
            "content_characters": 0,
            "content_hash": "",
            "source_owner": "Fortune Society Digital Equity staff (confirmation pending)",
            "approval_state": "crawl incomplete",
            "reviewed_on": None,
            "crawl_error": type(error).__name__,
        })
    return record


def write_index(pages, sitemap_entry_count, generated_from):
    pages.sort(key=lambda page: page["url"])
    counts = {}
    for page in pages:
        counts[page["authority"]] = counts.get(page["authority"], 0) + 1
    document = {
        "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "generated_from": generated_from,
        "root_sitemap": ROOT_SITEMAP,
        "sitemap_entries": sitemap_entry_count,
        "unique_urls": len(pages),
        "authority_counts": counts,
        "policy": {
            "answer": "May support a participant answer when retrieval finds it relevant.",
            "navigation": "May appear as a related destination but not as factual answer authority.",
            "archive": "Retained for provenance and labeled historical navigation only.",
            "excluded": "Retained in the audit inventory and unavailable to participant retrieval.",
        },
        "pages": pages,
    }
    temporary = OUTPUT.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(OUTPUT)
    successful = sum(1 for page in pages if page["status"] == 200)
    print(f"wrote {OUTPUT} ({successful}/{len(pages)} pages fetched; authorities={counts})")


def cached_inventory_pages(path):
    inventory = json.loads(path.read_text(encoding="utf-8"))
    kind_map = {
        "page": "pages",
        "booking": "booking-services",
        "blog_post": "blog-posts",
        "blog_category": "blog-categories",
    }
    pages = []
    for cached in inventory.get("records", []):
        row = {
            "url": canonical_url(cached["url"]),
            "sitemap_kind": kind_map.get(cached.get("sitemap_kind"), cached.get("sitemap_kind", "pages")),
            "lastmod": "",
        }
        recommendation = cached.get("recommendation")
        if recommendation == "authoritative":
            authority, reason = "answer", cached.get("recommendation_reason", "current public operational page")
        elif recommendation == "context_only":
            authority = "navigation" if row["sitemap_kind"] == "blog-categories" else "archive"
            reason = cached.get("recommendation_reason", "historical or index context only")
        else:
            authority, reason = "excluded", cached.get("recommendation_reason", "excluded from participant retrieval")

        visible = normalize_text(cached.get("visible_text"))
        marker = "Use tab to navigate through the menu items."
        if marker in visible:
            visible = visible.split(marker, 1)[1].strip()
        for footer_marker in ("Contact Us Volunteer Donate Media Kit", "©2024 by Fortune Society Digital Equity Program"):
            if footer_marker in visible:
                visible = visible.split(footer_marker, 1)[0].strip()
        title = normalize_text(cached.get("title"))
        if visible.startswith(title):
            visible = visible[len(title):].strip()
        blocks = clean_blocks(re.split(r"(?<=[.!?])\s+(?=[A-Z0-9])", visible))
        status = cached.get("status")
        status = status if isinstance(status, int) else 206
        path_value = urllib.parse.urlsplit(row["url"]).path
        pages.append({
            **row,
            "id": page_id(row),
            "authority": authority,
            "authority_reason": reason,
            "volatile": any(token in path_value for token in (
                "/calendar", "/events", "/reserve", "/devices", "/opportunities", "/service-page/",
            )),
            "status": status,
            "title": title,
            "description": "",
            "headings": [title] if title else [],
            "blocks": blocks,
            "internal_links": sorted({canonical_url(url) for url in cached.get("internal_links", []) if canonical_url(url)}),
            "content_characters": sum(len(block) for block in blocks),
            "content_hash": hashlib.sha256("\n".join(blocks).encode()).hexdigest(),
            "source_owner": "Fortune Society Digital Equity staff (confirmation pending)",
            "approval_state": "pending Fortune staff review" if status == 200 else "crawl incomplete",
            "reviewed_on": None,
            **({"crawl_error": "partial_fetch"} if status != 200 else {}),
        })
    return inventory, pages


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--from-inventory", type=pathlib.Path, help="Convert an already completed public crawl without making new requests.")
    args = parser.parse_args()
    if args.from_inventory:
        inventory, pages = cached_inventory_pages(args.from_inventory)
        write_index(
            pages,
            inventory.get("unique_url_count", len(pages)) + 1,
            inventory.get("generated_from", [ROOT_SITEMAP]),
        )
        return

    previous_pages = {}
    if OUTPUT.is_file():
        try:
            previous_document = json.loads(OUTPUT.read_text(encoding="utf-8"))
            previous_pages = {
                page["url"]: page
                for page in previous_document.get("pages", [])
                if isinstance(page, dict) and page.get("url")
            }
        except (OSError, json.JSONDecodeError, TypeError):
            previous_pages = {}

    all_rows, unique_rows = sitemap_entries()
    pages = []
    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = {
            executor.submit(crawl_page, row, previous_pages.get(row["url"])): row
            for row in unique_rows
        }
        completed = 0
        for future in as_completed(futures):
            pages.append(future.result())
            completed += 1
            if completed % 20 == 0 or completed == len(unique_rows):
                print(f"crawled {completed}/{len(unique_rows)}", file=sys.stderr)

    write_index(pages, len(all_rows), [ROOT_SITEMAP, BLOG_FEED])


if __name__ == "__main__":
    main()
