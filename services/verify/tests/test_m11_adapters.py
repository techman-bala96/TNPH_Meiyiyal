import io
import json

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from PIL import Image

from verify.engine import evaluate
from verify.face import InsightFaceMatcher, face_check
from verify.liveness import liveness_check
from verify.ocr import extract_text
from verify.qr import decode_secure_qr, encode_secure_qr_for_tests, load_uidai_key, read_qr
from verify.registry import Registry

PEPPER = "p"
FIELDS = {"reference_id": "123420190101120000000", "name": "Kavitha Raman", "dob": "01-01-1985", "gender": "F",
          "district": "Kanniyakumari", "pincode": "629001", "state": "Tamil Nadu", "vtc": "Nagercoil", "mobile_last4": "4321"}


def _key():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


def _jpeg(color, size=(64, 64), dot=None):
    img = Image.new("RGB", size, color)
    if dot:
        for x in range(dot[0], dot[0] + 12):
            for y in range(dot[1], dot[1] + 12):
                img.putpixel((x, y), (255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, "JPEG")
    return buf.getvalue()


def test_secure_qr_round_trip_with_signature(tmp_path):
    k = _key()
    text = encode_secure_qr_for_tests(k, FIELDS, photo=b"\xff\xd8\xff" + b"photo")
    parsed = decode_secure_qr(text)
    assert parsed["version"] == "V2" and parsed["fields"]["name"] == "Kavitha Raman"
    pem = tmp_path / "uidai.pem"
    pem.write_bytes(k.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo))
    key = load_uidai_key(str(pem))
    ok = read_qr(text, None, PEPPER, key)
    assert ok["status"] == "pass" and ok["evidence"]["last4"] == "1234" and ok["photo"].startswith(b"\xff\xd8\xff")
    assert "123420190101120000000" not in json.dumps(ok["evidence"])


def test_secure_qr_without_cert_is_review_and_wrong_key_is_hard_fail():
    k = _key()
    text = encode_secure_qr_for_tests(k, FIELDS)
    assert read_qr(text, None, PEPPER, None)["evidence"]["reason"] == "uidai_cert_missing"
    bad = read_qr(text, None, PEPPER, _key().public_key())
    assert bad["status"] == "fail" and bad["evidence"]["reason"] == "bad_signature"


def test_secure_qr_v1_and_garbage():
    k = _key()
    v1 = encode_secure_qr_for_tests(k, {k2: v for k2, v in FIELDS.items() if k2 != "mobile_last4"}, v2=False)
    assert decode_secure_qr(v1)["version"] == "V1"
    assert decode_secure_qr("12345") is None
    assert read_qr("hello", None, PEPPER)["evidence"]["reason"] == "unrecognised_qr"


def test_liveness_heuristic_static_motion_and_missing():
    still = _jpeg((90, 90, 90))
    static = liveness_check(["blink", "smile"], {"blink": [still, still], "smile": [still, still]}, window_ok=True, provider="heuristic")
    assert static["status"] == "fail" and static["evidence"]["reason"] == "static_image"
    a, b, c, d = _jpeg((90, 90, 90), dot=(2, 2)), _jpeg((90, 90, 90), dot=(40, 40)), _jpeg((60, 60, 60), dot=(10, 30)), _jpeg((60, 60, 60), dot=(30, 5))
    moving = liveness_check(["blink", "smile"], {"blink": [a, b], "smile": [c, d]}, window_ok=True, provider="heuristic")
    assert moving["status"] == "pass"
    assert liveness_check(["blink"], {"blink": [a]}, window_ok=True)["evidence"]["reason"] == "missing_frames"
    assert liveness_check(["blink"], {"blink": [a, b]}, window_ok=False)["evidence"]["reason"] == "window"
    assert liveness_check([], {}, window_ok=True)["evidence"]["reason"] == "no_challenge"


def test_liveness_vendor_adapter():
    res = liveness_check(["nod"], {"nod": [b"1", b"2"]}, window_ok=True, provider="vendor", vendor=lambda s, f: {"live": True, "score": 0.97})
    assert res["status"] == "pass"
    boom = liveness_check(["nod"], {"nod": [b"1", b"2"]}, window_ok=True, provider="vendor", vendor=lambda s, f: 1 / 0)
    assert boom["evidence"]["reason"] == "vendor_error"


def test_face_providers():
    assert face_check(b"a", b"b", True, provider="none")["evidence"]["reason"] == "no_face_model"
    assert face_check(b"a", b"b", True, provider="mock")["status"] == "pass"
    m = InsightFaceMatcher(embed=lambda img: [1.0, 0.0] if img == b"a" else [0.8, 0.6])
    assert face_check(b"a", b"a", True, provider="insightface", matcher=m)["status"] == "pass"
    low = face_check(b"a", b"z", True, provider="insightface", matcher=InsightFaceMatcher(embed=lambda img: [1.0, 0.0] if img == b"a" else [0.0, 1.0]))
    # orthogonal embeddings = clear mismatch: a soft fail (blocks auto-approve, never an automatic reject)
    assert low["status"] == "fail" and low["evidence"]["reason"] == "mismatch" and low["evidence"]["calibrated"] is False
    mid = face_check(b"a", b"z", True, provider="insightface", matcher=InsightFaceMatcher(embed=lambda img: [1.0, 0.0] if img == b"a" else [0.2, 0.98]))
    assert mid["status"] == "review" and mid["evidence"]["reason"] == "low_similarity"
    none = face_check(b"a", b"z", True, provider="insightface", matcher=InsightFaceMatcher(embed=lambda img: None))
    assert none["evidence"]["reason"].startswith("selfie_")


def test_ocr_adapters():
    assert extract_text(b"%PDF-1.4 (Kavitha Raman) Tj (2012) Tj", provider="none") == ("Kavitha Raman 2012", "pdf")
    text, src = extract_text(b"\xff\xd8\xffjpeg", provider="tesseract", runner=lambda d: b"Kavitha Raman MBBS 2012")
    assert src == "ocr" and "Kavitha" in text
    assert extract_text(None) == ("", "none")


def test_engine_uses_qr_photo_and_ocr_and_static_liveness_hard_fails():
    k = _key()
    qr = encode_secure_qr_for_tests(k, FIELDS, photo=b"\xff\xd8\xffQRPHOTO").encode()
    still = _jpeg((90, 90, 90))
    rules = {"identity": {"weight": 25}, "face": {"weight": 20}, "degree": {"weight": 10}, "name": {"weight": 10},
             "forensics": {"weight": 5}, "duplicates": {"weight": 0}}
    bundle = {"display_name": "Dr. Kavitha Raman", "reg_data": {"reg_year": "2012"}, "rules": rules, "aadhaar_last4": "1234",
              "liveness_steps": ["blink", "smile"], "liveness_window_ok": True}
    files = {"qr": qr, "selfie": _jpeg((10, 10, 10)), "docs": {"degree_cert": _jpeg((1, 2, 3))},
             "live": {"blink": [still, still], "smile": [still, still]}}
    checks = {c["check"]: c for c in evaluate(bundle, files, registry=Registry(lambda r: "", live=False), pepper=PEPPER, qr_public=None,
                                               observe=lambda *a: "ok", face_provider="mock", liveness_provider="heuristic", ocr_provider="tesseract")}
    assert checks["identity"]["status"] == "review"  # no UIDAI cert configured
    assert checks["face"]["status"] == "fail" and checks["face"]["evidence"]["reason"] == "liveness_static"
    assert checks["face"]["evidence"]["reference"] == "qr_photo"
    assert checks["name"]["status"] == "pass"  # QR name vs display name


def test_qr_last4_mismatch_with_otp_is_hard_fail():
    k = _key()
    qr = encode_secure_qr_for_tests(k, FIELDS).encode()
    bundle = {"display_name": "Kavitha Raman", "reg_data": {}, "rules": {}, "aadhaar_last4": "9999"}
    import tempfile

    with tempfile.NamedTemporaryFile(suffix=".pem", delete=False) as f:
        f.write(k.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo))
    key = load_uidai_key(f.name)
    checks = {c["check"]: c for c in evaluate(bundle, {"qr": qr}, registry=Registry(lambda r: "", live=False), pepper=PEPPER, qr_public=None,
                                               observe=lambda *a: "ok", uidai_key=key)}
    assert checks["identity"]["status"] == "fail" and checks["identity"]["evidence"]["reason"] == "last4"
