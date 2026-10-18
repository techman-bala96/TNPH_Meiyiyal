"""Run one case from a bundle. No network unless a live Registry is passed in."""
from __future__ import annotations

from .duplicates import duplicate_check
from .face import face_check
from .forensics import forensics_check
from .liveness import liveness_check
from .names import name_status
from .ocr import extract_text
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


def _year_ok(reg: dict, text: str) -> bool:
    year = str(reg.get("reg_year") or reg.get("enrolment_date") or "")
    year = year[:4]
    if not year.isdigit():
        return True
    return year in text


def _name_in_doc(display: str, text: str) -> bool:
    status, _ = name_status(display, text, 0.80, 0.0)
    if status == "pass":
        return True
    folded_tokens = [t for t in display.replace(".", " ").split() if len(t) > 2]
    low = text.lower()
    return bool(folded_tokens) and all(t.lower() in low for t in folded_tokens[:2])


def evaluate(bundle: dict, files: dict, *, registry: Registry, pepper: str, qr_public, observe, name_pass: float = 0.92, name_review: float = 0.80,
             uidai_key=None, face_provider: str | None = None, liveness_provider: str | None = None, ocr_provider: str | None = None) -> list[dict]:
    reg = bundle.get("reg_data") or {}
    rules = bundle.get("rules") or {}
    display = str(bundle.get("display_name") or "")
    checks: list[dict] = []

    qr = read_qr((files.get("qr") or b"").decode("utf-8", errors="ignore"), qr_public, pepper, uidai_key)
    qr_photo = qr.pop("photo", None)
    last4 = (qr.get("evidence") or {}).get("last4")
    known = bundle.get("aadhaar_last4")
    if qr["status"] == "pass" and known and last4 and str(known) != str(last4):
        qr = {"status": "fail", "score": 0, "evidence": {"hard": "true", "reason": "last4"}}
    if not files.get("qr"):
        qr = {"status": "review", "score": None, "evidence": {"reason": "missing_qr"}}
    checks.append(_check("identity", qr, "qr"))

    # Liveness from the challenge frames (server decides; the app only uploads them).
    steps = list(bundle.get("liveness_steps") or [])
    live_frames = files.get("live") or {}
    if steps or live_frames:
        live = liveness_check(steps, live_frames, window_ok=bool(bundle.get("liveness_window_ok")), provider=liveness_provider)
    else:
        legacy = bool(bundle.get("liveness_ok"))
        live = {"status": "review", "score": None, "evidence": {"reason": "no_frames", "legacy_flag": legacy}}
    liveness_ok = live["status"] == "pass"
    # Probe = the selfie. Reference = the Aadhaar QR photo when the payload carries one we can read,
    # else the last live frame (proves the person on camera is the person in the public portrait).
    probe = files.get("selfie") or files.get("portrait")
    reference, ref_kind = None, None
    if qr_photo and qr_photo[:3] == b"\xff\xd8\xff":
        reference, ref_kind = qr_photo, "qr_photo"
    elif live_frames:
        last_step = steps[-1] if steps else next(iter(live_frames))
        seq = live_frames.get(last_step) or []
        if seq:
            reference, ref_kind = seq[-1], "live_frame"
    if reference is None:
        reference, ref_kind = files.get("portrait"), "portrait"
    face = face_check(probe, reference, liveness_ok, provider=face_provider)
    face["evidence"] = {**(face.get("evidence") or {}), "reference": ref_kind, "liveness": live["status"],
                        "liveness_reason": (live.get("evidence") or {}).get("reason")}
    if live["status"] == "fail" and face["status"] != "fail":
        face = {"status": "fail", "score": 0, "evidence": {**face["evidence"], "hard": "true", "reason": "liveness_static"}}
    checks.append(_check("face", face, face["evidence"].get("provider")))

    doc = _doc_bytes(files)
    doc_text, text_source = extract_text(doc, provider=ocr_provider)
    forensic = forensics_check(doc)
    checks.append(_check("forensics", forensic))
    if not doc:
        degree = {"status": "review", "score": None, "evidence": {"reason": "missing_file"}}
    elif forensic["status"] != "pass":
        degree = {"status": "review", "score": forensic.get("score"), "evidence": {"reason": forensic["evidence"].get("reason", "forensics")}}
    elif not _name_in_doc(display, doc_text) or not _year_ok(reg, doc_text):
        degree = {"status": "review", "score": 0.5, "evidence": {"reason": "no_text_or_year", "text_source": text_source}}
    else:
        degree = {"status": "pass", "score": 1, "evidence": {"reason": "file_name_year", "text_source": text_source}}
    checks.append(_check("degree", degree))

    qr_name = (qr.get("evidence") or {}).get("name") or ""
    if qr_name:
        status, score = name_status(display, qr_name, name_pass, name_review)
        name = {"status": status, "score": score, "evidence": {"reason": "qr_name"}}
    elif doc and _name_in_doc(display, doc_text):
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
