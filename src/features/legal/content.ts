// DRAFT legal text. Not reviewed by a lawyer. Bala must get both documents reviewed (DPDP Act 2023 + DPDP Rules 2025,
// IT Act 2000, Consumer Protection (E-Commerce) Rules 2020, Telemedicine Practice Guidelines 2020) before launch.
export type LegalDoc = { title: string; updated: string; sections: { h: string; p: string[] }[] };
type Lang = "en" | "ta";

export const LEGAL_VERSION = "draft-2026-10-19";

export function grievanceOfficer() {
  const env = import.meta.env;
  return {
    name: (env.VITE_GRIEVANCE_NAME as string) || "",
    email: (env.VITE_GRIEVANCE_EMAIL as string) || "",
    phone: (env.VITE_GRIEVANCE_PHONE as string) || "",
    address: (env.VITE_GRIEVANCE_ADDRESS as string) || "",
  };
}

const privacyEn: LegalDoc = { title: "Privacy policy", updated: "19 October 2026 (draft)", sections: [
  { h: "Who we are", p: ["Meiyiyal (meiyiyal.com) connects people in Tamil Nadu with verified doctors, veterinarians, lawyers and engineers for chat, voice and video consultations. For the Digital Personal Data Protection Act, 2023, the operator of Meiyiyal is the Data Fiduciary."] },
  { h: "What we collect", p: [
    "Account: phone number or email, name, language and theme preferences.",
    "Location: the address or GPS point you choose, used to show professionals near you. You can change or remove it at any time.",
    "Consultations: messages, files and voice notes you send, call duration and the feedback you give. We do not record audio or video calls.",
    "Payments: wallet top-ups, consultation charges and refunds. Card or UPI details are handled by our payment partner (Razorpay) and never reach our servers.",
    "Professionals also give identity (Aadhaar via a licensed KYC partner, stored only as a masked reference), council registration, documents, a selfie for the face match, and bank or UPI details for payouts.",
  ] },
  { h: "Why we use it", p: ["To run your account, match you with professionals, carry out consultations, take payments and pay professionals, verify professionals, keep the service safe (fraud and abuse checks) and meet legal duties such as tax records. We do not sell your data and we do not use it for third-party advertising."] },
  { h: "Who we share it with", p: ["Only service providers that run parts of the service for us: hosting and database (Supabase, Mumbai region), payments (Razorpay), SMS (MSG91), identity checks (our KYC partner), maps (Google Maps or OpenStreetMap) and call relays. The professional you consult sees your name and what you share in that consultation. We share data with authorities only when the law requires it."] },
  { h: "How long we keep it", p: ["Account data stays while your account is open. The raw selfie a professional takes for the face match is deleted after 30 days; the portrait they consent to show stays on their profile. When you delete your account we remove or anonymise your personal data within the grace period shown in the app. Payment and tax records are kept for the period the law requires (generally 8 years), linked to an anonymous id."] },
  { h: "Your rights", p: ["You can see and download a copy of your data (Settings → Your data → Download), correct it in your profile, withdraw consent by deleting your account (Settings → Your data → Delete account), and nominate someone to act for you. You can complain to our Grievance Officer below; if you are not satisfied you can approach the Data Protection Board of India."] },
  { h: "Children", p: ["You must be 18 or older to create an account. A parent or guardian can book a consultation for a child from their own account."] },
  { h: "Security", p: ["Data is encrypted in transit, stored in India, and protected by row-level access rules so each person sees only their own records. Admin access needs two-factor sign-in and every admin action is logged."] },
  { h: "Changes", p: ["We will tell you in the app before an important change to this policy takes effect."] },
] };

const privacyTa: LegalDoc = { title: "தனியுரிமைக் கொள்கை", updated: "19 அக்டோபர் 2026 (வரைவு)", sections: [
  { h: "நாங்கள் யார்", p: ["மெய்யியல் (meiyiyal.com) தமிழ்நாட்டில் உள்ள மக்களைச் சரிபார்க்கப்பட்ட மருத்துவர்கள், கால்நடை மருத்துவர்கள், வழக்கறிஞர்கள், பொறியாளர்களுடன் அரட்டை, குரல், வீடியோ ஆலோசனைக்காக இணைக்கிறது. டிஜிட்டல் தனிநபர் தரவுப் பாதுகாப்புச் சட்டம், 2023-இன்படி மெய்யியலை இயக்குபவரே தரவுப் பொறுப்பாளர் (Data Fiduciary)."] },
  { h: "நாங்கள் சேகரிப்பவை", p: [
    "கணக்கு: தொலைபேசி எண் அல்லது மின்னஞ்சல், பெயர், மொழி மற்றும் தோற்ற விருப்பங்கள்.",
    "இருப்பிடம்: அருகிலுள்ள நிபுணர்களைக் காட்ட நீங்கள் தேர்ந்தெடுக்கும் முகவரி அல்லது GPS புள்ளி. எப்போது வேண்டுமானாலும் மாற்றலாம் அல்லது நீக்கலாம்.",
    "ஆலோசனைகள்: நீங்கள் அனுப்பும் செய்திகள், கோப்புகள், குரல் குறிப்புகள், அழைப்பு நேரம், நீங்கள் தரும் கருத்து. குரல்/வீடியோ அழைப்புகளை நாங்கள் பதிவு செய்வதில்லை.",
    "கட்டணங்கள்: வாலட் நிரப்புதல், ஆலோசனைக் கட்டணம், பணத்திருப்பம். அட்டை/UPI விவரங்களை எங்கள் கட்டணக் கூட்டாளர் (Razorpay) கையாளுகிறது; அவை எங்கள் சேவையகத்துக்கு வருவதில்லை.",
    "நிபுணர்கள் அடையாளம் (உரிமம் பெற்ற KYC கூட்டாளர் மூலம் ஆதார், மறைக்கப்பட்ட குறிப்பாக மட்டும் சேமிக்கப்படும்), கவுன்சில் பதிவு, ஆவணங்கள், முகப் பொருத்தத்துக்கான செல்ஃபி, பணம் பெற வங்கி/UPI விவரங்களையும் தருகிறார்கள்.",
  ] },
  { h: "ஏன் பயன்படுத்துகிறோம்", p: ["உங்கள் கணக்கை இயக்க, நிபுணர்களுடன் இணைக்க, ஆலோசனைகளை நடத்த, கட்டணம் பெற்று நிபுணர்களுக்குச் செலுத்த, நிபுணர்களைச் சரிபார்க்க, சேவையைப் பாதுகாக்க (மோசடி/தவறான பயன்பாட்டுச் சோதனை), வரிப் பதிவுகள் போன்ற சட்டக் கடமைகளை நிறைவேற்ற. உங்கள் தரவை விற்பதில்லை; மூன்றாம் தரப்பு விளம்பரத்துக்குப் பயன்படுத்துவதில்லை."] },
  { h: "யாருடன் பகிர்கிறோம்", p: ["எங்களுக்காகச் சேவையின் பகுதிகளை இயக்கும் சேவை வழங்குநர்களுடன் மட்டும்: ஹோஸ்டிங் மற்றும் தரவுத்தளம் (Supabase, மும்பை), கட்டணம் (Razorpay), SMS (MSG91), அடையாளச் சோதனை (KYC கூட்டாளர்), வரைபடம் (Google Maps அல்லது OpenStreetMap), அழைப்பு ரிலே. நீங்கள் ஆலோசிக்கும் நிபுணர் உங்கள் பெயரையும் அந்த ஆலோசனையில் நீங்கள் பகிர்வதையும் பார்ப்பார். சட்டம் கோரும்போது மட்டும் அதிகாரிகளுடன் பகிர்வோம்."] },
  { h: "எவ்வளவு காலம் வைத்திருப்போம்", p: ["கணக்கு திறந்திருக்கும் வரை கணக்குத் தரவு இருக்கும். முகப் பொருத்தத்துக்காக நிபுணர் எடுக்கும் செல்ஃபி 30 நாளில் நீக்கப்படும்; காட்ட ஒப்புக்கொண்ட புகைப்படம் சுயவிவரத்தில் இருக்கும். கணக்கை நீக்கினால், செயலியில் காட்டப்படும் காத்திருப்புக் காலத்துக்குள் உங்கள் தனிப்பட்ட தரவை நீக்குவோம் அல்லது அடையாளம் தெரியாததாக்குவோம். கட்டண, வரிப் பதிவுகள் சட்டம் கோரும் காலம் (பொதுவாக 8 ஆண்டுகள்) அடையாளமற்ற எண்ணுடன் வைக்கப்படும்."] },
  { h: "உங்கள் உரிமைகள்", p: ["உங்கள் தரவின் நகலைப் பார்த்துப் பதிவிறக்கலாம் (அமைப்புகள் → உங்கள் தரவு → பதிவிறக்கு), சுயவிவரத்தில் திருத்தலாம், கணக்கை நீக்கி ஒப்புதலைத் திரும்பப் பெறலாம் (அமைப்புகள் → உங்கள் தரவு → கணக்கை நீக்கு), உங்களுக்காகச் செயல்பட ஒருவரை நியமிக்கலாம். கீழே உள்ள குறைதீர் அலுவலரிடம் புகார் செய்யலாம்; திருப்தி இல்லையெனில் இந்தியத் தரவுப் பாதுகாப்பு வாரியத்தை அணுகலாம்."] },
  { h: "குழந்தைகள்", p: ["கணக்கு தொடங்க 18 வயது நிறைந்திருக்க வேண்டும். பெற்றோர் அல்லது பாதுகாவலர் தங்கள் கணக்கிலிருந்து குழந்தைக்காக ஆலோசனை பதிவு செய்யலாம்."] },
  { h: "பாதுகாப்பு", p: ["தரவு பரிமாற்றத்தில் குறியாக்கம் செய்யப்படுகிறது, இந்தியாவில் சேமிக்கப்படுகிறது; ஒவ்வொருவரும் தங்கள் பதிவுகளை மட்டும் பார்க்கும் அணுகல் விதிகள் உள்ளன. நிர்வாக அணுகலுக்கு இரு-படி உள்நுழைவு தேவை; ஒவ்வொரு நிர்வாகச் செயலும் பதிவு செய்யப்படுகிறது."] },
  { h: "மாற்றங்கள்", p: ["இந்தக் கொள்கையில் முக்கிய மாற்றம் நடைமுறைக்கு வரும் முன் செயலியில் தெரிவிப்போம்."] },
] };

const termsEn: LegalDoc = { title: "Terms of use", updated: "19 October 2026 (draft)", sections: [
  { h: "The service", p: ["Meiyiyal is a platform that connects you with independent professionals. The professional, not Meiyiyal, is responsible for the advice they give. Meiyiyal is not for emergencies: for a medical emergency call 108, for police 100."] },
  { h: "Your account", p: ["You must be 18 or older, give true details and keep your sign-in private. One person, one account."] },
  { h: "Professionals", p: ["Professionals must hold a valid registration with their council (medical, veterinary, physiotherapy, bar or engineering body) and pass identity checks before they can take consultations. They must follow their profession's code of conduct and, for doctors, the Telemedicine Practice Guidelines 2020."] },
  { h: "Payments and refunds", p: ["Consultations are charged per minute from your wallet at the rate shown before you start. Unused top-up money can be refunded to the original payment method on request. Promotional bonus credits cannot be refunded and expire after the period shown in your wallet. Professionals are paid weekly, after the platform commission and applicable taxes."] },
  { h: "Fair use", p: ["Do not harass anyone, share unlawful content, try to take consultations off the platform to avoid fees, or misuse the service. We can suspend accounts that break these terms."] },
  { h: "Deleting your account", p: ["You can delete your account from Settings. Deletion happens after a short grace period during which you can cancel. It waits until any active consultation, payout or unpaid earnings are settled. Wallet money left at deletion is lost unless you ask for a refund first."] },
  { h: "Liability", p: ["To the extent the law allows, Meiyiyal's liability for a consultation is limited to the amount you paid for it."] },
  { h: "Law and disputes", p: ["These terms are governed by Indian law. Courts in Chennai, Tamil Nadu have jurisdiction. Please contact the Grievance Officer first; we aim to reply within 48 hours and resolve within 30 days."] },
] };

const termsTa: LegalDoc = { title: "பயன்பாட்டு விதிமுறைகள்", updated: "19 அக்டோபர் 2026 (வரைவு)", sections: [
  { h: "சேவை", p: ["மெய்யியல் உங்களைச் சுயாதீன நிபுணர்களுடன் இணைக்கும் தளம். அவர்கள் தரும் ஆலோசனைக்கு நிபுணரே பொறுப்பு, மெய்யியல் அல்ல. அவசரநிலைக்கு மெய்யியல் அல்ல: மருத்துவ அவசரத்துக்கு 108, காவல்துறைக்கு 100 அழையுங்கள்."] },
  { h: "உங்கள் கணக்கு", p: ["18 வயது நிறைந்திருக்க வேண்டும், உண்மையான விவரங்களைத் தர வேண்டும், உள்நுழைவை ரகசியமாக வைக்க வேண்டும். ஒருவருக்கு ஒரு கணக்கு."] },
  { h: "நிபுணர்கள்", p: ["ஆலோசனை வழங்கும் முன் நிபுணர்கள் தங்கள் கவுன்சிலில் (மருத்துவம், கால்நடை மருத்துவம், இயன்முறை மருத்துவம், வழக்கறிஞர் அல்லது பொறியியல் அமைப்பு) செல்லுபடியாகும் பதிவு பெற்றிருக்க வேண்டும், அடையாளச் சோதனையில் தேற வேண்டும். தங்கள் தொழில் நடத்தை விதிகளையும், மருத்துவர்கள் தொலைமருத்துவ வழிகாட்டுதல்கள் 2020-ஐயும் பின்பற்ற வேண்டும்."] },
  { h: "கட்டணமும் பணத்திருப்பமும்", p: ["தொடங்கும் முன் காட்டப்படும் விகிதத்தில் நிமிடத்துக்கு உங்கள் வாலட்டிலிருந்து கட்டணம் எடுக்கப்படும். பயன்படுத்தாத நிரப்புத் தொகையைக் கோரிக்கையின் பேரில் அசல் கட்டண முறைக்குத் திருப்பித் தரலாம். ஊக்கப் போனஸ் கிரெடிட்டைத் திருப்பித் தர இயலாது; வாலட்டில் காட்டப்படும் காலத்துக்குப் பின் காலாவதியாகும். தளக் கமிஷன், பொருந்தும் வரிகளுக்குப் பின் நிபுணர்களுக்கு வாரந்தோறும் செலுத்தப்படும்."] },
  { h: "நியாயமான பயன்பாடு", p: ["யாரையும் துன்புறுத்தாதீர்கள், சட்டவிரோத உள்ளடக்கத்தைப் பகிராதீர்கள், கட்டணத்தைத் தவிர்க்க ஆலோசனையைத் தளத்துக்கு வெளியே கொண்டு செல்லாதீர்கள், சேவையைத் தவறாகப் பயன்படுத்தாதீர்கள். இவற்றை மீறும் கணக்குகளை இடைநிறுத்தலாம்."] },
  { h: "கணக்கை நீக்குதல்", p: ["அமைப்புகளிலிருந்து கணக்கை நீக்கலாம். ரத்து செய்யக்கூடிய குறுகிய காத்திருப்புக் காலத்துக்குப் பின் நீக்கம் நடக்கும். நடப்பு ஆலோசனை, பணப்பரிமாற்றம் அல்லது செலுத்தப்படாத வருவாய் தீரும் வரை காத்திருக்கும். நீக்கும்போது வாலட்டில் மீதமுள்ள பணம், முன்பே பணத்திருப்பம் கேட்காவிட்டால் இழக்கப்படும்."] },
  { h: "பொறுப்பு", p: ["சட்டம் அனுமதிக்கும் அளவுக்கு, ஒரு ஆலோசனைக்கான மெய்யியலின் பொறுப்பு அதற்கு நீங்கள் செலுத்திய தொகைக்குள் மட்டுமே."] },
  { h: "சட்டமும் தகராறுகளும்", p: ["இந்த விதிமுறைகள் இந்தியச் சட்டத்துக்கு உட்பட்டவை. சென்னை, தமிழ்நாடு நீதிமன்றங்களுக்கு அதிகார வரம்பு உண்டு. முதலில் குறைதீர் அலுவலரைத் தொடர்பு கொள்ளுங்கள்; 48 மணி நேரத்தில் பதிலளித்து 30 நாளில் தீர்க்க முயல்வோம்."] },
] };

export function legalDoc(kind: "privacy" | "terms", lang: Lang): LegalDoc {
  if (kind === "privacy") return lang === "ta" ? privacyTa : privacyEn;
  return lang === "ta" ? termsTa : termsEn;
}
