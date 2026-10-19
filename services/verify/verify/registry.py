"""Council lookups. Only the hosts below are ever requested.

Every adapter sends the registration number the worker typed (query string or
form field). A user-supplied URL is rejected; an admin override in
app_settings.verify_registry_adapters may change paths/field names but never the
host. live=False (tests, kill switch) never calls the transport.

Results: suspended / removed / expired is a fail. Anything uncertain (not found,
timeout, rate limit, captcha, parse, an adapter not yet confirmed against the
live site) is review, never a silent pass.

ADAPTER STATUS (18 Oct 2026, checked with curl from the build box):
- coa:   POST form field reg_no, but the page has a security-code captcha -> manual.
- tnmc, bctnpy: the search pages are JavaScript apps; the request below is our best
  reading and is marked confirmed=False. Confirm the real request in a browser's
  network tab, then set confirmed=true in verify_registry_adapters.
- nmc, rci, cmda: same, unconfirmed.
"""
from __future__ import annotations

import re
from urllib.parse import urlparse

from .names import fold, name_score

ADAPTERS: dict[str, dict] = {
    "tnmc": {"url": "https://www.tamilnadumedicalcouncil.org/rmp/search", "method": "GET", "field": "regno", "confirmed": False,
             "deep_link": "https://www.tamilnadumedicalcouncil.org/rmp/search"},
    "nmc": {"url": "https://nmc.org.in/information-desk/indian-medical-register", "method": "GET", "field": "registrationNo", "confirmed": False,
            "deep_link": "https://nmc.org.in/information-desk/indian-medical-register"},
    "bctnpy": {"url": "https://www.bctnpy.org/l/verifyAdvocate", "method": "GET", "field": "enrollment_no", "confirmed": False,
               "deep_link": "https://www.bctnpy.org/l/verifyAdvocate"},
    "coa": {"url": "https://coa.gov.in/ver_arch.php?lang=1", "method": "POST", "field": "reg_no", "confirmed": False, "manual": "captcha",
            "deep_link": "https://coa.gov.in/ver_arch.php?lang=1"},
    "cmda": {"url": "https://cmdachennai.gov.in/RegiDevProfList/E1/2026.html", "method": "GET", "field": None, "confirmed": False,
             "deep_link": "https://cmdachennai.gov.in/RegiDevProfList/E1/2026.html"},
    "rci": {"url": "https://rciregistration.nic.in/rehabcouncil/newsearchpage.jsp", "method": "POST", "field": "crrno", "confirmed": False,
            "deep_link": "https://rciregistration.nic.in/rehabcouncil/newsearchpage.jsp"},
}
URLS = {k: v["url"] for k, v in ADAPTERS.items()}
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


def merge_adapters(overrides: dict | None) -> dict[str, dict]:
    """Admin overrides (app_settings.verify_registry_adapters). Hosts cannot change."""
    out = {k: dict(v) for k, v in ADAPTERS.items()}
    for key, patch in (overrides or {}).items():
        if key not in out or not isinstance(patch, dict):
            continue
        cand = {**out[key], **{k: v for k, v in patch.items() if k in ("url", "method", "field", "confirmed", "manual", "extra")}}
        try:
            guard_url(str(cand["url"]))
        except RegistryError:
            continue
        if urlparse(str(cand["url"])).hostname != urlparse(out[key]["url"]).hostname:
            continue
        if str(cand.get("method", "GET")).upper() not in ("GET", "POST"):
            continue
        out[key] = cand
    return out


def build_request(adapter: dict, reg_no: str) -> dict:
    """The exact request the transport sends. The registration number always goes out."""
    method = str(adapter.get("method") or "GET").upper()
    field = adapter.get("field")
    params: dict[str, str] = dict(adapter.get("extra") or {})
    if field:
        params[str(field)] = reg_no
    req = {"method": method, "url": guard_url(str(adapter["url"]))}
    if method == "GET":
        req["params"] = params
    else:
        req["data"] = params
    return req


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
    """transport(request: dict) -> html. request = build_request(adapter, reg_no)."""

    def __init__(self, transport, *, live: bool = False, now=None, cache: dict | None = None, max_age: float = 86400,
                 adapters: dict | None = None, allow_unconfirmed: bool = False):
        self.transport = transport
        self.live = live
        self.now = now or (lambda: 0.0)
        self.cache = cache if cache is not None else {}
        self.max_age = max_age
        self.hits: list[tuple[str, float]] = []
        self.adapters = adapters or merge_adapters(None)
        self.allow_unconfirmed = allow_unconfirmed

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
        adapter = self.adapters.get(provider)
        if not adapter:
            return {"status": "review", "score": None, "evidence": {"reason": "no_adapter", "provider": provider}}
        if adapter.get("manual"):
            return {"status": "review", "score": None, "evidence": {"reason": str(adapter["manual"]), "provider": provider}}
        if not (reg_no or "").strip():
            return {"status": "review", "score": None, "evidence": {"reason": "no_number", "provider": provider}}
        request = build_request(adapter, reg_no.strip())
        host = urlparse(request["url"]).hostname or ""
        now = float(self.now())
        cached = self.cache.get((provider, reg_no))
        if cached and now - cached[0] < self.max_age:
            return cached[1]
        if not self._allowed(host, now):
            return {"status": "review", "score": None, "evidence": {"reason": "rate_limit", "provider": provider}}
        try:
            html = self.transport(request)
        except TimeoutError:
            return {"status": "review", "score": None, "evidence": {"reason": "timeout", "provider": provider}}
        except Exception:
            return {"status": "review", "score": None, "evidence": {"reason": "error", "provider": provider}}
        parsed = parse_registry_html(html or "", reg_no, name)
        parsed["evidence"] = {**parsed.get("evidence", {}), "provider": provider, "sent": request.get("params") or request.get("data")}
        # An adapter nobody has confirmed against the live site can neither auto-pass nor hard-fail.
        if parsed["status"] in ("pass", "fail") and not adapter.get("confirmed") and not self.allow_unconfirmed:
            parsed = {"status": "review", "score": None, "evidence": {**parsed["evidence"], "reason": "unconfirmed_adapter", "parsed": parsed["status"]}}
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
