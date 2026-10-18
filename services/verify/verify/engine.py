"""Run one case from a bundle. No network unless a live Registry is passed in."""
from __future__ import annotations

from .duplicates import duplicate_check
from .face import face_check
from .forensics import forensics_check
from .names import name_status
from .qr import read_qr
from .registry import Registry

_DOC_PREFERENCE = ("degree_cert", "enrolment_cert", "council_cert", "experience_letter", "licence_cert")


def _check(name: str, result: dict, provider: str | None = None) -> dict:
    return {"check": name, "provider": provider, "status": result["status"], "score": result.get("score"), "evidence": result.get("evidence") or {}}


def _reg_value(reg: dict, field: str) -> str:
    return str(reg.get(field) or "").strip()


def _fingerprint_reg(reg: dict) -> str:
    raw = reg.get("reg_no") or reg.get("enrolment_no") or reg.get("coa_no") or ""
    return str(raw).strip().lower()


def _doc_bytes(files: dict) -> bytes | None:
    docs = files.get("docs") or {}
    for key in _DOC_PREFERENCE:
        if docs.get(key):
            return docs[key]
    for blob in docs.values():
        if blob:
            return blob
    return None


def _year_ok(reg: dict, blob: bytes) -> bool:
    year = str(reg.get("reg_year") or reg.get("enrolment_date") or "")
    year = year[:4]
    if not year.isdigit():
        return True
    text = blob.decode("latin1", errors="ignore")
    return year in text


def _name_in_doc(display: str, blob: bytes) -> bool:
    text = blob.decode("latin1", errors="ignore")
    status, _ = name_status(display, text, 0.80, 0.0)
    if status == "pass":
        return True
    folded_tokens = [t for t in display.replace(".", " ").split() if len(t) > 2]
    low = text.lower()
    return bool(folded_tokens) and all(t.lower() in low for t in folded_tokens[:2])


def evaluate(bundle: dict, files: dict, *, registry: Registry, pepper: str, qr_public, observe, name_pass: float = 0.92, name_review: float = 0.80) -> list[dict]:
    reg = bundle.get("reg_data") or {}
    rules = bundle.get("rules") or {}
    display = str(bundle.get("display_name") or "")
    checks: list[dict] = []

    qr = read_qr((files.get("qr") or b"").decode("utf-8", errors="ignore"), qr_public, pepper)
    last4 = (qr.get("evidence") or {}).get("last4")
    known = bundle.get("aadhaar_last4")
    if qr["status"] == "pass" and known and last4 and str(known) != str(last4):
        qr = {"status": "fail", "score": 0, "evidence": {"hard": "true", "reason": "last4"}}
    if not files.get("qr"):
        qr = {"status": "review", "score": None, "evidence": {"reason": "missing_qr"}}
    checks.append(_check("identity", qr, "qr"))

    portrait = files.get("portrait") or files.get("selfie")
    checks.append(_check("face", face_check(files.get("selfie"), portrait, bool(bundle.get("liveness_ok")))))

    doc = _doc_bytes(files)
    forensic = forensics_check(doc)
    checks.append(_check("forensics", forensic))
    if not doc:
        degree = {"status": "review", "score": None, "evidence": {"reason": "missing_file"}}
    elif forensic["status"] != "pass":
        degree = {"status": "review", "score": forensic.get("score"), "evidence": {"reason": forensic["evidence"].get("reason", "forensics")}}
    elif not _name_in_doc(display, doc) or not _year_ok(reg, doc):
        degree = {"status": "review", "score": 0.5, "evidence": {"reason": "no_text_or_year"}}
    else:
        degree = {"status": "pass", "score": 1, "evidence": {"reason": "file_name_year"}}
    checks.append(_check("degree", degree))

    qr_name = (qr.get("evidence") or {}).get("name") or ""
    if qr_name:
        status, score = name_status(display, qr_name, name_pass, name_review)
        name = {"status": status, "score": score, "evidence": {"reason": "qr_name"}}
    elif doc and _name_in_doc(display, doc):
        name = {"status": "pass", "score": 1, "evidence": {"reason": "certificate_name"}}
    else:
        name = {"status": "review", "score": None, "evidence": {"reason": "no_name_source"}}
    checks.append(_check("name", name))

    reg_rule = rules.get("registry")
    if reg_rule:
        params = reg_rule.get("params") or {}
        provider = params.get("provider") or "none"
        field = params.get("reg_field") or "reg_no"
        filled = bool(_reg_value(reg, field))
        required = bool(reg_rule.get("required", True))
        if provider not in ("none", "") and (required or filled):
            chain = params.get("providers") or [provider]
            number = _reg_value(reg, field)
            result = registry.lookup_chain(list(chain), number, display)
            checks.append(_check("registry", result, provider))

    observed: list[str] = []
    fp = _fingerprint_reg(reg)
    if fp:
        observed.append(observe("reg_no", fp))
    hmac_value = (qr.get("evidence") or {}).get("hmac")
    if qr.get("status") == "pass" and hmac_value:
        observed.append(observe("aadhaar", hmac_value))
    if not observed:
        observed.append("ok")
    checks.append(_check("duplicates", duplicate_check(observed)))
    return checks
