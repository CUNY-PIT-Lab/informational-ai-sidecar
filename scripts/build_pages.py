#!/usr/bin/env python3
"""Build the allowlisted static artifact for the Fortune guide demonstration.

The source index remains the route inventory. Each indexed public URL receives
one physical ``index.html`` shell whose route configuration is inserted at the
``<!-- ROUTE_CONFIG -->`` marker. Only the files named in ``SHARED_ASSETS`` can
enter the Pages artifact alongside those generated route shells.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import shutil
import tempfile
import urllib.parse


ROOT = pathlib.Path(__file__).resolve().parents[1]
INDEX_PATH = ROOT / "site-index.json"
TEMPLATE_PATH = ROOT / "index.html"
OUTPUT_PATH = ROOT / "_site"
ROUTE_MARKER = "<!-- ROUTE_CONFIG -->"
ALLOWED_HOSTS = {"fortunedigitalequity.org", "www.fortunedigitalequity.org"}
SHARED_ASSETS = (
    "styles.css",
    "guide-core.js",
    "app.js",
    "site.js",
    "config.js",
    "site-index.json",
)


class BuildError(RuntimeError):
    """Raised when the source inventory or generated artifact is unsafe."""


def route_path(url: str) -> str:
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != "https" or parsed.hostname not in ALLOWED_HOSTS:
        raise BuildError(f"route is outside the approved HTTPS host: {url!r}")
    if parsed.query or parsed.fragment:
        raise BuildError(f"route contains a query or fragment: {url!r}")
    path = parsed.path.rstrip("/") or "/"
    parts = pathlib.PurePosixPath(path).parts
    if any(part in {"", ".", ".."} for part in parts[1:]):
        raise BuildError(f"route contains an unsafe path component: {url!r}")
    return path


def load_routes() -> list[dict[str, str]]:
    try:
        document = json.loads(INDEX_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise BuildError(f"cannot read {INDEX_PATH}: {error}") from error

    pages = document.get("pages")
    declared_count = document.get("unique_urls")
    if not isinstance(pages, list) or not pages:
        raise BuildError("site-index.json must contain a non-empty pages list")
    if declared_count != len(pages):
        raise BuildError(
            f"site-index.json declares {declared_count!r} URLs but contains {len(pages)} pages"
        )

    routes = []
    seen_paths: set[str] = set()
    seen_ids: set[str] = set()
    for position, page in enumerate(pages, start=1):
        if not isinstance(page, dict):
            raise BuildError(f"page {position} is not an object")
        url = str(page.get("url") or "").strip()
        page_id = str(page.get("id") or "").strip()
        if not url or not page_id:
            raise BuildError(f"page {position} is missing url or id")
        path = route_path(url)
        if path in seen_paths:
            raise BuildError(f"duplicate route path: {path}")
        if page_id in seen_ids:
            raise BuildError(f"duplicate page id: {page_id}")
        seen_paths.add(path)
        seen_ids.add(page_id)
        routes.append({"path": path, "sourceUrl": url, "pageId": page_id})

    if "/" not in seen_paths:
        raise BuildError("site-index.json does not contain the root route")
    return sorted(routes, key=lambda route: route["path"])


def route_destination(site_root: pathlib.Path, path: str) -> pathlib.Path:
    if path == "/":
        return site_root / "index.html"
    return site_root.joinpath(*path.strip("/").split("/"), "index.html")


def route_script(route: dict[str, str], asset_base: str) -> str:
    payload = json.dumps(route, ensure_ascii=True, separators=(",", ":"))
    encoded_asset_base = json.dumps(asset_base, ensure_ascii=True)
    return (
        "<script>\n"
        f"    window.FORTUNE_ROUTE_CONFIG = Object.freeze({payload});\n"
        "    window.FORTUNE_ROUTE_URL = window.FORTUNE_ROUTE_CONFIG.sourceUrl;\n"
        "    window.FORTUNE_STATIC_ROUTES = true;\n"
        f"    window.FORTUNE_ASSET_BASE = {encoded_asset_base};\n"
        "  </script>"
    )


def render_shell(template: str, route: dict[str, str]) -> str:
    if template.count(ROUTE_MARKER) != 1:
        raise BuildError(f"index.html must contain exactly one {ROUTE_MARKER!r}")
    depth = 0 if route["path"] == "/" else len(route["path"].strip("/").split("/"))
    prefix = "../" * depth
    shell = template.replace(ROUTE_MARKER, route_script(route, prefix), 1)
    shell = shell.replace('href="styles.css', f'href="{prefix}styles.css')
    for asset in ("config.js", "guide-core.js", "site.js", "app.js"):
        shell = shell.replace(f'src="{asset}"', f'src="{prefix}{asset}"')
    return shell


def expected_files(routes: list[dict[str, str]]) -> set[pathlib.PurePosixPath]:
    expected = {pathlib.PurePosixPath(asset) for asset in SHARED_ASSETS}
    for route in routes:
        if route["path"] == "/":
            expected.add(pathlib.PurePosixPath("index.html"))
        else:
            expected.add(
                pathlib.PurePosixPath(route["path"].strip("/")) / "index.html"
            )
    return expected


def validate_output(site_root: pathlib.Path, routes: list[dict[str, str]]) -> dict[str, int]:
    actual: set[pathlib.PurePosixPath] = set()
    for candidate in site_root.rglob("*"):
        if candidate.is_symlink():
            raise BuildError(f"Pages artifact contains a symbolic link: {candidate}")
        if candidate.is_file():
            actual.add(pathlib.PurePosixPath(candidate.relative_to(site_root).as_posix()))

    expected = expected_files(routes)
    unexpected = sorted(actual - expected)
    missing = sorted(expected - actual)
    if unexpected:
        raise BuildError(
            "Pages artifact contains files outside the allowlist: "
            + ", ".join(str(path) for path in unexpected)
        )
    if missing:
        raise BuildError(
            "Pages artifact is missing expected files: "
            + ", ".join(str(path) for path in missing)
        )

    route_shells = [path for path in actual if path.name == "index.html"]
    if len(route_shells) != len(routes):
        raise BuildError(
            f"expected {len(routes)} route shells but found {len(route_shells)}"
        )
    for shell_path in route_shells:
        shell = (site_root / pathlib.Path(shell_path.as_posix())).read_text(encoding="utf-8")
        required_route_settings = (
            "window.FORTUNE_ROUTE_CONFIG",
            "window.FORTUNE_ROUTE_URL",
            "window.FORTUNE_STATIC_ROUTES = true",
            "window.FORTUNE_ASSET_BASE",
        )
        if ROUTE_MARKER in shell or not all(
            setting in shell for setting in required_route_settings
        ):
            raise BuildError(f"route configuration is missing from {shell_path}")

    return {
        "indexed_routes": len(routes),
        "route_shells": len(route_shells),
        "shared_assets": len(SHARED_ASSETS),
        "allowlisted_root_files": len(SHARED_ASSETS) + 1,
        "total_files": len(actual),
    }


def build(routes: list[dict[str, str]]) -> dict[str, int]:
    required = (TEMPLATE_PATH,) + tuple(ROOT / asset for asset in SHARED_ASSETS)
    missing = [path.name for path in required if not path.is_file()]
    if missing:
        raise BuildError("missing public source files: " + ", ".join(sorted(missing)))

    template = TEMPLATE_PATH.read_text(encoding="utf-8")
    temporary = pathlib.Path(tempfile.mkdtemp(prefix=".pages-build-", dir=ROOT))
    try:
        for asset in SHARED_ASSETS:
            shutil.copyfile(ROOT / asset, temporary / asset)
        for route in routes:
            destination = route_destination(temporary, route["path"])
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_text(render_shell(template, route), encoding="utf-8")
        counts = validate_output(temporary, routes)
        if OUTPUT_PATH.exists():
            if OUTPUT_PATH.is_symlink() or not OUTPUT_PATH.is_dir():
                raise BuildError(f"refusing to replace unsafe output path: {OUTPUT_PATH}")
            shutil.rmtree(OUTPUT_PATH)
        temporary.replace(OUTPUT_PATH)
        return counts
    except Exception:
        if temporary.exists():
            shutil.rmtree(temporary)
        raise


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--check-index",
        action="store_true",
        help="validate site-index.json without writing the Pages artifact",
    )
    args = parser.parse_args()
    try:
        routes = load_routes()
        if args.check_index:
            print(f"validated {INDEX_PATH.name}: {len(routes)} unique HTTPS routes")
            return 0
        counts = build(routes)
    except BuildError as error:
        parser.error(str(error))

    print(f"built {OUTPUT_PATH}")
    print(f"indexed routes: {counts['indexed_routes']}")
    print(f"route shells: {counts['route_shells']}")
    print(f"shared assets: {counts['shared_assets']}")
    print(f"allowlisted root files: {counts['allowlisted_root_files']}")
    print(f"total files: {counts['total_files']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
