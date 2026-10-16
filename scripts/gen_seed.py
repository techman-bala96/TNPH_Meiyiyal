"""Generates src/data/*.json (client fallback/mocks) and supabase/migrations seed SQL
from one source of truth. Run: python3 scripts/gen_seed.py"""
import json, re, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent

def slug(s): return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')

# (en, ta, icon, children)
T = [("Professionals", "தொழில் வல்லுநர்கள்", "briefcase", [
  ("Doctor", "மருத்துவர்", "stethoscope", [
    ("Allopathy", "ஆங்கில மருத்துவம்", "pill", [
      ("General Physician","பொது மருத்துவர்"),("Paediatrics","குழந்தை நலம்"),
      ("Gynaecology & Obstetrics","மகப்பேறு மருத்துவம்"),("Cardiology","இதய மருத்துவம்"),
      ("Dermatology","தோல் மருத்துவம்"),("ENT","காது மூக்கு தொண்டை"),
      ("Orthopaedics","எலும்பு மருத்துவம்"),("Neurology","நரம்பியல்"),
      ("Psychiatry","மனநல மருத்துவம்"),("Gastroenterology","இரைப்பை குடல் மருத்துவம்"),
      ("Urology","சிறுநீரகவியல்"),("Nephrology","சிறுநீரக மருத்துவம்"),
      ("Diabetology & Endocrinology","சர்க்கரை நோய் மருத்துவம்"),("Pulmonology","நுரையீரல் மருத்துவம்"),
      ("Ophthalmology","கண் மருத்துவம்"),("Oncology","புற்றுநோய் மருத்துவம்"),
      ("General Surgery","பொது அறுவை சிகிச்சை")]),
    ("Siddha", "சித்த மருத்துவம்", "leaf", [
      ("General Siddha","பொது சித்த மருத்துவம்"),("Varmam","வர்மம்"),("Thokkanam","தொக்கணம்"),
      ("Siddha Dermatology","சித்த தோல் மருத்துவம்"),("Siddha Paediatrics","சித்த குழந்தை மருத்துவம்"),
      ("Women's Health (Siddha)","மகளிர் நலம் (சித்தா)"),("Noi Nadal (Diagnosis)","நோய் நாடல்")]),
    ("Ayurveda", "ஆயுர்வேதம்", "sprout", [
      ("Kayachikitsa","காயசிகித்சை"),("Panchakarma","பஞ்சகர்மா"),("Ayurveda Skin Care","ஆயுர்வேத தோல் பராமரிப்பு")]),
    ("Homeopathy", "ஹோமியோபதி", "droplet", []),
    ("Unani", "யுனானி", "flask", []),
    ("Yoga & Naturopathy", "யோகா & இயற்கை மருத்துவம்", "flower", []),
    ("Dental", "பல் மருத்துவம்", "smile", [
      ("General Dentist","பொது பல் மருத்துவர்"),("Orthodontics","பல் சீரமைப்பு"),
      ("Endodontics (Root Canal)","வேர் சிகிச்சை"),("Paediatric Dentistry","குழந்தை பல் மருத்துவம்"),
      ("Oral Surgery","வாய் அறுவை சிகிச்சை")]),
    ("Physiotherapy", "இயன்முறை மருத்துவம்", "activity", [
      ("Orthopaedic Physio","எலும்பு இயன்முறை"),("Neuro Physio","நரம்பு இயன்முறை"),
      ("Sports Physio","விளையாட்டு இயன்முறை"),("Women's Health Physio","மகளிர் இயன்முறை")]),
    ("Psychology & Counselling", "உளவியல் ஆலோசனை", "brain", [
      ("Clinical Psychologist","மருத்துவ உளவியலாளர்"),("Child Psychology","குழந்தை உளவியல்"),
      ("Relationship Counselling","உறவு ஆலோசனை"),("De-addiction","போதை மீட்பு")]),
    ("Nutrition & Diet", "உணவியல்", "apple", []),
  ]),
  ("Lawyer", "வழக்கறிஞர்", "scale", [
    ("Family & Divorce","குடும்பம் & விவாகரத்து","users",[]),("Property & Land","சொத்து & நிலம்","home",[]),
    ("Criminal","குற்றவியல்","shield",[]),("Civil","சிவில்","landmark",[]),
    ("Consumer","நுகர்வோர்","shopping-bag",[]),("Labour & Employment","தொழிலாளர்","hard-hat",[]),
    ("Cheque Bounce","காசோலை மோசடி","receipt",[]),("Cyber Crime","இணைய குற்றம்","wifi",[]),
    ("Documentation & Registration","ஆவணம் & பதிவு","file-text",[]),("Corporate & Startup","நிறுவன சட்டம்","building",[]),
    ("Tax Law","வரி சட்டம்","percent",[]),("Motor Accident Claims","வாகன விபத்து இழப்பீடு","car",[]),
  ]),
  ("Engineer", "பொறியாளர்", "hard-hat", [
    ("Civil","கட்டுமானப் பொறியியல்","building",[("House Plan Review","வீட்டு வரைபட ஆய்வு"),("Estimate & BOQ","மதிப்பீடு"),("Structural","கட்டமைப்பு")]),
    ("Software & IT","மென்பொருள்","code",[("Web & App Development","இணையம் & செயலி"),("Cloud & DevOps","கிளவுட்"),("Data & AI","தரவு & AI"),("Cyber Security","இணைய பாதுகாப்பு")]),
    ("Electrical","மின் பொறியியல்","zap",[]),("Mechanical","இயந்திரவியல்","cog",[]),
    ("Electronics & Communication","மின்னணுவியல்","cpu",[]),("Architect","கட்டடக் கலைஞர்","ruler",[]),
    ("Interior Design","உள் அலங்காரம்","sofa",[]),("Solar & EV","சூரிய சக்தி & மின் வாகனம்","sun",[]),
  ]),
])]

nodes = []
def add(item, parent, depth, path):
    en, ta = item[0], item[1]
    icon = item[2] if len(item) > 2 else None
    kids = item[3] if len(item) > 3 else []
    s = slug(en) if parent is None else f"{path}--{slug(en)}"
    kind = ["group", "category", "subcategory", "specialty"][min(depth, 3)]
    nodes.append({"slug": s, "parent": parent, "kind": kind, "name": {"en": en, "ta": ta},
                  "icon": icon, "sort": len([n for n in nodes if n["parent"] == parent])})
    for k in kids: add(k, s, depth + 1, s)
for g in T: add(g, None, 0, "")

# 38 districts of Tamil Nadu; Kanniyakumari first per product decision. (en, ta, hq lat, lng, [towns/areas])
D = [
("Kanniyakumari","கன்னியாகுமரி",8.1833,77.4119,["Nagercoil","Kanniyakumari","Marthandam","Kuzhithurai","Colachel","Thuckalay","Padmanabhapuram","Thovalai"]),
("Ariyalur","அரியலூர்",11.1401,79.0786,["Ariyalur","Jayankondam","Sendurai","Udayarpalayam"]),
("Chengalpattu","செங்கல்பட்டு",12.6819,79.9888,["Chengalpattu","Tambaram","Pallavaram","Guduvancheri","Maraimalai Nagar","Madurantakam","Thiruporur","Mamallapuram"]),
("Chennai","சென்னை",13.0827,80.2707,["T. Nagar","Adyar","Anna Nagar","Velachery","Mylapore","Egmore","Guindy","Porur","Tondiarpet","Perambur","Sholinganallur","Vadapalani"]),
("Coimbatore","கோயம்புத்தூர்",11.0168,76.9558,["Gandhipuram","RS Puram","Peelamedu","Saibaba Colony","Pollachi","Mettupalayam","Sulur","Valparai"]),
("Cuddalore","கடலூர்",11.7480,79.7714,["Cuddalore","Chidambaram","Neyveli","Virudhachalam","Panruti","Kattumannarkoil"]),
("Dharmapuri","தர்மபுரி",12.1211,78.1582,["Dharmapuri","Harur","Palacode","Pennagaram","Pappireddipatti"]),
("Dindigul","திண்டுக்கல்",10.3673,77.9803,["Dindigul","Palani","Kodaikanal","Oddanchatram","Natham","Vedasandur"]),
("Erode","ஈரோடு",11.3410,77.7172,["Erode","Gobichettipalayam","Bhavani","Sathyamangalam","Perundurai","Anthiyur"]),
("Kallakurichi","கள்ளக்குறிச்சி",11.7383,78.9639,["Kallakurichi","Ulundurpet","Sankarapuram","Chinnasalem","Tirukoilur"]),
("Kancheepuram","காஞ்சிபுரம்",12.8342,79.7036,["Kancheepuram","Sriperumbudur","Walajabad","Uthiramerur","Kundrathur"]),
("Karur","கரூர்",10.9601,78.0766,["Karur","Kulithalai","Aravakurichi","Krishnarayapuram"]),
("Krishnagiri","கிருஷ்ணகிரி",12.5266,78.2150,["Krishnagiri","Hosur","Denkanikottai","Pochampalli","Uthangarai"]),
("Madurai","மதுரை",9.9252,78.1198,["Madurai City","Anna Nagar (Madurai)","K. Pudur","Thirumangalam","Melur","Usilampatti","Vadipatti","Thiruparankundram"]),
("Mayiladuthurai","மயிலாடுதுறை",11.1018,79.6520,["Mayiladuthurai","Sirkazhi","Kuthalam","Tharangambadi"]),
("Nagapattinam","நாகப்பட்டினம்",10.7672,79.8449,["Nagapattinam","Vedaranyam","Kilvelur","Velankanni"]),
("Namakkal","நாமக்கல்",11.2189,78.1674,["Namakkal","Tiruchengode","Rasipuram","Paramathi Velur","Kumarapalayam"]),
("Nilgiris","நீலகிரி",11.4064,76.6932,["Ooty","Coonoor","Kotagiri","Gudalur"]),
("Perambalur","பெரம்பலூர்",11.2342,78.8807,["Perambalur","Kunnam","Veppanthattai","Alathur"]),
("Pudukkottai","புதுக்கோட்டை",10.3797,78.8205,["Pudukkottai","Aranthangi","Alangudi","Illuppur","Gandarvakottai"]),
("Ramanathapuram","ராமநாதபுரம்",9.3639,78.8395,["Ramanathapuram","Rameswaram","Paramakudi","Kamuthi","Mudukulathur"]),
("Ranipet","ராணிப்பேட்டை",12.9224,79.3326,["Ranipet","Arakkonam","Walajapet","Arcot","Sholingur"]),
("Salem","சேலம்",11.6643,78.1460,["Salem City","Attur","Mettur","Omalur","Edappadi","Yercaud"]),
("Sivaganga","சிவகங்கை",9.8433,78.4809,["Sivaganga","Karaikudi","Devakottai","Manamadurai","Thiruppuvanam"]),
("Tenkasi","தென்காசி",8.9594,77.3152,["Tenkasi","Sankarankovil","Kadayanallur","Courtallam","Alangulam"]),
("Thanjavur","தஞ்சாவூர்",10.7870,79.1378,["Thanjavur","Kumbakonam","Pattukkottai","Papanasam","Orathanadu"]),
("Theni","தேனி",10.0104,77.4768,["Theni","Periyakulam","Bodinayakanur","Cumbum","Andipatti"]),
("Thoothukudi","தூத்துக்குடி",8.7642,78.1348,["Thoothukudi","Tiruchendur","Kovilpatti","Srivaikuntam","Ettayapuram"]),
("Tiruchirappalli","திருச்சிராப்பள்ளி",10.7905,78.7047,["Trichy City","Srirangam","Thillai Nagar","Manapparai","Lalgudi","Musiri","Thuraiyur"]),
("Tirunelveli","திருநெல்வேலி",8.7139,77.7567,["Tirunelveli Town","Palayamkottai","Ambasamudram","Nanguneri","Radhapuram"]),
("Tirupathur","திருப்பத்தூர்",12.4950,78.5730,["Tirupathur","Vaniyambadi","Ambur","Natrampalli"]),
("Tiruppur","திருப்பூர்",11.1085,77.3411,["Tiruppur","Avinashi","Palladam","Dharapuram","Udumalaipettai","Kangeyam"]),
("Tiruvallur","திருவள்ளூர்",13.1231,79.9120,["Tiruvallur","Avadi","Ambattur","Poonamallee","Gummidipoondi","Tiruttani","Ponneri"]),
("Tiruvannamalai","திருவண்ணாமலை",12.2253,79.0747,["Tiruvannamalai","Arani","Cheyyar","Polur","Vandavasi","Chengam"]),
("Tiruvarur","திருவாரூர்",10.7661,79.6344,["Tiruvarur","Mannargudi","Thiruthuraipoondi","Needamangalam","Kodavasal"]),
("Vellore","வேலூர்",12.9165,79.1325,["Vellore","Katpadi","Gudiyatham","Pernambut","Anaicut"]),
("Viluppuram","விழுப்புரம்",11.9401,79.4861,["Viluppuram","Tindivanam","Gingee","Vanur","Vikravandi"]),
("Virudhunagar","விருதுநகர்",9.5680,77.9624,["Virudhunagar","Sivakasi","Rajapalayam","Aruppukottai","Srivilliputhur","Sattur"]),
]
assert len(D) == 38, len(D)
districts = [{"slug": slug(d[0]), "name": {"en": d[0], "ta": d[1]}, "lat": d[2], "lng": d[3],
              "sort": i, "areas": d[4]} for i, d in enumerate(D)]

(ROOT/"src/data/taxonomy.json").write_text(json.dumps(nodes, ensure_ascii=False, indent=1))
(ROOT/"src/data/districts.json").write_text(json.dumps(districts, ensure_ascii=False, indent=1))

q = lambda s: "NULL" if s is None else "'" + str(s).replace("'", "''") + "'"
sql = ["-- GENERATED by scripts/gen_seed.py — do not edit by hand", "BEGIN;"]
for n in nodes:
    sql.append(f"INSERT INTO public.taxonomy_nodes (slug,parent_slug,kind,name_i18n,icon,sort) VALUES "
               f"({q(n['slug'])},{q(n['parent'])},{q(n['kind'])},{q(json.dumps(n['name'],ensure_ascii=False))}::jsonb,{q(n['icon'])},{n['sort']}) "
               "ON CONFLICT (slug) DO UPDATE SET name_i18n=EXCLUDED.name_i18n, icon=EXCLUDED.icon, sort=EXCLUDED.sort;")
for d in districts:
    sql.append(f"INSERT INTO public.tn_districts (slug,name_i18n,center,sort) VALUES ({q(d['slug'])},"
               f"{q(json.dumps(d['name'],ensure_ascii=False))}::jsonb, ST_SetSRID(ST_MakePoint({d['lng']},{d['lat']}),4326)::geography,{d['sort']}) "
               "ON CONFLICT (slug) DO UPDATE SET name_i18n=EXCLUDED.name_i18n, sort=EXCLUDED.sort;")
    for i, a in enumerate(d["areas"]):
        sql.append(f"INSERT INTO public.tn_areas (district_slug,name,sort) VALUES ({q(d['slug'])},{q(a)},{i}) ON CONFLICT DO NOTHING;")
sql.append("COMMIT;")
(ROOT/"supabase/migrations/20261016230200_m1_seed_taxonomy_districts.sql").write_text("\n".join(sql) + "\n")
print(len(nodes), "nodes;", len(districts), "districts;", sum(len(d['areas']) for d in districts), "areas")
