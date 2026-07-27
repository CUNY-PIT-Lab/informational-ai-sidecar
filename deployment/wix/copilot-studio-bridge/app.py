"""A narrow, public-information bridge from Wix to Copilot Studio Direct Line."""

from __future__ import annotations

import html
import logging
import os
import secrets
import threading
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from pathlib import Path
from typing import Callable
from urllib.parse import urlsplit

import httpx
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles


LOGGER = logging.getLogger("wix-copilot-embed")
ROOT = Path(__file__).resolve().parent
STATIC = ROOT / "static"
WEBCHAT_VERSION = "4.18.0"


def _truthy(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


def _absolute_origin(value: str, label: str, *, require_https: bool) -> str:
    parts = urlsplit(value.strip())
    if not parts.scheme or not parts.netloc or parts.path not in {"", "/"}:
        raise RuntimeError(f"{label} must be an absolute origin without a path")
    if parts.query or parts.fragment or parts.username or parts.password:
        raise RuntimeError(f"{label} must contain only scheme, host, and optional port")
    if require_https and parts.scheme != "https":
        raise RuntimeError(f"{label} must use HTTPS in production")
    if parts.scheme not in {"http", "https"}:
        raise RuntimeError(f"{label} must use HTTP or HTTPS")
    return f"{parts.scheme}://{parts.netloc}"


def _absolute_url(value: str, label: str, *, require_https: bool) -> str:
    parts = urlsplit(value.strip())
    if not parts.scheme or not parts.netloc:
        raise RuntimeError(f"{label} must be an absolute URL")
    if require_https and parts.scheme != "https":
        raise RuntimeError(f"{label} must use HTTPS in production")
    if parts.scheme not in {"http", "https"}:
        raise RuntimeError(f"{label} must use HTTP or HTTPS")
    return value.strip()


@dataclass(frozen=True)
class Settings:
    environment: str
    public_widget_url: str
    public_origin: str
    frame_ancestors: tuple[str, ...]
    direct_line_secret: str
    direct_line_domain: str
    mock_direct_line: bool
    token_rate_limit: int
    token_rate_window_seconds: int
    widget_title: str
    widget_description: str
    contact_url: str
    contact_label: str

    @property
    def production(self) -> bool:
        return self.environment == "production"

    @classmethod
    def from_env(cls) -> "Settings":
        environment = os.environ.get("APP_ENV", "development").strip().lower()
        production = environment == "production"
        public_widget_url = _absolute_url(
            os.environ.get("PUBLIC_WIDGET_URL", "http://127.0.0.1:8788"),
            "PUBLIC_WIDGET_URL",
            require_https=production,
        ).rstrip("/")
        public_origin = _absolute_origin(
            public_widget_url,
            "PUBLIC_WIDGET_URL",
            require_https=production,
        )

        raw_ancestors = os.environ.get(
            "ALLOWED_FRAME_ANCESTORS", "'self'" if not production else ""
        )
        frame_ancestors = tuple(item for item in raw_ancestors.split() if item)
        if not frame_ancestors:
            raise RuntimeError("ALLOWED_FRAME_ANCESTORS must not be empty")
        if any("*" in ancestor for ancestor in frame_ancestors):
            raise RuntimeError("ALLOWED_FRAME_ANCESTORS must not contain *")
        if production:
            for ancestor in frame_ancestors:
                try:
                    _absolute_origin(
                        ancestor,
                        "ALLOWED_FRAME_ANCESTORS",
                        require_https=True,
                    )
                except RuntimeError as exc:
                    raise RuntimeError(
                        "Production frame ancestors must be exact HTTPS origins"
                    ) from exc

        domain = _absolute_url(
            os.environ.get(
                "DIRECT_LINE_DOMAIN",
                "https://directline.botframework.com/v3/directline",
            ),
            "DIRECT_LINE_DOMAIN",
            require_https=True,
        ).rstrip("/")
        domain_parts = urlsplit(domain)
        if domain_parts.query or domain_parts.fragment:
            raise RuntimeError("DIRECT_LINE_DOMAIN must not include query or fragment")

        direct_line_secret = os.environ.get(
            "COPILOT_DIRECT_LINE_SECRET", ""
        ).strip()
        mock_direct_line = _truthy(os.environ.get("MOCK_DIRECT_LINE"))
        if production and mock_direct_line:
            raise RuntimeError("MOCK_DIRECT_LINE is unavailable in production")
        if production and not direct_line_secret:
            raise RuntimeError(
                "COPILOT_DIRECT_LINE_SECRET is required in production"
            )

        contact_url = _absolute_url(
            os.environ.get(
                "CONTACT_URL", "https://fortunesociety.org/contact-us/"
            ),
            "CONTACT_URL",
            require_https=production,
        )

        return cls(
            environment=environment,
            public_widget_url=public_widget_url,
            public_origin=public_origin,
            frame_ancestors=frame_ancestors,
            direct_line_secret=direct_line_secret,
            direct_line_domain=domain,
            mock_direct_line=mock_direct_line,
            token_rate_limit=max(
                1, int(os.environ.get("TOKEN_RATE_LIMIT", "8"))
            ),
            token_rate_window_seconds=max(
                30, int(os.environ.get("TOKEN_RATE_WINDOW_SECONDS", "300"))
            ),
            widget_title=os.environ.get(
                "WIDGET_TITLE", "Fortune information guide"
            ).strip(),
            widget_description=os.environ.get(
                "WIDGET_DESCRIPTION",
                "Verified public information about programs, events, and ways to connect.",
            ).strip(),
            contact_url=contact_url,
            contact_label=os.environ.get(
                "CONTACT_LABEL", "Contact The Fortune Society"
            ).strip(),
        )


class TokenRateLimiter:
    """A bounded in-process limiter for pilot traffic."""

    def __init__(self, limit: int, window_seconds: int) -> None:
        self.limit = limit
        self.window_seconds = window_seconds
        self._events: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def allow(self, key: str, now: float | None = None) -> bool:
        current = time.monotonic() if now is None else now
        cutoff = current - self.window_seconds
        with self._lock:
            events = self._events[key]
            while events and events[0] <= cutoff:
                events.popleft()
            if len(events) >= self.limit:
                return False
            events.append(current)
            return True


class BootstrapStore:
    """One-use widget bootstraps prevent replay from unrelated page loads."""

    def __init__(self, ttl_seconds: int = 300) -> None:
        self.ttl_seconds = ttl_seconds
        self._entries: dict[str, tuple[str, float]] = {}
        self._lock = threading.Lock()

    def issue(self, client_key: str, now: float | None = None) -> str:
        current = time.monotonic() if now is None else now
        value = secrets.token_urlsafe(32)
        with self._lock:
            self._prune(current)
            self._entries[value] = (client_key, current + self.ttl_seconds)
        return value

    def consume(
        self, value: str, client_key: str, now: float | None = None
    ) -> bool:
        current = time.monotonic() if now is None else now
        with self._lock:
            self._prune(current)
            entry = self._entries.pop(value, None)
        return bool(entry and entry[0] == client_key and entry[1] > current)

    def _prune(self, now: float) -> None:
        expired = [
            key for key, (_, expires_at) in self._entries.items()
            if expires_at <= now
        ]
        for key in expired:
            self._entries.pop(key, None)


def _client_key(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _widget_html(settings: Settings, bootstrap: str) -> str:
    template = (STATIC / "widget.html").read_text(encoding="utf-8")
    replacements = {
        "__BOOTSTRAP__": bootstrap,
        "__WIDGET_TITLE__": html.escape(settings.widget_title, quote=True),
        "__WIDGET_DESCRIPTION__": html.escape(
            settings.widget_description, quote=True
        ),
        "__CONTACT_URL__": html.escape(settings.contact_url, quote=True),
        "__CONTACT_LABEL__": html.escape(settings.contact_label, quote=True),
        "__WEBCHAT_VERSION__": WEBCHAT_VERSION,
    }
    for marker, value in replacements.items():
        template = template.replace(marker, value)
    return template


def _security_headers(
    settings: Settings,
    *,
    embeddable: bool,
    allow_same_origin_frame: bool = False,
) -> dict[str, str]:
    direct_line_host = urlsplit(settings.direct_line_domain).netloc
    frame_ancestors = (
        " ".join(settings.frame_ancestors) if embeddable else "'none'"
    )
    directives = [
        "default-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
        f"frame-ancestors {frame_ancestors}",
        "script-src 'self' https://cdn.botframework.com",
        "style-src 'self'",
        "img-src data: https:",
        "font-src data:",
        (
            "connect-src 'self' "
            f"https://{direct_line_host} wss://{direct_line_host}"
        ),
    ]
    if allow_same_origin_frame:
        directives.append("frame-src 'self'")
    csp = "; ".join(directives)
    return {
        "Cache-Control": "no-store, max-age=0",
        "Content-Security-Policy": csp,
        "Permissions-Policy": (
            "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
        ),
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
    }


def _direct_line_user_id() -> str:
    return "dl_" + secrets.token_urlsafe(24)


async def exchange_direct_line_token(
    settings: Settings,
    user_id: str,
    *,
    client_factory: Callable[..., httpx.AsyncClient] = httpx.AsyncClient,
) -> dict[str, object]:
    payload = {
        "user": {"id": user_id},
        "trustedOrigins": [settings.public_origin],
    }
    try:
        async with client_factory(
            timeout=httpx.Timeout(10.0),
            follow_redirects=False,
        ) as client:
            response = await client.post(
                f"{settings.direct_line_domain}/tokens/generate",
                headers={
                    "Authorization": (
                        f"Bearer {settings.direct_line_secret}"
                    ),
                    "Content-Type": "application/json",
                },
                json=payload,
            )
    except httpx.HTTPError as exc:
        LOGGER.warning(
            "Direct Line token exchange failed before response: %s",
            type(exc).__name__,
        )
        raise HTTPException(
            status_code=502, detail="The information guide is unavailable."
        ) from exc

    if not response.is_success:
        LOGGER.warning(
            "Direct Line token exchange returned status %s",
            response.status_code,
        )
        raise HTTPException(
            status_code=502, detail="The information guide is unavailable."
        )

    try:
        data = response.json()
    except ValueError as exc:
        raise HTTPException(
            status_code=502, detail="The information guide is unavailable."
        ) from exc

    token = data.get("token")
    if not isinstance(token, str) or not token:
        raise HTTPException(
            status_code=502, detail="The information guide is unavailable."
        )

    return {
        "token": token,
        "conversationId": data.get("conversationId"),
        "expiresIn": data.get("expires_in"),
        "userId": user_id,
        "domain": settings.direct_line_domain,
    }


def create_app(
    settings: Settings | None = None,
    token_exchange: Callable[
        [Settings, str], object
    ] = exchange_direct_line_token,
) -> FastAPI:
    active = settings or Settings.from_env()
    limiter = TokenRateLimiter(
        active.token_rate_limit, active.token_rate_window_seconds
    )
    bootstraps = BootstrapStore()
    application = FastAPI(
        title="Wix Copilot Studio embed",
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    application.mount(
        "/static", StaticFiles(directory=STATIC), name="static"
    )

    @application.get("/health")
    async def health() -> JSONResponse:
        response = JSONResponse(
            {
                "ok": True,
                "mode": "mock" if active.mock_direct_line else "direct-line",
            }
        )
        response.headers.update(
            _security_headers(active, embeddable=False)
        )
        return response

    @application.get("/embed")
    async def embed(request: Request) -> HTMLResponse:
        bootstrap = bootstraps.issue(_client_key(request))
        response = HTMLResponse(_widget_html(active, bootstrap))
        response.headers.update(
            _security_headers(active, embeddable=True)
        )
        return response

    @application.get("/preview")
    async def preview() -> HTMLResponse:
        if active.production:
            raise HTTPException(status_code=404, detail="Not found")
        body = (STATIC / "preview.html").read_text(encoding="utf-8")
        response = HTMLResponse(body)
        response.headers.update(
            _security_headers(
                active,
                embeddable=False,
                allow_same_origin_frame=True,
            )
        )
        return response

    @application.post("/api/direct-line/token")
    async def direct_line_token(
        request: Request,
        x_widget_bootstrap: str = Header(default=""),
        origin: str = Header(default=""),
        sec_fetch_site: str = Header(default=""),
    ) -> JSONResponse:
        client_key = _client_key(request)
        if origin != active.public_origin:
            raise HTTPException(status_code=403, detail="Origin rejected")
        if sec_fetch_site and sec_fetch_site != "same-origin":
            raise HTTPException(status_code=403, detail="Request rejected")
        if not limiter.allow(client_key):
            raise HTTPException(
                status_code=429,
                detail="Too many new conversations. Try again shortly.",
                headers={"Retry-After": str(active.token_rate_window_seconds)},
            )
        if not bootstraps.consume(x_widget_bootstrap, client_key):
            raise HTTPException(
                status_code=403, detail="Widget session expired"
            )

        user_id = _direct_line_user_id()
        if active.mock_direct_line:
            payload: dict[str, object] = {
                "mock": True,
                "userId": user_id,
                "expiresIn": 1800,
            }
        else:
            result = token_exchange(active, user_id)
            payload = await result if hasattr(result, "__await__") else result

        response = JSONResponse(payload)
        response.headers.update(
            _security_headers(active, embeddable=False)
        )
        return response

    return application


app = create_app()
