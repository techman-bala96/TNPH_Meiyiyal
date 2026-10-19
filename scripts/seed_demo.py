#!/usr/bin/env python3
"""Demo data for a TEST Meiyiyal project: 17 approved pros, two clients, an admin with an authenticator (TOTP) factor.

TEST / PREVIEW ONLY: never run it against the real production project. It creates fake verified professionals.
Works against a hosted Supabase project (docs/GO-LIVE.md "Test deployment on meiyiyal.com") or a local stack.

  SUPABASE_URL=https://<ref>.supabase.co  SUPABASE_SERVICE_ROLE_KEY=<service_role / sb_secret key>
  SUPABASE_ANON_KEY=<anon / sb_publishable key>  SUPABASE_DB_URL=postgresql://postgres.<ref>:<pw>@...pooler.supabase.com:5432/postgres
  MEIYIYAL_DEMO_SEED=yes  python3 scripts/seed_demo.py

Local stack instead of SUPABASE_DB_URL: SEED_DB_CONTAINER=supabase_db_<project_id> (psql via docker exec).
The fixed sign-in codes must also be listed as Auth test phone numbers (GO-LIVE.md); the admin TOTP enrolment below
signs in with 919000000002 / ADMIN_OTP (default 246810). The TOTP secret is printed and written to SEED_TOTP_FILE
(default ./admin-totp-secret.txt, git-ignored by name). Safe to re-run: existing users and pros are updated, not duplicated.
"""
import base64, hashlib, hmac, json, os, struct, subprocess, sys, time, urllib.error, urllib.request

def env(name, required=True, default=""):
    v = os.environ.get(name, default).strip()
    if required and not v: sys.exit(f"missing {name} (see the docstring at the top of scripts/seed_demo.py)")
    return v

if os.environ.get("MEIYIYAL_DEMO_SEED") != "yes":
    sys.exit("Refusing to run: this creates FAKE verified professionals. Set MEIYIYAL_DEMO_SEED=yes for a TEST project only.")
API = env("SUPABASE_URL").rstrip("/")
SR = env("SUPABASE_SERVICE_ROLE_KEY")
ANON = env("SUPABASE_ANON_KEY")
DB_URL = env("SUPABASE_DB_URL", required=False)
DB_CONTAINER = env("SEED_DB_CONTAINER", required=False)
if not DB_URL and not DB_CONTAINER: sys.exit("set SUPABASE_DB_URL (hosted) or SEED_DB_CONTAINER (local docker stack)")
ADMIN_OTP = env("ADMIN_OTP", required=False, default="246810")
TOTP_FILE = env("SEED_TOTP_FILE", required=False, default="admin-totp-secret.txt")

def req(method, path, body=None, key=SR, token=None):
    # new-style sb_secret_/sb_publishable_ keys go in apikey only; legacy JWT keys are also sent as the bearer
    h = {"apikey": key, "Content-Type": "application/json"}
    bearer = token or (key if key.startswith("eyJ") else None)
    if bearer: h["Authorization"] = "Bearer " + bearer
    r = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=60) as f: return json.loads(f.read() or b"null")
    except urllib.error.HTTPError as e: sys.exit(f"{method} {path}: {e.code} {e.read()[:300]!r}")

def sql(q):
    cmd = ["psql", DB_URL] if DB_URL else ["docker", "exec", "-i", DB_CONTAINER, "psql", "-U", "postgres"]
    p = subprocess.run(cmd + ["-tA", "-v", "ON_ERROR_STOP=1"], input=q, capture_output=True, text=True)
    if p.returncode: sys.exit(p.stderr[-800:])
    return p.stdout.strip()

def user(phone, name):
    uid = sql(f"select id from auth.users where phone='{phone}'")
    if not uid:
        uid = req("POST", "/auth/v1/admin/users", {"phone": phone, "phone_confirm": True, "user_metadata": {"full_name": name}})["id"]
    sql(f"update public.profiles set full_name=$${name}$$, first_name=$${name.split()[0]}$$ where user_id='{uid}'")
    return uid

D = {"chennai":(13.0604,80.2496),"coimbatore":(11.0168,76.9558),"madurai":(9.9252,78.1198),"tiruchirappalli":(10.7905,78.7047),
     "salem":(11.6643,78.1460),"tirunelveli":(8.7139,77.7567),"vellore":(12.9165,79.1325),"erode":(11.3410,77.7172),"thanjavur":(10.7870,79.1378)}
N = "professionals--"
W = [ # phone, name, node, district, years, about, reg
 ("919000000001","Dr. Priya Raman","doctor--allopathy--general-physician","chennai",9,"General physician. Fever, BP, sugar, and everyday health questions.",{"council":"Tamil Nadu Medical Council","reg_no":"TNMC-104521"}),
 ("919000000101","Dr. Karthik Subramanian","doctor--allopathy--paediatrics","chennai",12,"Child specialist. Fever, vaccines and growth in children.",{"council":"Tamil Nadu Medical Council","reg_no":"TNMC-088213"}),
 ("919000000102","Dr. Meena Lakshmi","doctor--allopathy--gynaecology-obstetrics","coimbatore",15,"Pregnancy care and women's health.",{"council":"Tamil Nadu Medical Council","reg_no":"TNMC-071190"}),
 ("919000000103","Dr. Arun Kumar","doctor--allopathy--cardiology","madurai",18,"Heart specialist. Chest pain, BP and ECG reports.",{"council":"Tamil Nadu Medical Council","reg_no":"TNMC-065402"}),
 ("919000000104","Dr. Vignesh Babu","doctor--allopathy--dermatology","salem",7,"Skin, hair and allergy problems.",{"council":"Tamil Nadu Medical Council","reg_no":"TNMC-120877"}),
 ("919000000105","Dr. Selvi Murugan","doctor--siddha--general-siddha","tiruchirappalli",11,"Siddha medicine for long-term health problems.",{"council":"Tamil Nadu Board of Indian Medicine","reg_no":"TNBIM-S-4412"}),
 ("919000000106","Dr. Gopal Krishnan","doctor--dental--general-dentist","erode",10,"Tooth pain, cleaning and dental advice.",{"council":"Tamil Nadu State Dental Council","reg_no":"TNDC-22810"}),
 ("919000000107","Dr. Anitha Joseph","doctor--veterinary--pet-small-animal","chennai",8,"Vet for dogs and cats. Food, vaccines and illness.",{"council":"Tamil Nadu State Veterinary Council","reg_no":"TNSVC-3390"}),
 ("919000000108","Dr. Ravi Shankar","doctor--physiotherapy--orthopaedic-physio","coimbatore",6,"Back pain, neck pain and recovery after injury.",{"council":"Tamil Nadu Physiotherapy Council","reg_no":"TNPC-5521"}),
 ("919000000004","Adv. Lakshmi Narayanan","lawyer--family-divorce","chennai",14,"Family matters: marriage, divorce, custody and maintenance.",{"bar_council":"Bar Council of Tamil Nadu & Puducherry","enrolment_no":"MS/1234/2011"}),
 ("919000000109","Adv. Senthil Kumar","lawyer--civil","madurai",20,"Property, land and civil disputes.",{"bar_council":"Bar Council of Tamil Nadu & Puducherry","enrolment_no":"MS/0876/2005"}),
 ("919000000110","Adv. Kavitha Rajan","lawyer--consumer","coimbatore",9,"Consumer complaints and refunds.",{"bar_council":"Bar Council of Tamil Nadu & Puducherry","enrolment_no":"MS/2290/2016"}),
 ("919000000111","Adv. Ramesh Pandian","lawyer--cheque-bounce","tirunelveli",12,"Cheque bounce and money recovery cases.",{"bar_council":"Bar Council of Tamil Nadu & Puducherry","enrolment_no":"MS/1567/2013"}),
 ("919000000112","Er. Suresh Babu","engineer--civil--house-plan-review","chennai",16,"House plan review, cost estimates and site advice.",{"council":"Institution of Engineers (India)","reg_no":"IEI-M-150233"}),
 ("919000000113","Ar. Divya Shankar","engineer--architect","coimbatore",8,"Home design, elevation and Vastu-friendly plans.",{"council":"Council of Architecture","coa_no":"CA/2017/84512"}),
 ("919000000114","Er. Manikandan","engineer--electrical","vellore",10,"House wiring, solar and electrical safety.",{"council":"Institution of Engineers (India)","reg_no":"IEI-M-162045"}),
 ("919000000115","Er. Bharathi Rajendran","engineer--civil--estimate-boq","thanjavur",13,"Building estimates and BOQ checks.",{"council":"Institution of Engineers (India)","reg_no":"IEI-M-140876"}),
]
for i,(ph,name,node,dist,yrs,about,reg) in enumerate(W):
    uid = user(ph, name); lat,lng = D[dist]; lat += (i%3)*0.004; lng += (i%2)*0.004
    slug = N + node
    sql(f"""BEGIN; SELECT set_config('meiyiyal.trusted','on',true);
      INSERT INTO public.workers(user_id,category,primary_node,display_name,years_experience,about,reg_data,base_geog,district_slug,status,is_active,is_verified,submitted_at,decided_at,verified_at,is_online,last_seen_at,rating,total_reviews)
      VALUES ('{uid}','professional','{slug}',$${name}$$,{yrs},$${about}$$,$${json.dumps(reg)}$$::jsonb,ST_SetSRID(ST_MakePoint({lng},{lat}),4326)::geography,'{dist}','approved',true,true,now(),now(),now(),true,now(),{4.2+(i%8)/10:.1f},{5+i*3})
      ON CONFLICT (user_id) DO UPDATE SET status='approved',is_active=true,is_verified=true,is_online=true,last_seen_at=now();
      UPDATE public.workers SET badge_tier=public.badge_tier_for(primary_node,reg_data) WHERE user_id='{uid}';
      DELETE FROM public.worker_nodes WHERE worker_id=(SELECT id FROM public.workers WHERE user_id='{uid}');
      INSERT INTO public.worker_nodes(worker_id,node_slug,is_primary) SELECT id,'{slug}',true FROM public.workers WHERE user_id='{uid}';
      INSERT INTO public.user_roles(user_id,role) SELECT '{uid}','worker' WHERE NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id='{uid}' AND role='worker');
      INSERT INTO public.user_locations(user_id,label,address,district_slug,geog,source,is_current)
        SELECT '{uid}','Clinic','{dist.title()}','{dist}',ST_SetSRID(ST_MakePoint({lng},{lat}),4326)::geography,'pin',true
        WHERE NOT EXISTS (SELECT 1 FROM public.user_locations WHERE user_id='{uid}');
      COMMIT;""")
client = user("919876543210", "Bala Client")
client2 = user("919000000003", "Kumar Client")
admin = user("919000000002", "Bala Admin")
req("PUT", f"/auth/v1/admin/users/{admin}", {"email": "admin@test.meiyiyal.com", "email_confirm": True})
sql(f"INSERT INTO public.user_roles(user_id,role) SELECT '{admin}','admin' WHERE NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id='{admin}' AND role='admin')")
# keep the demo pros "available" (online + fresh heartbeat) every minute. The two pros you sign in as (9000000001 doctor,
# 9000000004 lawyer) are left alone so their own Go-online switch decides.
sql("""SELECT cron.schedule('demo-presence','* * * * *',$c$DO $b$ BEGIN PERFORM set_config('meiyiyal.trusted','on',true);
  UPDATE public.workers w SET is_online=true, last_seen_at=now() FROM auth.users u WHERE u.id=w.user_id AND u.phone LIKE '919000000%' AND u.phone <> '919000000001' AND u.phone <> '919000000004'; END $b$$c$)""")

def totp(secret, t=None):
    k = base64.b32decode(secret + "=" * (-len(secret) % 8)); c = int((t or time.time()) // 30)
    h = hmac.new(k, struct.pack(">Q", c), hashlib.sha1).digest(); o = h[-1] & 15
    return "%06d" % ((struct.unpack(">I", h[o:o+4])[0] & 0x7fffffff) % 1000000)

# admin authenticator: sign in with the fixed test OTP, enrol + verify a TOTP factor, print the secret (only once)
if sql(f"select count(*) from auth.mfa_factors where user_id='{admin}' and status='verified'") == "0":
    sql(f"delete from auth.mfa_factors where user_id='{admin}'")
    req("POST", "/auth/v1/otp", {"phone": "919000000002"}, key=ANON)
    tok = req("POST", "/auth/v1/verify", {"phone": "919000000002", "token": ADMIN_OTP, "type": "sms"}, key=ANON)["access_token"]
    f = req("POST", "/auth/v1/factors", {"factor_type": "totp", "friendly_name": "Test admin", "issuer": "Meiyiyal Test"}, key=ANON, token=tok)
    ch = req("POST", f"/auth/v1/factors/{f['id']}/challenge", {}, key=ANON, token=tok)
    req("POST", f"/auth/v1/factors/{f['id']}/verify", {"challenge_id": ch["id"], "code": totp(f["totp"]["secret"])}, key=ANON, token=tok)
    with open(TOTP_FILE, "w") as fh: fh.write(f["totp"]["secret"] + "\n" + f["totp"].get("uri", "") + "\n")
    print("admin authenticator key (add to Google Authenticator):", f["totp"]["secret"], "→ saved in", TOTP_FILE)
else:
    print("admin already has an authenticator factor; delete it in Dashboard → Authentication → Users to re-enrol")
print("workers:", sql("select count(*) from public.workers where status='approved'"), "admin:", admin, "client:", client, client2)
