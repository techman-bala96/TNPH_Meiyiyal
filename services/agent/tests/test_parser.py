import pytest

from agent.parser import parse

P = "professionals--"
PAED, CARD, DERM, ORTHO, DENT = P + "doctor--allopathy--paediatrics", P + "doctor--allopathy--cardiology", P + "doctor--allopathy--dermatology", P + "doctor--allopathy--orthopaedics", P + "doctor--dental"
LAND, DIV, CRIM = P + "lawyer--property-land", P + "lawyer--family-divorce", P + "lawyer--criminal"

# (utterance, expected node, expected filter subset)
DIRECT = [
    # English
    ("child doctor", PAED, {}),
    ("I need a kids doctor", PAED, {}),
    ("show me a pediatrician", PAED, {}),
    ("heart specialist", CARD, {}),
    ("cardiologist near me", CARD, {"sort": "distance"}),
    ("skin doctor for pimples", DERM, {}),
    ("bone doctor most experienced", ORTHO, {"sort": "experience"}),
    ("dentist available now", DENT, {"online_only": True}),
    ("tooth doctor online only", DENT, {"online_only": True}),
    ("top rated eye doctor", P + "doctor--allopathy--ophthalmology", {"sort": "rating"}),
    ("sugar doctor", P + "doctor--allopathy--diabetology-endocrinology", {}),
    ("find a gynaecologist", P + "doctor--allopathy--gynaecology-obstetrics", {}),
    ("physio", P + "doctor--physiotherapy", {}),
    ("counsellor for stress", P + "doctor--psychology-counselling", {}),
    ("siddha doctor", P + "doctor--siddha", {}),
    ("property lawyer", LAND, {}),
    ("lawyer for patta transfer", LAND, {}),
    ("divorce lawyer", DIV, {}),
    ("need bail urgently", CRIM, {}),
    ("cheque bounce case", P + "lawyer--cheque-bounce", {}),
    ("civil engineer", P + "engineer--civil", {}),
    ("house plan review", P + "engineer--civil--house-plan-review", {}),
    ("architect", P + "engineer--architect", {}),
    ("crack in wall engineer", P + "engineer--civil--structural", {}),
    ("civil engineer within 5 km", P + "engineer--civil", {"max_km": 5}),
    ("show all dentists in tamil nadu", DENT, {"show_all": True}),
    ("child doctor anywhere", PAED, {"show_all": True}),
    ("heart doctor in Madurai", CARD, {"district": "madurai", "show_all": True}),
    ("bone doctor in Nagercoil", ORTHO, {"area": {"name": "Nagercoil"}}),
    ("child doctor online near me", PAED, {"online_only": True, "sort": "distance"}),
    ("best rated child doctor online", PAED, {"online_only": True, "sort": "rating"}),
    # Tamil
    ("குழந்தை மருத்துவர்", PAED, {}),
    ("எனக்கு குழந்தை மருத்துவர் வேணும்", PAED, {}),
    ("குழந்தை டாக்டர் இப்போது ஆன்லைனில்", PAED, {"online_only": True}),
    ("இதய மருத்துவரை காட்டு", CARD, {}),
    ("பல் டாக்டர் அருகில்", DENT, {"sort": "distance"}),
    ("தோல் மருத்துவர் சிறந்த", DERM, {"sort": "rating"}),
    ("எலும்பு டாக்டர் அனுபவம் அதிகம்", ORTHO, {"sort": "experience"}),
    ("சித்த டாக்டர் வேணும்", P + "doctor--siddha", {}),
    ("பட்டா பிரச்சனைக்கு வழக்கறிஞர்", LAND, {}),
    ("விவாகரத்து வழக்கறிஞர்", DIV, {}),
    ("மதுரையில் இதய மருத்துவர்", CARD, {"district": "madurai"}),
    ("நாகர்கோவிலில் குழந்தை மருத்துவர்", PAED, {"area": {"name": "Nagercoil"}}),
    ("தமிழ்நாடு முழுவதும் குழந்தை மருத்துவர்", PAED, {"show_all": True}),
    ("சிவில் இன்ஜினியர் 5 கிமீக்குள்", P + "engineer--civil", {"max_km": 5}),
    # Tanglish
    ("kuzhandhai doctor venum", PAED, {}),
    ("kuzhandhai doctor ippo online la", PAED, {"online_only": True}),
    ("pillai doctor pakkathula", PAED, {"sort": "distance"}),
    ("pal doctor", DENT, {}),
    ("kan doctor nalla", P + "doctor--allopathy--ophthalmology", {"sort": "rating"}),
    ("vakeel for nilam case", LAND, {}),
    ("elumbu doctor anubavam", ORTHO, {"sort": "experience"}),
    ("sitha doctor tamil nadu fulla", P + "doctor--siddha", {"show_all": True}),
    ("child doctor online-la irukkiravanga mattum", PAED, {"online_only": True}),
]


def sub(d: dict, exp: dict) -> bool:
    for k, v in exp.items():
        if isinstance(v, dict):
            if not isinstance(d.get(k), dict) or not sub(d[k], v):
                return False
        elif d.get(k) != v:
            return False
    return True


@pytest.mark.parametrize("text,node,filters", DIRECT)
def test_direct(lex, text, node, filters):
    r = parse(text, lex)
    assert r["action"] == "navigate", (text, r["question"])
    assert r["node"] == node
    assert sub(r["filters"], filters), r["filters"]


@pytest.mark.parametrize("text,lang", [("child doctor", "en"), ("குழந்தை மருத்துவர்", "ta"), ("kuzhandhai doctor", "en")])
def test_language_detection(lex, text, lang):
    assert parse(text, lex)["lang"] == lang


EXCL = [
    ("engineer except architect", P + "engineer", {"exclude_nodes": [P + "engineer--architect"]}),
    ("doctor but not dentist", P + "doctor", {"exclude_nodes": [P + "doctor--dental"]}),
    ("lawyer other than criminal", P + "lawyer", {"exclude_nodes": [CRIM]}),
    ("skin doctor except Kavitha", DERM, {"exclude_names": ["Kavitha"]}),
    ("child doctor not Dr. Kavitha Raman", PAED, {"exclude_names": ["Kavitha Raman"]}),
    ("child doctor online, but not Kavitha", PAED, {"online_only": True, "exclude_names": ["Kavitha"]}),
    ("பல் டாக்டர் தவிர மற்ற மருத்துவர்", P + "doctor", {"exclude_nodes": [DENT]}),
    ("கவிதா தவிர குழந்தை மருத்துவர்", PAED, {"exclude_names": ["கவிதா"]}),
    ("architect venam engineer", P + "engineer", {"exclude_nodes": [P + "engineer--architect"]}),
    ("doctor excluding siddha and dental", P + "doctor", {"exclude_nodes": [P + "doctor--siddha", DENT]}),
]


@pytest.mark.parametrize("text,node,filters", EXCL)
def test_exclusions(lex, text, node, filters):
    r = parse(text, lex)
    assert r["action"] == "navigate", (text, r["question"])
    assert r["node"] == node
    for k, v in filters.items():
        if isinstance(v, list):
            assert set(v) <= set(r["filters"][k]), (k, r["filters"][k])
        else:
            assert r["filters"][k] == v, k


def test_exclusion_with_and_keeps_both(lex):
    r = parse("doctor except siddha and except dental", lex)
    assert {P + "doctor--siddha", DENT} <= set(r["filters"]["exclude_nodes"])


def test_online_word_inside_exclusion_is_not_online_filter(lex):
    r = parse("child doctor except online ones", lex)
    assert r["filters"]["online_only"] is False


# ---------------- follow-up questions ----------------
@pytest.mark.parametrize("text,slot", [("I need help", "profession"), ("show me someone", "profession"), ("எனக்கு உதவி வேணும்", "profession"),
                                       ("doctor", "subcategory"), ("I need a lawyer", "subcategory"), ("engineer venum", "subcategory"), ("டாக்டர் வேணும்", "subcategory"),
                                       ("heart doctor or skin doctor", "node_choice")])
def test_asks(lex, text, slot):
    r = parse(text, lex)
    assert r["action"] == "ask"
    assert r["question"]["slot"] == slot
    assert r["question"]["options"] and r["pending"]
    assert r["reply"]["en"] and r["reply"]["ta"]


def test_follow_up_by_name_keeps_filters(lex):
    r1 = parse("I need a doctor online near me", lex)
    assert r1["action"] == "ask" and r1["filters"]["online_only"]
    r2 = parse("children", lex, pending=r1["pending"])
    assert r2["action"] == "ask"  # "children" alone is not a profession -> re-ask
    r3 = parse("child doctor", lex, pending=r2["pending"])
    assert r3["action"] == "navigate" and r3["node"] == PAED
    assert r3["filters"]["online_only"] and r3["filters"]["sort"] == "distance"


def test_follow_up_descendant_and_tamil(lex):
    r1 = parse("டாக்டர் வேணும்", lex)
    r2 = parse("இதய மருத்துவர்", lex, pending=r1["pending"])
    assert r2["node"] == CARD and r2["lang"] == "ta"


def test_follow_up_ordinal(lex):
    r1 = parse("I need a lawyer", lex)
    first = r1["question"]["options"][0]["value"]
    assert parse("the first one", lex, pending=r1["pending"])["node"] == first
    second = r1["question"]["options"][1]["value"]
    assert parse("ரெண்டு", lex, pending=r1["pending"])["node"] == second


def test_follow_up_any(lex):
    r1 = parse("engineer", lex)
    r2 = parse("any engineer is fine", lex, pending=r1["pending"])
    assert r2["action"] == "navigate" and r2["node"] == P + "engineer"


def test_follow_up_profession_then_category_then_sub(lex):
    r1 = parse("I need help", lex)
    r2 = parse("lawyer", lex, pending=r1["pending"])
    assert r2["action"] == "ask" and r2["question"]["slot"] == "subcategory"
    r3 = parse("property", lex, pending=r2["pending"])
    assert r3["node"] == LAND


def test_follow_up_gives_up_after_two_misses(lex):
    r1 = parse("I need help", lex)
    r2 = parse("blah", lex, pending=r1["pending"])
    assert r2["action"] == "ask"
    r3 = parse("blah blah", lex, pending=r2["pending"])
    assert r3["action"] == "none"


def test_ambiguous_choice(lex):
    r1 = parse("heart doctor or skin doctor", lex)
    assert {o["value"] for o in r1["question"]["options"]} == {CARD, DERM}
    assert parse("skin", lex, pending=r1["pending"])["node"] == DERM


# ---------------- refinement on the current page ----------------
def test_refine_current_list(lex):
    r = parse("only online ones", lex, context={"current_node": PAED})
    assert r["action"] == "refine" and r["node"] == PAED and r["filters"]["online_only"]
    r = parse("sort by experience", lex, context={"current_node": PAED})
    assert r["action"] == "refine" and r["filters"]["sort"] == "experience"
    r = parse("except Kavitha", lex, context={"current_node": PAED})
    assert r["action"] == "refine" and r["filters"]["exclude_names"] == ["Kavitha"]


def test_no_context_filters_only_asks(lex):
    assert parse("only online ones", lex)["action"] == "ask"


# ---------------- commands & compliance ----------------
@pytest.mark.parametrize("text,action", [("stop", "stop"), ("stop listening", "stop"), ("நிறுத்து", "stop"), ("go back", "back"), ("help", "help"), ("", "none")])
def test_commands(lex, text, action):
    assert parse(text, lex)["action"] == action


def test_lawyers_never_ranked_by_rating(lex):
    r = parse("best rated divorce lawyer", lex)
    assert r["node"] == DIV and r["filters"]["sort"] == "distance"
    assert "Bar Council" in r["reply"]["en"] and "பார் கவுன்சில்" in r["reply"]["ta"]


def test_reply_is_bilingual_and_descriptive(lex):
    r = parse("child doctor online in Madurai except Kavitha", lex)
    assert "Paediatrics" in r["reply"]["en"] and "online now" in r["reply"]["en"] and "Madurai" in r["reply"]["en"] and "Kavitha" in r["reply"]["en"]
    assert "குழந்தை நலம்" in r["reply"]["ta"]


def test_radius_bounds(lex):
    assert parse("child doctor within 900 km", lex)["filters"]["max_km"] == 200


def test_unknown_name_never_becomes_profession(lex):
    r = parse("Ramasamy", lex)
    assert r["action"] == "ask" and r["node"] is None
