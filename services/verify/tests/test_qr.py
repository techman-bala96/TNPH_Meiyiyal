import json

from cryptography.hazmat.primitives.asymmetric import rsa

from verify.qr import hmac_uid, read_qr, sign_myqr

PEPPER = "test-pepper"
UID = "999900001234"


def _keys():
    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    return private, private.public_key()


def _token(private, uid=UID, name="Kavitha Raman"):
    payload = json.dumps({"uid": uid, "name": name}).encode()
    return sign_myqr(private, payload)


def test_valid_signature_returns_last4_and_hmac_only():
    private, public = _keys()
    result = read_qr(_token(private), public, PEPPER)
    assert result["status"] == "pass"
    assert result["evidence"]["last4"] == "1234"
    assert result["evidence"]["hmac"] == hmac_uid(UID, PEPPER)
    assert UID not in str(result["evidence"])
    assert "uid" not in result["evidence"]


def test_tampered_payload_fails():
    private, public = _keys()
    token = _token(private)
    head, payload, sig = token.split(".")
    flipped = ("A" if payload[0] != "A" else "B") + payload[1:]
    result = read_qr(f"{head}.{flipped}.{sig}", public, PEPPER)
    assert result["status"] == "fail"
    assert result["evidence"]["reason"] == "bad_signature"
    assert result["evidence"]["hard"] == "true"


def test_unrecognised_qr_is_review():
    _, public = _keys()
    xml = "<?xml version='1.0'?><PrintLetterBarcodeData uid='999900001234'/>"
    assert read_qr(xml, public, PEPPER)["status"] == "review"
    assert read_qr("", public, PEPPER)["status"] == "review"
    assert read_qr("MYQR1.only", None, PEPPER)["status"] == "review"


def test_bad_uid_fails():
    private, public = _keys()
    token = _token(private, uid="000000000000")
    result = read_qr(token, public, PEPPER)
    assert result["status"] == "fail"
    assert result["evidence"]["reason"] == "bad_uid"
