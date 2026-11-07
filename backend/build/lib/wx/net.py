"""Shared HTTP client with an identifying User-Agent and simple retries."""

import time

import httpx

from . import settings

_client: httpx.Client | None = None


def client() -> httpx.Client:
    global _client
    if _client is None:
        _client = httpx.Client(
            headers={"User-Agent": settings.USER_AGENT, "Accept-Encoding": "gzip"},
            timeout=settings.HTTP_TIMEOUT,
            follow_redirects=True,
        )
    return _client


def get(url: str, params=None, retries: int = 2, headers: dict | None = None) -> httpx.Response:
    """GET with retries on network errors and 5xx. Raises on final failure."""
    last: Exception | None = None
    for attempt in range(retries + 1):
        try:
            r = client().get(url, params=params, headers=headers)
            if r.status_code >= 500:
                raise httpx.HTTPStatusError(f"{r.status_code} from {url}", request=r.request, response=r)
            r.raise_for_status()
            return r
        except (httpx.TransportError, httpx.HTTPStatusError) as e:
            last = e
            if isinstance(e, httpx.HTTPStatusError) and e.response.status_code < 500:
                raise
            if attempt < retries:
                time.sleep(2 * (attempt + 1))
    assert last is not None
    raise last


def get_json(url: str, params=None, headers: dict | None = None):
    return get(url, params, headers=headers).json()


def get_bytes(url: str, params=None) -> bytes:
    return get(url, params).content
