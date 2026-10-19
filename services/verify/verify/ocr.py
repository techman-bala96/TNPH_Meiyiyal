"""OCR adapter for certificates. OCR_PROVIDER:
- none (default): images give no text; PDFs still give their embedded text.
- tesseract: runs the `tesseract` binary (apt install tesseract-ocr tesseract-ocr-tam), eng+tam.
- mock: tests only; returns OCR_MOCK_TEXT.
"""
from __future__ import annotations

import os
import re
import subprocess


def pdf_text(data: bytes) -> str:
    text = data.decode("latin1", errors="ignore")
    chunks = re.findall(r"\(([^()]{1,200})\)\s*Tj", text)
    return " ".join(chunks) if chunks else text


def extract_text(data: bytes | None, provider: str | None = None, runner=None) -> tuple[str, str]:
    """Return (text, source). source: pdf | ocr | none."""
    if not data:
        return "", "none"
    if data.startswith(b"%PDF"):
        return pdf_text(data), "pdf"
    provider = (provider or os.environ.get("OCR_PROVIDER") or "none").lower()
    if provider == "mock":
        return os.environ.get("OCR_MOCK_TEXT", ""), "ocr"
    if provider == "tesseract":
        run = runner or (lambda d: subprocess.run(["tesseract", "stdin", "stdout", "-l", os.environ.get("OCR_LANGS", "eng+tam")],
                                                    input=d, capture_output=True, timeout=60, check=False).stdout)
        try:
            out = run(data)
        except (OSError, subprocess.TimeoutExpired):
            return "", "none"
        return out.decode("utf-8", errors="ignore"), "ocr"
    return data.decode("latin1", errors="ignore"), "none"
