"""Verify API. Health is open. Running a case needs VERIFY_SERVICE_KEY.

Council fetches use the allow-list in registry.py and do not follow redirects.
A timeout, a missing adapter, or the kill switch becomes a review check — the
SQL decision then queues the case instead of approving it.
"""
from __future__ import annotations

import os
import time

import httpx
from fastapi import FastAPI, Header, HTTPException

from .engine import evaluate
from .registry import URLS, Registry, RegistryError, guard_url

app = FastAPI(title="Meiyiyal verify", version="1.0")


@app.get("/verify/health")
def health():
    return {"ok": True, "registries": sorted(URLS)}


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


def _fetch_official(url: str, _reg_no: str) -> str:
    guard_url(url)
    with httpx.Client(timeout=15, follow_redirects=False) as client:
        res = client.get(url, headers={"user-agent": "MeiyiyalVerify/1.0"})
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
        portrait_url = bundle.get("public_portrait_url") or ""
        if portrait_url.startswith(base):
            path = portrait_url.split("/object/public/avatars/", 1)[-1]
            files["portrait"] = _download(client, base, headers, "avatars", path)

        def observe(kind: str, digest: str) -> str:
            return _rpc(client, base, headers, "verification_observe_fingerprint", {"_worker": bundle["worker_id"], "_kind": kind, "_hash": digest}) or "ok"

        registry = Registry(_fetch_official, live=live_flag is True, now=time.time)
        checks = evaluate(bundle, files, registry=registry, pepper=pepper, qr_public=None, observe=observe, name_pass=name_pass, name_review=name_review)
        for item in checks:
            _rpc(client, base, headers, "verification_write_check", {
                "_case": case_id, "_check": item["check"], "_provider": item.get("provider"),
                "_status": item["status"], "_score": item.get("score"), "_evidence": item.get("evidence") or {},
            })
        decision = _rpc(client, base, headers, "verification_decide", {"_case": case_id})
        return {"case_id": case_id, "decision": decision}


def run_case(case_id: str) -> dict:
    return process_case(case_id)


@app.post("/verify/cases/{case_id}/run")
def run_route(case_id: str, authorization: str | None = Header(default=None)):
    _authorised(authorization)
    for url in URLS.values():
        guard_url(url)
    return run_case(case_id)
