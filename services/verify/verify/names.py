"""Name similarity. Tamil is transliterated with a fixed letter map, then folded so
common English spellings (Kavitha / கவிதா) land on the same string."""
from __future__ import annotations

import re
import unicodedata
from difflib import SequenceMatcher

_VOWELS = {
    "அ": "a", "ஆ": "aa", "இ": "i", "ஈ": "ii", "உ": "u", "ஊ": "uu",
    "எ": "e", "ஏ": "ee", "ஐ": "ai", "ஒ": "o", "ஓ": "oo", "ஔ": "au", "ஃ": "",
}
_CONS = {
    "க": "k", "ங": "ng", "ச": "s", "ஜ": "j", "ஞ": "ny", "ட": "t", "ண": "n",
    "த": "t", "ந": "n", "ப": "p", "ம": "m", "ய": "y", "ர": "r", "ல": "l",
    "வ": "v", "ழ": "zh", "ள": "l", "ற": "r", "ன": "n", "ஷ": "sh", "ஸ": "s", "ஹ": "h",
}
_SIGNS = {
    "ா": "aa", "ி": "i", "ீ": "ii", "ு": "u", "ூ": "uu", "ெ": "e", "ே": "ee",
    "ை": "ai", "ொ": "o", "ோ": "oo", "ௌ": "au", "்": "",
}
_HONOR = {"dr", "doctor", "adv", "advocate", "er", "engineer", "mr", "mrs", "ms"}
_FOLDS = (
    ("aa", "a"), ("ii", "i"), ("ee", "e"), ("oo", "o"), ("uu", "u"),
    ("zh", "l"), ("sh", "s"), ("ch", "c"), ("th", "t"), ("dh", "d"),
    ("bh", "b"), ("ph", "p"), ("kh", "k"), ("gh", "g"),
)


def translit(text: str) -> str:
    out: list[str] = []
    i, n = 0, len(text)
    while i < n:
        ch = text[i]
        if ch in _CONS:
            vowel = "a"
            if i + 1 < n and text[i + 1] in _SIGNS:
                vowel = _SIGNS[text[i + 1]]
                i += 1
            out.append(_CONS[ch] + vowel)
        elif ch in _VOWELS:
            out.append(_VOWELS[ch])
        elif ch.isspace():
            out.append(" ")
        else:
            out.append(ch)
        i += 1
    return "".join(out)


def fold(text: str) -> str:
    s = translit(unicodedata.normalize("NFC", text or ""))
    s = s.lower()
    s = re.sub(r"[^a-z\s]", " ", s)
    for a, b in _FOLDS:
        s = s.replace(a, b)
    tokens = [t for t in s.split() if t not in _HONOR]
    return " ".join(tokens)


def name_score(a: str, b: str) -> float:
    fa, fb = fold(a), fold(b)
    if not fa or not fb:
        return 0.0
    if fa == fb:
        return 1.0
    sa, sb = " ".join(sorted(fa.split())), " ".join(sorted(fb.split()))
    return max(SequenceMatcher(None, fa, fb).ratio(), SequenceMatcher(None, sa, sb).ratio())


def name_status(a: str, b: str, pass_at: float = 0.92, review_at: float = 0.80) -> tuple[str, float]:
    score = name_score(a, b)
    if score >= pass_at:
        return "pass", score
    if score >= review_at:
        return "review", score
    return "fail", score
