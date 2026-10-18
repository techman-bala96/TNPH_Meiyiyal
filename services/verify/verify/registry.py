"""Council lookups. Only the hosts below are ever requested.

A user-supplied URL is rejected. live=False (tests, kill switch) never calls
the transport. Suspended / removed / expired is a fail. Anything uncertain
(not found, timeout, rate limit, parse) is review — never a silent pass.
"""
from __future__ import annotations

import re
from urllib.parse import urlparse

from .names import fold, name_score

URLS = {
    "tnmc": "https://www.tamilnadumedicalcouncil.org/rmp/search",
    "nmc": "https://nmc.org.in/information-desk/indian-medical-register",
    "bctnpy": "https://www.bctnpy.org/l/verifyAdvocate",
    "coa": "https://coa.gov.in/ver_arch.php?lang=1",
    "cmda": "https://cmdachennai.gov.in/RegiDevProfList/E1/2026.html",
    "rci": "https://rciregistration.nic.in/rehabcouncil/newsearchpage.jsp",
}
HOSTS = {urlparse(u).hostname for u in URLS.values()}
_BAD = re.compile(r"suspend|removed|struck|expired|cancelled|canceled|debarred", re.I)


class RegistryError(Exception):
    pass


def guard_url(url: str) -> str:
    parsed = urlparse(url)
    host = parsed.hostname or ""
    if parsed.scheme != "https" or parsed.username or parsed.port not in (None, 443):
        raise RegistryError("blocked url")
    if host not in HOSTS or not host:
        raise RegistryError("blocked url")
    return url


def _line_around(html: str, idx: int) -> str:
    start = html.rfind("\n", 0, idx)
    end = html.find("\n", idx)
    if start < 0:
        start = 0
    if end < 0:
        end = len(html)
    return html[start:end]


def _name_in(name: str, window: str) -> bool:
    if name_score(name, window) >= 0.80:
        return True
    tokens = [t for t in fold(name).split() if len(t) > 2]
    blob = fold(window)
    return bool(tokens) and all(t in blob for t in tokens)


def parse_registry_html(html: str, reg_no: str, name: str) -> dict:
    key = (reg_no or "").strip()
    if not html or not key:
        return {"status": "review", "score": None, "evidence": {"reason": "not_found"}}
    low = html.lower()
    if key.lower() not in low:
        return {"status": "review", "score": None, "evidence": {"reason": "not_found"}}
    window = _line_around(html, low.find(key.lower()))
    if _BAD.search(window):
        return {"status": "fail", "score": 0, "evidence": {"hard": "true", "reason": "suspended"}}
    if not _name_in(name, window):
        return {"status": "review", "score": None, "evidence": {"reason": "name"}}
    return {"status": "pass", "score": 1, "evidence": {"reason": "active"}}


class Registry:
    def __init__(self, transport, *, live: bool = False, now=None, cache: dict | None = None, max_age: float = 86400):
        self.transport = transport
        self.live = live
        self.now = now or (lambda: 0.0)
        self.cache = cache if cache is not None else {}
        self.max_age = max_age
        self.hits: list[tuple[str, float]] = []

    def _allowed(self, host: str, now: float) -> bool:
        recent = [t for h, t in self.hits if h == host and now - t < 3600]
        last = [t for h, t in self.hits if h == host]
        if last and now - last[-1] < 2:
            return False
        if len(recent) >= 30:
            return False
        self.hits.append((host, now))
        return True

    def lookup(self, provider: str, reg_no: str, name: str) -> dict:
        if not self.live:
            return {"status": "review", "score": None, "evidence": {"reason": "live_off", "provider": provider}}
        if provider in ("manual", "none", "", None):
            reason = "manual" if provider == "manual" else "no_provider"
            return {"status": "review", "score": None, "evidence": {"reason": reason, "provider": provider}}
        if provider not in URLS:
            return {"status": "review", "score": None, "evidence": {"reason": "no_adapter", "provider": provider}}
        url = guard_url(URLS[provider])
        host = urlparse(url).hostname or ""
        now = float(self.now())
        cached = self.cache.get((provider, reg_no))
        if cached and now - cached[0] < self.max_age:
            return cached[1]
        if not self._allowed(host, now):
            return {"status": "review", "score": None, "evidence": {"reason": "rate_limit", "provider": provider}}
        try:
            html = self.transport(url, reg_no)
        except TimeoutError:
            return {"status": "review", "score": None, "evidence": {"reason": "timeout", "provider": provider}}
        except Exception:
            return {"status": "review", "score": None, "evidence": {"reason": "error", "provider": provider}}
        parsed = parse_registry_html(html or "", reg_no, name)
        parsed["evidence"] = {**parsed.get("evidence", {}), "provider": provider}
        if parsed["status"] == "pass":
            self.cache[(provider, reg_no)] = (now, parsed)
        return parsed

    def lookup_chain(self, providers: list[str], reg_no: str, name: str) -> dict:
        last = {"status": "review", "score": None, "evidence": {"reason": "no_provider"}}
        for provider in providers:
            result = self.lookup(provider, reg_no, name)
            if result["status"] in ("pass", "fail"):
                return result
            last = result
        return last
