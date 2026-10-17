"""Vocabulary the parser works from: taxonomy (EN/TA names + spoken synonyms), districts and areas, all loaded from the DB."""
from __future__ import annotations

import json
import os
import re
import time
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

import httpx

TAMIL = re.compile(r"[\u0B80-\u0BFF]")
PULLI = "\u0bcd"


def has_tamil(s: str) -> bool:
    return bool(TAMIL.search(s))


def norm(s: str) -> str:
    s = unicodedata.normalize("NFC", s or "").lower()
    s = re.sub(r"[\u200b-\u200d]", "", s)
    s = re.sub(r"[,.!?;:\"'’‘“”()\[\]{}/\\|-]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def ta_stem(p: str) -> str:
    """Tamil is agglutinative: மருத்துவர் + ஐ -> மருத்துவரை. Matching on the stem without the final pulli tolerates case suffixes."""
    return p[:-1] if p.endswith(PULLI) else p


@dataclass
class Node:
    slug: str
    parent: str | None
    name: dict
    synonyms: list[str]
    sort: int = 0
    children: list[str] = field(default_factory=list)

    @property
    def depth(self) -> int:
        return self.slug.count("--") + 1


@dataclass
class Area:
    name: str
    name_ta: str | None
    district: str
    lat: float
    lng: float


@dataclass
class Phrase:
    text: str          # normalised phrase
    kind: str          # node | district | area
    ref: str | int     # slug or area index
    tamil: bool


class Lexicon:
    def __init__(self, data: dict):
        self.nodes: dict[str, Node] = {}
        for n in data["nodes"]:
            self.nodes[n["slug"]] = Node(n["slug"], n.get("parent_slug"), n["name_i18n"], n.get("synonyms") or [], n.get("sort") or 0)
        for n in self.nodes.values():
            if n.parent in self.nodes:
                self.nodes[n.parent].children.append(n.slug)
        for n in self.nodes.values():
            n.children.sort(key=lambda s: (self.nodes[s].sort, s))
        self.districts: dict[str, dict] = {d["slug"]: d["name_i18n"] for d in data["districts"]}
        self.areas: list[Area] = [Area(a["name"], a.get("name_ta"), a["district_slug"], a["lat"], a["lng"]) for a in data["areas"] if a.get("lat") is not None]
        self.phrases = self._build()

    # ---- phrase index (longest first so "child doctor" beats "doctor")
    def _build(self) -> list[Phrase]:
        out: dict[tuple[str, str], Phrase] = {}

        def add(text: str, kind: str, ref):
            t = norm(text)
            if len(t) < 2 or (not has_tamil(t) and len(t) < 3 and t not in {"gp", "ev", "it"}):
                return
            key = (t, kind if kind != "area" else f"area:{ref}")
            out.setdefault(key, Phrase(t, kind, ref, has_tamil(t)))

        for n in self.nodes.values():
            if n.depth < 2:  # skip the root group ("Professionals")
                continue
            for v in (n.name.get("en"), n.name.get("ta"), *n.synonyms):
                if v:
                    add(v, "node", n.slug)
                    # "Family & Divorce" also spoken as "family divorce"
                    if "&" in v:
                        add(v.replace("&", " "), "node", n.slug)
                        for part in v.split("&"):
                            if len(part.strip()) > 3:
                                add(part, "node", n.slug)
        for slug, nm in self.districts.items():
            for v in (nm.get("en"), nm.get("ta")):
                if v:
                    add(v, "district", slug)
        for i, a in enumerate(self.areas):
            for v in (a.name, a.name_ta):
                if v and len(v) >= 4:
                    add(v, "area", i)
        return sorted(out.values(), key=lambda p: -len(p.text))

    def name(self, slug: str, lang: str = "en") -> str:
        n = self.nodes.get(slug)
        if not n:
            return slug
        return (n.name.get("ta") if lang == "ta" else None) or n.name.get("en") or slug

    def label(self, slug: str) -> dict:
        n = self.nodes[slug]
        return {"en": n.name.get("en"), "ta": n.name.get("ta") or n.name.get("en")}

    def is_ancestor(self, a: str, b: str) -> bool:
        return b.startswith(a + "--")

    def categories(self) -> list[str]:
        root = [s for s, n in self.nodes.items() if n.depth == 1]
        return [c for r in root for c in self.nodes[r].children]


# ---------------- loading ----------------
def fetch_from_supabase(url: str, key: str) -> dict:
    h = {"apikey": key, "Authorization": f"Bearer {key}"}
    with httpx.Client(base_url=url.rstrip("/") + "/rest/v1", headers=h, timeout=10) as c:
        def get(path: str):
            r = c.get(path)
            r.raise_for_status()
            return r.json()
        return {
            "nodes": get("/taxonomy_nodes?select=slug,parent_slug,name_i18n,synonyms,sort&is_active=eq.true"),
            "districts": get("/tn_districts?select=slug,name_i18n"),
            "areas": get("/tn_areas?select=name,name_ta,district_slug,lat,lng"),
        }


class LexiconStore:
    """Caches the lexicon; refreshes from the DB every `ttl` seconds so admin edits (new synonyms/categories) apply without redeploy."""

    def __init__(self, ttl: int = 600):
        self.ttl = ttl
        self._lex: Lexicon | None = None
        self._at = 0.0

    def get(self) -> Lexicon:
        if self._lex is None or time.time() - self._at > self.ttl:
            self._lex = Lexicon(self._load())
            self._at = time.time()
        return self._lex

    def _load(self) -> dict:
        fixture = os.environ.get("AGENT_LEXICON_FILE")
        if fixture:
            return json.loads(Path(fixture).read_text("utf-8"))
        url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_ANON_KEY")
        if url and key:
            try:
                return fetch_from_supabase(url, key)
            except httpx.HTTPError:
                if self._lex is None:
                    raise
        return json.loads((Path(__file__).parent.parent / "tests/fixtures/lexicon.json").read_text("utf-8"))


if __name__ == "__main__":  # python -m agent.lexicon > tests/fixtures/lexicon.json
    import sys
    data = fetch_from_supabase(os.environ.get("SUPABASE_URL", "http://127.0.0.1:54321"), os.environ["SUPABASE_ANON_KEY"])
    json.dump(data, sys.stdout, ensure_ascii=False, indent=1)
