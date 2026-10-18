"""Verify API. Health is open. Everything else needs VERIFY_SERVICE_KEY (Bearer).

How cases get here (no client ever calls this service):
- pg_cron "verify-dispatch" (every minute) -> verification_dispatch() -> pg_net POST
  {verify_service_url}/verify/dispatch with Authorization: Bearer {verify_service_key}.
  Used in production where the database can reach the service URL.
- Poll loop: VERIFY_POLL_SECONDS > 0 makes this process claim queued jobs itself
  (local dev / e2e, or a private VM the database cannot reach). Both paths use
  verification_claim_job() (FOR UPDATE SKIP LOCKED), so running both is safe.
- POST /verify/maintenance deletes expired raw selfies, QR files and liveness frames
  through the Storage API (direct SQL deletes are blocked by Supabase storage).

Council fetches use the allow-list in registry.py and do not follow redirects.
A timeout, a missing adapter, or the kill switch becomes a review check — the
SQL decision then queues the case instead of approving it.
"""
from __future__ import annotations

import logging
import os
import threading
import time
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Header, HTTPException

from .engine import evaluate
from .qr import load_uidai_key
from .registry import URLS, Registry, RegistryError, guard_url, merge_adapters

log = logging.getLogger("verify")


@asynccontextmanager
async def _lifespan(_app):
    secs = float(os.environ.get("VERIFY_POLL_SECONDS", "0") or 0)
    stop = threading.Event()
    if secs > 0:
        threading.Thread(target=_poll_loop, args=(secs, stop), daemon=True).start()
    yield
    stop.set()


app = FastAPI(title="Meiyiyal verify", version="1.1", lifespan=_lifespan)


def _providers() -> dict:
    return {"face": os.environ.get("FACE_PROVIDER", "none"), "liveness": os.environ.get("LIVENESS_PROVIDER", "heuristic"),
            "ocr": os.environ.get("OCR_PROVIDER", "none"), "uidai_cert": bool(os.environ.get("UIDAI_QR_CERT_PATH"))}


@app.get("/verify/health")
def health():
    return {"ok": True, "registries": sorted(URLS), "providers": _providers()}


def _authorised(authorization: str | None) -> None:
    key = os.environ.get("VERIFY_SERVICE_KEY", "")
    if not key:
        raise HTTPException(503, "verify service key is not configured")
    if authorization != f"Bearer {key}":
        raise HTTPException(401, "unauthorized")


def _headers(service: str) -> dict:
    return {"apikey": service, "authorization": f"Bearer {service}", "content-type": "application/json"}


def _rpc(client: httpx.Client, base: str, headers: dict, fn: str, body: dict):
    res = client.post(f"{base}/rest/v1/rpc/{fn}", headers=headers, json=body)
    if res.status_code >= 400:
        raise HTTPException(502, f"{fn} failed")
    if not res.content:
        return None
    return res.json()


def _setting(client: httpx.Client, base: str, headers: dict, key: str):
    res = client.get(f"{base}/rest/v1/app_settings", headers=headers, params={"key": f"eq.{key}", "select": "value"})
    if res.status_code >= 400 or not res.content:
        return None
    rows = res.json()
    return rows[0]["value"] if rows else None


def _download(client: httpx.Client, base: str, headers: dict, bucket: str, path: str | None) -> bytes | None:
    if not path:
        return None
    res = client.get(f"{base}/storage/v1/object/{bucket}/{path}", headers=headers)
    if res.status_code == 404:
        return None
    if res.status_code >= 400:
        return None
    return res.content


def _fetch_official(request: dict) -> str:
    url = guard_url(request["url"])
    with httpx.Client(timeout=15, follow_redirects=False) as client:
        headers = {"user-agent": "MeiyiyalVerify/1.1 (+https://meiyiyal.com)"}
        if request.get("method") == "POST":
            res = client.post(url, data=request.get("data") or {}, headers=headers)
        else:
            res = client.get(url, params=request.get("params") or {}, headers=headers)
        if res.status_code in (301, 302, 303, 307, 308):
            raise RegistryError("redirect")
        if res.status_code >= 400:
            raise RegistryError("http")
        return res.text


def process_case(case_id: str) -> dict:
    base = os.environ.get("SUPABASE_URL", "").rstrip("/")
    service = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not base or not service:
        raise HTTPException(503, "supabase is not configured")
    headers = _headers(service)
    with httpx.Client(timeout=20, follow_redirects=False) as client:
        bundle = _rpc(client, base, headers, "verification_case_bundle", {"_case": case_id})
        if not bundle:
            raise HTTPException(404, "case not found")
        live_flag = _setting(client, base, headers, "verify_registry_live")
        pepper = os.environ.get("VERIFY_HMAC_PEPPER") or str(_setting(client, base, headers, "verify_hmac_pepper") or "")
        name_pass = float(_setting(client, base, headers, "verify_name_pass") or 0.92)
        name_review = float(_setting(client, base, headers, "verify_name_review") or 0.80)
        files = {
            "qr": _download(client, base, headers, "kyc", bundle.get("qr_path")),
            "selfie": _download(client, base, headers, "kyc", bundle.get("raw_selfie_path")),
            "docs": {},
        }
        for doc in bundle.get("docs") or []:
            files["docs"][doc.get("type")] = _download(client, base, headers, "worker-docs", doc.get("path"))
        live: dict[str, list[bytes]] = {}
        for fr in bundle.get("liveness_frames") or []:
            blob = _download(client, base, headers, "kyc", fr.get("path"))
            if blob:
                live.setdefault(str(fr.get("step")), []).append(blob)
        files["live"] = live
        portrait_url = bundle.get("public_portrait_url") or ""
        if portrait_url.startswith(base):
            path = portrait_url.split("/object/public/avatars/", 1)[-1]
            files["portrait"] = _download(client, base, headers, "avatars", path)

        def observe(kind: str, digest: str) -> str:
            return _rpc(client, base, headers, "verification_observe_fingerprint", {"_worker": bundle["worker_id"], "_kind": kind, "_hash": digest}) or "ok"

        overrides = _setting(client, base, headers, "verify_registry_adapters")
        registry = Registry(_fetch_official, live=live_flag is True, now=time.time, adapters=merge_adapters(overrides if isinstance(overrides, dict) else None))
        prov = _providers()
        checks = evaluate(bundle, files, registry=registry, pepper=pepper, qr_public=None, observe=observe, name_pass=name_pass, name_review=name_review,
                          uidai_key=load_uidai_key(os.environ.get("UIDAI_QR_CERT_PATH")), face_provider=prov["face"],
                          liveness_provider=prov["liveness"], ocr_provider=prov["ocr"])
        for item in checks:
            _rpc(client, base, headers, "verification_write_check", {
                "_case": case_id, "_check": item["check"], "_provider": item.get("provider"),
                "_status": item["status"], "_score": item.get("score"), "_evidence": item.get("evidence") or {},
            })
        decision = _rpc(client, base, headers, "verification_decide", {"_case": case_id})
        return {"case_id": case_id, "decision": decision}


def run_case(case_id: str) -> dict:
    return process_case(case_id)


def _db() -> tuple[str, dict]:
    base = os.environ.get("SUPABASE_URL", "").rstrip("/")
    service = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not base or not service:
        raise HTTPException(503, "supabase is not configured")
    return base, _headers(service)


def dispatch(limit: int = 10) -> dict:
    """Claim queued jobs one by one, run them, record the outcome. Errors back off and retry."""
    base, headers = _db()
    done, failed = 0, 0
    with httpx.Client(timeout=20) as client:
        for _ in range(max(1, limit)):
            rows = _rpc(client, base, headers, "verification_claim_job", {}) or []
            if not rows:
                break
            job = rows[0]
            try:
                run_case(job["case_id"])
                _rpc(client, base, headers, "verification_job_finish", {"_job": job["job_id"], "_ok": True, "_error": None})
                done += 1
            except Exception as exc:  # noqa: BLE001
                log.warning("verification job %s failed: %s", job["job_id"], exc)
                _rpc(client, base, headers, "verification_job_finish", {"_job": job["job_id"], "_ok": False, "_error": str(exc)[:300]})
                failed += 1
    return {"done": done, "failed": failed}


def _storage_delete(client: httpx.Client, base: str, headers: dict, bucket: str, paths: list[str]) -> bool:
    res = client.request("DELETE", f"{base}/storage/v1/object/{bucket}", headers=headers, json={"prefixes": paths})
    return res.status_code < 400


def maintenance(limit: int = 50) -> dict:
    """Retention: delete raw KYC objects due for purge via the Storage API, then mark the cases."""
    base, headers = _db()
    purged = 0
    with httpx.Client(timeout=20) as client:
        due = _rpc(client, base, headers, "verification_purge_due", {"_limit": limit}) or []
        for row in due:
            paths = [p for p in (row.get("paths") or []) if p]
            if paths and not _storage_delete(client, base, headers, "kyc", paths):
                continue
            _rpc(client, base, headers, "verification_purge_mark", {"_case": row["case_id"]})
            purged += 1
    return {"purged": purged}


def _poll_loop(secs: float, stop: threading.Event) -> None:
    last_maint = 0.0
    while not stop.is_set():
        try:
            dispatch()
            if time.time() - last_maint > float(os.environ.get("VERIFY_MAINTENANCE_SECONDS", "3600")):
                maintenance()
                last_maint = time.time()
        except Exception as exc:  # noqa: BLE001
            log.warning("verify poll: %s", exc)
        stop.wait(secs)


@app.post("/verify/dispatch")
def dispatch_route(authorization: str | None = Header(default=None)):
    _authorised(authorization)
    return dispatch()


@app.post("/verify/maintenance")
def maintenance_route(authorization: str | None = Header(default=None)):
    _authorised(authorization)
    return maintenance()


@app.post("/verify/cases/{case_id}/run")
def run_route(case_id: str, authorization: str | None = Header(default=None)):
    _authorised(authorization)
    for url in URLS.values():
        guard_url(url)
    return run_case(case_id)
