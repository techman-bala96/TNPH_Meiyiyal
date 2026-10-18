from verify.face import face_check


def _sample():
    return bytes([i % 256 for i in range(256)])


def test_same_bytes_pass():
    raw = _sample()
    result = face_check(raw, raw, True)
    assert result["status"] == "pass"


def test_no_reference_or_liveness_is_review():
    raw = _sample()
    assert face_check(raw, None, True)["status"] == "review"
    assert face_check(None, raw, True)["evidence"]["reason"] == "no_reference"
    assert face_check(raw, raw, False)["evidence"]["reason"] == "liveness"


def test_mid_distance_reviews_and_far_fails():
    raw = bytearray(_sample())
    mid = bytearray(raw)
    for i in range(40):
        mid[i] = (mid[i] + 80) % 256
    reviewed = face_check(bytes(raw), bytes(mid), True)
    assert reviewed["status"] == "review"
    assert reviewed["evidence"]["hamming"] == 12
    far = bytes([255 - b for b in raw])
    failed = face_check(bytes(raw), far, True)
    assert failed["status"] == "fail"
    assert failed["evidence"]["hard"] == "true"
