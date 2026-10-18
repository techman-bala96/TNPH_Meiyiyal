from verify.forensics import forensics_check

CLEAN = b"%PDF-1.4\n1 0 obj<< /Producer (iText)>>endobj\n%%EOF"
CANVA = b"%PDF-1.4\n1 0 obj<< /Producer (Canva)>>endobj\n%%EOF"
PHOTOSHOP = b"\xff\xd8\xff\xe1\x00\x20Exif\x00\x00Software\x00Photoshop\xff\xd9"
GIMP = b"\x89PNG\r\n\x1a\n" + b"Software\x00GIMP 2.10" + b"\x00" * 8


def test_clean_pdf_passes_and_records_hash():
    result = forensics_check(CLEAN)
    assert result["status"] == "pass"
    assert result["evidence"]["kind"] == "pdf"
    assert len(result["evidence"]["sha256"]) == 64


def test_editors_are_review():
    assert forensics_check(CANVA)["evidence"]["reason"] == "editor_software"
    assert forensics_check(PHOTOSHOP)["status"] == "review"
    assert forensics_check(GIMP)["evidence"]["reason"] == "editor_software"


def test_missing_and_unknown():
    assert forensics_check(None)["evidence"]["reason"] == "missing_file"
    assert forensics_check(b"not a document")["evidence"]["reason"] == "unknown_type"
