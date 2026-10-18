import pytest

from verify.names import fold, name_score, translit

# The letter map is the contract. These are the Latin strings that map emits.
EXACT = [
    ("கவிதா", "kavitaa"),
    ("ராமன்", "raaman"),
    ("குமார்", "kumaar"),
    ("செந்தில்", "sentil"),
    ("செல்வம்", "selvam"),
    ("அருண்", "arun"),
    ("சுரேஷ்", "sureesh"),
    ("ரமேஷ்", "rameesh"),
    ("விஜய்", "vijay"),
    ("அனிதா", "anitaa"),
    ("ரவி", "ravi"),
    ("மணி", "mani"),
    ("சரவணன்", "saravanan"),
    ("மோகன்", "mookan"),
    ("பாலன்", "paalan"),
    ("தேவி", "teevi"),
    ("குரு", "kuru"),
    ("கணேஷ்", "kaneesh"),
    ("லட்சுமி", "latsumi"),
    ("கீதா", "kiitaa"),
    ("கார்த்திக்", "kaarttik"),
    ("நாகராஜன்", "naakaraajan"),
    ("சுந்தரம்", "suntaram"),
    ("வெங்கடேஷ்", "vengkateesh"),
    ("சங்கர்", "sangkar"),
    ("முருகன்", "murukan"),
    ("இளங்கோ", "ilangkoo"),
    ("பாஸ்கர்", "paaskar"),
    ("பிரியா", "piriyaa"),
    ("தினேஷ்", "tineesh"),
    ("மருத்துவர்", "maruttuvar"),
    ("வழக்கறிஞர்", "vazhakkarinyar"),
    ("பொறியாளர்", "poriyaalar"),
    ("கால்நடை", "kaalnatai"),
    ("சித்த", "sitta"),
    ("ஆயுர்வேதம்", "aayurveetam"),
    ("ஹோமியோபதி", "hoomiyoopati"),
    ("யோகா", "yookaa"),
    ("பல்", "pal"),
    ("உளவியல்", "ulaviyal"),
    ("உணவியல்", "unaviyal"),
]

SAME = [
    ("Kavitha Raman", "கவிதா ராமன்"),
    ("Senthil Kumar", "செந்தில் குமார்"),
    ("Dr Kavitha", "கவிதா"),
    ("Raman", "ராமன்"),
    ("Kumar", "குமார்"),
    ("Arun Kumar", "அருண் குமார்"),
    ("Karthik", "கார்த்திக்"),
    ("Suresh", "சுரேஷ்"),
    ("Ramesh", "ரமேஷ்"),
    ("Vijay", "விஜய்"),
    ("Anita", "அனிதா"),
    ("Shankar", "சங்கர்"),
    ("Mani", "மணி"),
    ("Selvam", "செல்வம்"),
    ("Venkatesh", "வெங்கடேஷ்"),
    ("Saravanan", "சரவணன்"),
    ("Ilango", "இளங்கோ"),
    ("Ravi", "ரவி"),
    ("Adv Senthil", "செந்தில்"),
    ("Er Selvam", "செல்வம்"),
]

DIFFERENT = [
    ("Kavitha", "செந்தில்"),
    ("Raman", "குமார்"),
    ("Lakshmi", "ரவி"),
    ("Geetha", "மணி"),
    ("Priya Selvam", "அருண் குமார்"),
]


def test_name_catalogue_is_large_enough():
    assert len(EXACT) + len(SAME) + len(DIFFERENT) >= 60


@pytest.mark.parametrize(("tamil", "latin"), EXACT)
def test_transliteration_map(tamil, latin):
    assert translit(tamil) == latin


@pytest.mark.parametrize(("en", "ta"), SAME)
def test_same_person_across_scripts(en, ta):
    assert name_score(en, ta) >= 0.92, (en, ta, name_score(en, ta), fold(ta))


@pytest.mark.parametrize(("a", "b"), DIFFERENT)
def test_different_people_stay_apart(a, b):
    assert name_score(a, b) < 0.80


def test_honorific_and_order():
    assert name_score("Dr. Kavitha Raman", "Raman Kavitha") >= 0.92
    assert fold("  Dr.  Kavitha ") == "kavita"
