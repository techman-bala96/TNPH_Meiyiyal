"""Build e2e verification fixtures into .cache/verify-fixtures/ (never committed).

Run with the verify service venv:  services/verify/.venv/bin/python scripts/verify-fixtures.py
- a throw-away "UIDAI" key pair + self-signed cert (the verify service gets UIDAI_QR_CERT_PATH = this cert,
  so the real Secure-QR signature code runs; only the key differs from production)
- Secure QR payloads for each scenario, rendered to PNG by scripts/qr-png.mjs
- faces cropped from insightface's own test photo (data/images/t1.jpg, shipped for face-detection tests)
- camera videos (.y4m) for Chrome's fake camera: moving face A, moving face B, two faces, a still photo of A
- council register fixture (reg no → html / timeout / error)
"""
from __future__ import annotations

import datetime as dt
import io
import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "services", "verify"))
from cryptography import x509  # noqa: E402
from cryptography.hazmat.primitives import hashes, serialization  # noqa: E402
from cryptography.hazmat.primitives.asymmetric import rsa  # noqa: E402
from cryptography.x509.oid import NameOID  # noqa: E402
from PIL import Image, ImageOps  # noqa: E402

from verify.qr import encode_secure_qr_for_tests  # noqa: E402

OUT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".cache", "verify-fixtures"))
os.makedirs(OUT, exist_ok=True)

# ---- keys
key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
other = rsa.generate_private_key(public_exponent=65537, key_size=2048)  # a forger's key
name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "TEST ONLY - not UIDAI")])
now = dt.datetime.now(dt.timezone.utc)
cert = (x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key()).serial_number(1)
        .not_valid_before(now - dt.timedelta(days=1)).not_valid_after(now + dt.timedelta(days=30)).sign(key, hashes.SHA256()))
open(os.path.join(OUT, "test-uidai-cert.pem"), "wb").write(cert.public_bytes(serialization.Encoding.PEM))

# ---- faces
import insightface  # noqa: E402

src = Image.open(os.path.join(os.path.dirname(insightface.__file__), "data", "images", "t1.jpg")).convert("RGB")
def crop(b, grow=2.2):
    x0, y0, x1, y1 = b; cx, cy = (x0 + x1) / 2, (y0 + y1) / 2; s = max(x1 - x0, y1 - y0) * grow / 2
    return src.crop((int(cx - s), int(cy - s * 1.1), int(cx + s), int(cy + s * 1.15)))
faces = {"a": crop((466, 268, 573, 415)), "b": crop((268, 145, 372, 267))}
for k, im in faces.items():
    im.resize((480, 520)).save(os.path.join(OUT, f"face-{k}.jpg"), quality=92)
src.resize((960, 664)).save(os.path.join(OUT, "face-multi.jpg"), quality=90)

def tiny(im):  # QR photos are tiny and lossy, like the real ones
    b = io.BytesIO(); ImageOps.grayscale(im).resize((60, 72)).save(b, "JPEG", quality=40); return b.getvalue()

# ---- Secure QR payloads (last 4 of the Aadhaar number typed in the wizard = 1098)
def fields(nm, last4="1098", dob="15-06-1985", gender="M"):
    return {"reference_id": f"{last4}20261018093015123", "name": nm, "dob": dob, "gender": gender, "care_of": "S/O Raman",
            "district": "Chennai", "house": "12", "location": "Mylapore", "pincode": "600004", "post_office": "Mylapore",
            "state": "Tamil Nadu", "street": "North Mada St", "sub_district": "Mylapore", "vtc": "Chennai", "mobile_last4": "3210"}
payloads = {
    "valid-a": encode_secure_qr_for_tests(key, fields("Arun Kumar"), tiny(faces["a"])),
    "valid-a-initials": encode_secure_qr_for_tests(key, fields("R Arun Kumar"), tiny(faces["a"])),
    "valid-a-other-name": encode_secure_qr_for_tests(key, fields("Venkatesh Prabhu"), tiny(faces["a"])),
    "other-person": encode_secure_qr_for_tests(key, fields("Arun Kumar", last4="4321"), tiny(faces["a"])),
    "forged": encode_secure_qr_for_tests(other, fields("Arun Kumar"), tiny(faces["a"])),
    "dup-identity": encode_secure_qr_for_tests(key, fields("Senthil Nathan", dob="01-01-1980"), tiny(faces["b"])),
}
# tampered: flip the name inside a validly signed payload (decimal → bytes → edit → back)
import zlib  # noqa: E402
raw = int(payloads["valid-a"]).to_bytes((int(payloads["valid-a"]).bit_length() + 7) // 8, "big")
data = bytearray(zlib.decompress(raw)); i = data.find(b"Arun Kumar"); data[i:i + 4] = b"Arjn"
payloads["tampered"] = str(int.from_bytes(zlib.compress(bytes(data)), "big"))
json.dump(payloads, open(os.path.join(OUT, "qr-payloads.json"), "w"))

# ---- camera videos for Chrome --use-file-for-fake-video-capture
def video(name, img, motion=True):
    p = os.path.join(OUT, f"{name}.y4m"); src_img = os.path.join(OUT, f"{name}.png")
    ImageOps.pad(img.convert("RGB"), (640, 480), color=(235, 235, 235)).save(src_img)
    vf = "rotate='0.12*sin(2*PI*t*1.3)':fillcolor=0xebebeb,scale=640:480,format=yuv420p" if motion else "scale=640:480,format=yuv420p"
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-loop", "1", "-i", src_img, "-vf", vf, "-t", "8", "-r", "15", p], check=True)
video("cam-a", faces["a"]); video("cam-b", faces["b"]); video("cam-multi", src); video("cam-still-a", faces["a"], motion=False)

# ---- council register (tnmc / nmc / bctnpy share one fixture; numbers are unique per scenario)
row = lambda no, nm, status="Active": f"<tr><td>{no}</td><td>{nm}</td><td>MBBS</td><td>{status}</td></tr>\n"
council = {
    "TNMC 70001": {"html": "<table>\n" + row("TNMC 70001", "Dr. Arun Kumar") + "</table>"},
    "TNMC 70002": {"html": "<table>\n" + row("TNMC 70002", "Dr. Arun Kumar", "Suspended till 2027") + "</table>"},
    "TNMC 70004": {"timeout": True},
    "TNMC 70005": {"html": "<table>\n" + row("TNMC 70005", "Dr. Lakshmi Narayanan") + "</table>"},
    "TNMC 70006": {"error": True},
    "MS/7001/2016": {"html": "<table>\n" + row("MS/7001/2016", "Adv. Arun Kumar") + "</table>"},
}
json.dump(council, open(os.path.join(OUT, "council.json"), "w"))
print(json.dumps({k: len(v) for k, v in payloads.items()}))

# ---- certificates (PDF text is read without OCR; an edited one names Photoshop as producer)
def pdf(lines, producer="Tamil Nadu Dr. M.G.R. Medical University"):
    body = " ".join(f"({t}) Tj" for t in lines)
    stream = f"BT /F1 14 Tf 72 720 Td {body} ET".encode("latin-1")
    objs = [b"<< /Type /Catalog /Pages 2 0 R >>", b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
            b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
            b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", f"<< /Producer ({producer}) >>".encode("latin-1")]
    out, offs = bytearray(b"%PDF-1.4\n"), []
    for i, o in enumerate(objs, 1):
        offs.append(len(out)); out += f"{i} 0 obj\n".encode() + o + b"\nendobj\n"
    x = len(out); out += f"xref\n0 {len(objs)+1}\n0000000000 65535 f \n".encode() + b"".join(f"{o:010d} 00000 n \n".encode() for o in offs)
    out += f"trailer << /Size {len(objs)+1} /Root 1 0 R /Info 6 0 R >>\nstartxref\n{x}\n%%EOF\n".encode()
    return bytes(out)
open(os.path.join(OUT, "cert-arun.pdf"), "wb").write(pdf(["Degree certificate", "Dr. Arun Kumar", "Bachelor of Medicine MBBS", "2012"]))
open(os.path.join(OUT, "cert-edited.pdf"), "wb").write(pdf(["Degree certificate", "Dr. Arun Kumar", "MBBS", "2012"], producer="Adobe Photoshop 25.0"))
open(os.path.join(OUT, "cert-other.pdf"), "wb").write(pdf(["Degree certificate", "Dr. Lakshmi Narayanan", "MBBS", "2003"]))
open(os.path.join(OUT, "cert-law.pdf"), "wb").write(pdf(["Bar Council of Tamil Nadu and Puducherry", "Adv. Arun Kumar", "Enrolment", "2016"]))
open(os.path.join(OUT, "cert-eng.pdf"), "wb").write(pdf(["Anna University", "Er. Arun Kumar", "Bachelor of Engineering Civil", "2014"]))
from PIL import ImageFilter  # noqa: E402
Image.new("RGB", (900, 640), (250, 248, 240)).filter(ImageFilter.GaussianBlur(8)).save(os.path.join(OUT, "cert-blurry.jpg"), quality=30)
open(os.path.join(OUT, "notes.txt"), "w").write("not a certificate")
with open(os.path.join(OUT, "huge.pdf"), "wb") as f:
    f.write(b"%PDF-1.4\n" + os.urandom(11 * 1024 * 1024))
