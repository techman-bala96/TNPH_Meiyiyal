"""Deterministic grammar for Meiyiyal voice commands (EN / Tamil / Tanglish).

parse(text, lex, lang, pending, context) -> dict (see README). Asks a follow-up question whenever
the profession is missing, too broad, ambiguous, or the place is ambiguous; never guesses.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from .lexicon import Lexicon, has_tamil, norm, ta_stem

# ---------------- grammar word lists (language, not data) ----------------
EXCL_PREFIX = ["other than", "except for", "apart from", "but not", "excluding", "except", "exclude", "without", "not", "no", "skip", "avoid"]
EXCL_SUFFIX_TA = ["தவிர", "தவிர்த்து", "வேண்டாம்", "வேணாம்", "வேண்டா", "இல்லாமல்", "இல்லாம", "thavira", "venaam", "venam", "vendam", "vendaam", "illama", "illaama"]
CLAUSE_SPLIT = re.compile(r"\s+(?:and|but|also|plus|then|aana|ana|apram|மற்றும்|ஆனா|ஆனால்|அப்புறம்)\s+|\s*,\s*")
ONLINE = ["available right now", "available now", "right now", "active now", "online", "ஆன்லைன்", "இப்போது", "இப்போ", "இப்ப", "ippo", "ipo", "ippove", "available"]
SHOW_ALL = ["all over tamil nadu", "all tamil nadu", "whole tamil nadu", "across tamil nadu", "entire tamil nadu", "anywhere", "show all", "show everyone", "everyone",
            "all of them", "everywhere", "தமிழ்நாடு முழுவதும்", "தமிழ்நாடு முழுக்க", "எல்லா இடத்திலும்", "எல்லா இடத்துலயும்", "எங்கு இருந்தாலும்", "எல்லாரையும்",
            "ella edathulayum", "ellaraiyum", "tamil nadu fulla", "tamilnadu fulla", "tamil nadu muzhuvadhum"]
SORT = {
    "rating": ["highest rated", "best rated", "top rated", "top rating", "good rating", "high rating", "best", "top", "rating", "சிறந்த", "நல்ல ரேட்டிங்", "அதிக ரேட்டிங்", "nalla", "best-ah", "top-la"],
    "experience": ["most experienced", "more experience", "experienced", "experience", "senior", "அனுபவமுள்ள", "அனுபவம்", "அனுபவசாலி", "anubavam", "anubavasaali", "experience-ana"],
    "distance": ["nearest", "closest", "near me", "nearby", "near by", "close to me", "அருகில்", "அருகாமையில்", "பக்கத்தில்", "பக்கத்துல", "கிட்ட", "pakkathula", "pakkathil", "kitta", "kittathula"],
}
KM = re.compile(r"(?:within|inside|under|less than|\b)\s*(\d{1,3})\s*(?:km|kms|kilometers?|kilometres?|கிமீ|கி\s?மீ|கிலோமீட்டர்|kilo meter|kilo)")
STOP = {"stop", "stop listening", "cancel", "turn off", "mic off", "நிறுத்து", "நிறுத்துங்க", "போதும்", "niruthu", "podhum", "close"}
BACK = {"go back", "back", "previous", "பின்னால்", "பின்னே போ", "back po"}
HELP = {"help", "what can you do", "உதவி", "help me"}
ANY = ["any", "anyone", "anything", "any one", "doesn't matter", "dont care", "don't care", "all", "எதுவானாலும்", "யாராவது", "எதுவும்", "எல்லாம்", "ethuvanaalum", "yaaravathu", "edhuvaanalum"]
ORDINALS = [("first", "1", "one", "முதல்", "முதலாவது", "ஒன்று", "ஒண்ணு", "mudhal", "onnu"), ("second", "2", "two", "இரண்டாவது", "இரண்டு", "ரெண்டு", "rendu"),
            ("third", "3", "three", "மூன்றாவது", "மூன்று", "மூணு", "moonu"), ("fourth", "4", "four", "நான்காவது", "நாலு", "naalu"), ("fifth", "5", "five", "ஐந்தாவது", "அஞ்சு", "anju")]
FILLER = {"dr", "doctor", "adv", "advocate", "er", "the", "a", "an", "please", "show", "me", "find", "need", "want", "i", "ones", "one", "who", "is", "are", "those", "with",
          "named", "called", "mr", "mrs", "ms", "sir", "madam", "எனக்கு", "வேணும்", "வேண்டும்", "காட்டு", "காட்டுங்க", "யார்", "அவர்", "அவங்க", "doctor-ah", "ah", "la", "le", "ku"}
LEGAL_RANKING_NOTE = {"en": "Advocates can't be ranked by rating (Bar Council rules), so I'm showing them by distance.",
                      "ta": "வழக்கறிஞர்களை மதிப்பீட்டின்படி வரிசைப்படுத்த முடியாது (பார் கவுன்சில் விதி). தூரத்தின்படி காட்டுகிறேன்."}


def _has(text: str, phrase: str) -> tuple[int, int] | None:
    p = norm(phrase)
    if has_tamil(p):
        i = text.find(ta_stem(p))
        return (i, i + len(ta_stem(p))) if i >= 0 else None
    m = re.search(r"(?<![\w])" + re.escape(p) + r"(?:s|es)?(?![\w])", text)
    return m.span() if m else None


def _any(text: str, words) -> bool:
    return any(_has(text, w) for w in words)


@dataclass
class Found:
    nodes: list[str] = field(default_factory=list)
    districts: list[str] = field(default_factory=list)
    areas: list[int] = field(default_factory=list)
    residual: str = ""


def _scan(text: str, lex: Lexicon) -> Found:
    """Greedy longest-phrase scan; consumed spans are blanked so a short phrase never re-matches inside a longer one."""
    f = Found(); work = text
    for ph in lex.phrases:
        while True:
            span = _has(work, ph.text)
            if not span:
                break
            a, b = span
            work = work[:a] + " " * (b - a) + work[b:]
            if ph.kind == "node" and ph.ref not in f.nodes:
                f.nodes.append(ph.ref)
            elif ph.kind == "district" and ph.ref not in f.districts:
                f.districts.append(ph.ref)
            elif ph.kind == "area" and ph.ref not in f.areas:
                f.areas.append(ph.ref)
    f.residual = re.sub(r"\s+", " ", work).strip()
    return f


def _collapse(nodes: list[str], lex: Lexicon) -> list[str]:
    """Keep the most specific node of each ancestor chain ("doctor" + "paediatrics" -> paediatrics)."""
    return [n for n in nodes if not any(o != n and lex.is_ancestor(n, o) for o in nodes)]


def _clauses(text: str, lex: Lexicon | None = None) -> tuple[list[str], list[str]]:
    pos, neg = [], []
    prev_neg = False
    for c in CLAUSE_SPLIT.split(text):
        c = c.strip()
        if not c:
            continue
        if prev_neg and lex is not None:
            f = _scan(c, lex)
            if f.nodes and not [w for w in f.residual.split() if w not in FILLER]:
                neg.append(c)  # "except siddha and dental": bare item continues the exclusion list
                continue
        hit = False
        for w in EXCL_PREFIX:
            m = re.search(r"(?<![\w])" + re.escape(w) + r"(?![\w])\s+(.+)$", c)
            if m and not (w in ("no", "not") and re.search(r"\bnot\s+(?:sure|online)\b", c)):
                before = c[: m.start()].strip()
                if before:
                    pos.append(before)
                neg.append(m.group(1)); hit = True
                break
        if not hit:
            for w in EXCL_SUFFIX_TA:
                i = c.find(w)
                if i > 0:
                    neg.append(c[:i].strip()); hit = True
                    rest = c[i + len(w):].strip()
                    if rest:
                        pos.append(rest)
                    break
        if not hit:
            pos.append(c)
        prev_neg = hit
    return pos, neg


def _names(residual: str) -> list[str]:
    words = [w for w in residual.split() if w not in FILLER and not w.isdigit() and len(w) > 1]
    for words_list in (EXCL_PREFIX, EXCL_SUFFIX_TA):
        words = [w for w in words if w not in words_list]
    return [" ".join(words).title()] if words else []


def _bi(en: str, ta: str) -> dict:
    return {"en": en, "ta": ta}


class Turn:
    def __init__(self, lex: Lexicon, lang: str):
        self.lex, self.lang = lex, lang
        self.filters = {"online_only": False, "sort": None, "show_all": False, "max_km": None, "district": None, "area": None, "exclude_nodes": [], "exclude_names": []}
        self.notes: list[dict] = []

    def apply_filters(self, text: str, pos_text: str):
        f = self.filters
        if _any(pos_text, ONLINE):
            f["online_only"] = True
        if _any(text, SHOW_ALL):
            f["show_all"] = True
        for key in ("rating", "experience", "distance"):
            if _any(pos_text, SORT[key]):
                f["sort"] = key
                break
        m = KM.search(text)
        if m:
            f["max_km"] = max(1, min(200, int(m.group(1))))


def _node_question(lex: Lexicon, slug: str | None, cands: list[str] | None = None) -> dict:
    if cands:
        opts = cands
        text = _bi("Did you mean " + " or ".join(lex.name(s) for s in cands) + "?", " அல்லது ".join(lex.name(s, "ta") for s in cands) + " — எது வேண்டும்?")
        slot = "node_choice"
    elif slug is None:
        opts = lex.categories()
        text = _bi("Who would you like to consult — a doctor, lawyer or engineer?", "யாரை அணுக வேண்டும் — மருத்துவர், வழக்கறிஞர் அல்லது பொறியாளர்?")
        slot = "profession"
    else:
        opts = lex.nodes[slug].children[:8] + [slug]
        text = _bi(f"What kind of {lex.name(slug).lower()}?", f"எந்த வகை {lex.name(slug, 'ta')}?")
        slot = "subcategory"
    options = [{"value": o, "label": lex.label(o) if o != slug or slot != "subcategory" else _bi(f"Any {lex.name(slug).lower()}", f"எந்த {lex.name(slug, 'ta')} ஆனாலும்")} for o in opts]
    return {"slot": slot, "text": text, "options": options}


def _choose(text: str, options: list[dict], lex: Lexicon) -> str | None:
    vals = [o["value"] for o in options]
    t = f" {text} "
    for i, words in enumerate(ORDINALS):
        if i < len(vals) and any(_has(t, w) for w in words) and len(text.split()) <= 3:
            return vals[i]
    found = _collapse([n for n in _scan(text, lex).nodes], lex)
    for n in found:  # exact option or a descendant of one ("cardiology" when asked which doctor)
        for v in vals:
            if n == v or lex.is_ancestor(v, n):
                return n
    # loose word match against option names/synonyms ("skin" -> Dermatology when asked heart or skin)
    words = {w for w in text.split() if len(w) >= 3}
    scores = []
    for v in vals:
        n = lex.nodes.get(v)
        if not n:
            continue
        vocab = {w for p in (n.name.get("en", ""), n.name.get("ta", ""), *n.synonyms) for w in norm(p).split() if len(w) >= 3 and w not in FILLER and w != "doctor"}
        scores.append((len(words & vocab), v))
    scores.sort(reverse=True)
    if scores and scores[0][0] > 0 and (len(scores) == 1 or scores[0][0] > scores[1][0]):
        return scores[0][1]
    if _any(text, ANY):
        parents = [v for v in vals if any(lex.is_ancestor(v, o) for o in vals if o != v)]
        return parents[0] if parents else None
    return None


def parse(text: str, lex: Lexicon, lang: str | None = None, pending: dict | None = None, context: dict | None = None) -> dict:
    raw = text or ""
    t = norm(raw)
    lang = lang or ("ta" if has_tamil(raw) else "en")
    if has_tamil(raw):
        lang = "ta"
    context = context or {}
    turn = Turn(lex, lang)

    def out(action: str, reply: dict, node: str | None = None, question: dict | None = None, pend: dict | None = None):
        return {"action": action, "node": node, "node_name": lex.label(node) if node in lex.nodes else None, "filters": turn.filters, "question": question,
                "pending": pend, "reply": reply, "lang": lang, "notes": turn.notes, "transcript": raw, "source": "rules"}

    if not t:
        return out("none", _bi("I didn't hear anything.", "எதுவும் கேட்கவில்லை."))
    if t in STOP or any(t == s or t.startswith(s + " ") for s in STOP if " " in s):
        return out("stop", _bi("Okay, mic off.", "சரி, மைக் அணைக்கப்பட்டது."))
    if t in BACK:
        return out("back", _bi("Going back.", "பின்னால் செல்கிறேன்."))
    if t in HELP:
        return out("help", _bi('Try: "child doctor online near me", "lawyer for property in Madurai", "engineer except architect".',
                               'இப்படிச் சொல்லுங்கள்: "அருகில் ஆன்லைனில் உள்ள குழந்தை மருத்துவர்", "மதுரையில் சொத்து வழக்கறிஞர்".'))

    # carry over everything gathered before the follow-up question
    if pending:
        for k, v in (pending.get("filters") or {}).items():
            turn.filters[k] = v

    pos, neg = _clauses(t, lex)
    pos_text = " ".join(pos)
    turn.apply_filters(t, pos_text)
    found = _scan(pos_text, lex)
    nodes = _collapse(found.nodes, lex)
    for c in neg:
        fx = _scan(c, lex)
        exn = _collapse(fx.nodes, lex)
        turn.filters["exclude_nodes"] = sorted(set(turn.filters["exclude_nodes"]) | set(exn))
        if not exn:
            turn.filters["exclude_names"] = sorted(set(turn.filters["exclude_names"]) | set(_names(fx.residual)))

    # ---- place
    if found.areas:
        names = {lex.areas[i].name.lower() for i in found.areas}
        same = [i for i in found.areas if lex.areas[i].name.lower() in names]
        districts = {lex.areas[i].district for i in same}
        if found.districts:
            same = [i for i in same if lex.areas[i].district in found.districts] or same
            districts = {lex.areas[i].district for i in same}
        if len(districts) > 1 and not (pending and pending.get("slot") == "district"):
            q = {"slot": "district", "text": _bi(f"There is more than one {lex.areas[same[0]].name}. Which district?", f"ஒன்றுக்கு மேற்பட்ட {lex.areas[same[0]].name_ta or lex.areas[same[0]].name} உள்ளன. எந்த மாவட்டம்?"),
                 "options": [{"value": f"area:{i}", "label": _bi(f"{lex.areas[i].name}, {lex.districts[lex.areas[i].district]['en']}",
                                                                 f"{lex.areas[i].name_ta or lex.areas[i].name}, {lex.districts[lex.areas[i].district].get('ta', '')}")} for i in same]}
            return out("ask", q["text"], question=q, pend={"slot": "district", "options": q["options"], "nodes": nodes, "filters": turn.filters})
        a = lex.areas[same[0]]
        turn.filters["area"] = {"name": a.name, "name_ta": a.name_ta, "lat": a.lat, "lng": a.lng, "district": a.district}
        turn.filters["district"] = None
    elif found.districts:
        turn.filters["district"] = found.districts[0]
        turn.filters["show_all"] = True

    # ---- answering a follow-up question
    node: str | None = None
    if pending:
        slot = pending.get("slot")
        if slot == "district":
            m = re.search(r"area:(\d+)", " ".join(o["value"] for o in pending["options"]))
            pick = _choose(t, [{"value": o["value"]} for o in pending["options"]], lex)
            idx = None
            if pick and pick.startswith("area:"):
                idx = int(pick.split(":")[1])
            else:
                for o in pending["options"]:
                    i = int(o["value"].split(":")[1])
                    if lex.areas[i].district in found.districts or _has(t, lex.districts[lex.areas[i].district]["en"]) or _has(t, lex.districts[lex.areas[i].district].get("ta", "~~")):
                        idx = i
                        break
            if idx is None and m:
                return out("ask", _bi("Sorry, which district?", "மன்னிக்கவும், எந்த மாவட்டம்?"), question={"slot": "district", "text": _bi("Which district?", "எந்த மாவட்டம்?"), "options": pending["options"]}, pend=pending)
            a = lex.areas[idx]
            turn.filters["area"] = {"name": a.name, "name_ta": a.name_ta, "lat": a.lat, "lng": a.lng, "district": a.district}
            nodes = nodes or pending.get("nodes") or []
        else:
            pick = _choose(t, pending.get("options", []), lex)
            if pick:
                nodes = [pick]
            elif not nodes:
                tries = pending.get("tries", 0) + 1
                if tries >= 2:
                    return out("none", _bi("Sorry, I couldn't follow. Tap the mic and try again.", "மன்னிக்கவும், புரியவில்லை. மீண்டும் முயற்சிக்கவும்."))
                q = {"slot": slot, "text": _bi("Sorry, I didn't catch that. " + pending["question_en"], "மன்னிக்கவும், புரியவில்லை. " + pending["question_ta"]), "options": pending["options"]}
                return out("ask", q["text"], question=q, pend={**pending, "tries": tries, "filters": turn.filters})

    # ---- refine the list the user is already looking at ("only online ones")
    if not nodes and context.get("current_node") in lex.nodes and (any(turn.filters[k] for k in turn.filters) or neg):
        node = context["current_node"]
        return _finish(out, turn, lex, node, refine=True)

    if len(nodes) > 1:
        q = _node_question(lex, None, nodes[:4])
        return out("ask", q["text"], question=q, pend=_pend(q, turn))
    if not nodes:
        q = _node_question(lex, None)
        return out("ask", q["text"], question=q, pend=_pend(q, turn))
    node = nodes[0]
    # a whole category ("doctor") is too broad: ask which kind, unless they asked for everyone
    if lex.nodes[node].depth == 2 and lex.nodes[node].children and not (pending and pending.get("slot") == "subcategory") and not _any(t, ANY) \
            and not any(lex.is_ancestor(node, x) for x in turn.filters["exclude_nodes"]):
        q = _node_question(lex, node)
        return out("ask", q["text"], node=node, question=q, pend=_pend(q, turn))
    return _finish(out, turn, lex, node)


def _pend(q: dict, turn: Turn) -> dict:
    return {"slot": q["slot"], "options": q["options"], "filters": turn.filters, "question_en": q["text"]["en"], "question_ta": q["text"]["ta"]}


def _finish(out, turn: Turn, lex: Lexicon, node: str, refine: bool = False) -> dict:
    f = turn.filters
    f["exclude_nodes"] = [x for x in f["exclude_nodes"] if x != node and not lex.is_ancestor(x, node)]
    if f["sort"] == "rating" and node.startswith("professionals--lawyer"):
        f["sort"] = "distance"
        turn.notes.append(LEGAL_RANKING_NOTE)
    parts_en, parts_ta = [], []
    if f["online_only"]:
        parts_en.append("online now"); parts_ta.append("இப்போது ஆன்லைனில்")
    if f["area"]:
        parts_en.append(f"near {f['area']['name']}"); parts_ta.append(f"{f['area'].get('name_ta') or f['area']['name']} அருகில்")
    elif f["district"]:
        d = lex.districts[f["district"]]
        parts_en.append(f"in {d['en']}"); parts_ta.append(f"{d.get('ta', d['en'])} மாவட்டத்தில்")
    elif f["show_all"]:
        parts_en.append("across Tamil Nadu"); parts_ta.append("தமிழ்நாடு முழுவதும்")
    if f["max_km"]:
        parts_en.append(f"within {f['max_km']} km"); parts_ta.append(f"{f['max_km']} கிமீக்குள்")
    if f["exclude_nodes"] or f["exclude_names"]:
        ex_en = ", ".join([lex.name(x) for x in f["exclude_nodes"]] + f["exclude_names"])
        ex_ta = ", ".join([lex.name(x, "ta") for x in f["exclude_nodes"]] + f["exclude_names"])
        parts_en.append(f"excluding {ex_en}"); parts_ta.append(f"{ex_ta} தவிர")
    sort_en = {"rating": "best rated first", "experience": "most experienced first", "distance": "nearest first"}
    sort_ta = {"rating": "சிறந்த மதிப்பீடு முதலில்", "experience": "அதிக அனுபவம் முதலில்", "distance": "அருகில் உள்ளவர் முதலில்"}
    if f["sort"]:
        parts_en.append(sort_en[f["sort"]]); parts_ta.append(sort_ta[f["sort"]])
    en = f"Showing {lex.name(node)}" + (" — " + ", ".join(parts_en) if parts_en else "") + "."
    ta = f"{lex.name(node, 'ta')} காட்டுகிறேன்" + (" — " + ", ".join(parts_ta) if parts_ta else "") + "."
    for n in turn.notes:
        en += " " + n["en"]; ta += " " + n["ta"]
    return out("refine" if refine else "navigate", _bi(en, ta), node=node)
