// =============================================================================
// LANDING PAGE COPY — single source of truth, English + Hebrew side by side.
//
// To change the marketing site's wording, edit the `en` / `he` values below.
// Each entry is grouped by the section it appears in, so it's easy to find and
// to proofread both languages together. A read-only review table for a Hebrew
// grammar pass is generated at docs/landing-copy.md.
// =============================================================================

export type Bi = { en: string; he: string };

export const landingContent: Record<string, Bi> = {
  // ---------- Nav / brand ----------
  brand: { en: "Cheez", he: "Cheez" },
  nav_pricing: { en: "Pricing", he: "מחירים" },
  nav_signin: { en: "Sign in", he: "התחברות" },
  get_started: { en: "Get started", he: "בואו נתחיל" },

  // ---------- Hero ----------
  hero_badge: { en: "Photos + AI + your guests", he: "תמונות + AI + האורחים שלכם" },
  hero_title: { en: "Every photo from your event — found, shared, together.", he: "כל התמונות מהאירוע — במקום אחד." },
  hero_subtitle: {
    en: "Professional photos, AI face-matching, and the snapshots your guests took — in one beautiful shared album. Guests snap a selfie to find their photos, then add the moments they captured.",
    he: "תמונות מקצועיות, זיהוי פנים חכם, והתמונות שהאורחים צילמו — באלבום משותף אחד ויפה. אורחים מצלמים סלפי כדי למצוא את התמונות שלהם, ואז מוסיפים את הרגעים שתיעדו.",
  },
  hero_cta_secondary: { en: "How it works", he: "איך זה עובד" },

  // ---------- Trust bar ----------
  trust_ai: { en: "AI face recognition", he: "זיהוי פנים חכם" },
  trust_secure: { en: "Private & secure", he: "פרטי ומאובטח" },
  trust_noapp: { en: "No app needed", he: "ללא אפליקציה" },
  trust_unlimited: { en: "Unlimited guests", he: "אורחים ללא הגבלה" },

  // ---------- Three pillars ----------
  pillars_title: { en: "One album, three ways to remember", he: "אלבום אחד, אינסוף דרכים לזכור" },
  pillars_subtitle: {
    en: "Professional photography, AI personalization, and guest-generated content — combined into one complete memory of your event.",
    he: "צילום מקצועי, התאמה אישית עם AI, ותוכן מהאורחים — משולבים לזיכרון שלם אחד מהאירוע.",
  },
  pillar_official_title: { en: "Official photos", he: "תמונות רשמיות" },
  pillar_official_desc: { en: "Upload the photographer's photos in bulk — safely stored and beautifully presented.", he: "העלו את תמונות הצלם בכמות גדולה — נשמרות בבטחה ומוצגות יפה." },
  pillar_personal_title: { en: "Find your photos", he: "מצאו את התמונות שלכם" },
  pillar_personal_desc: { en: "Guests upload a selfie and AI instantly finds every photo they appear in.", he: "אורחים מעלים סלפי וה-AI מוצא מיד כל תמונה שהם מופיעים בה." },
  pillar_guest_title: { en: "Guest photos", he: "תמונות אורחים" },
  pillar_guest_desc: { en: "Everyone adds the moments they captured — the album grows from every angle.", he: "כולם מוסיפים את הרגעים שתיעדו — האלבום גדל מכל זווית." },

  // ---------- Use cases ----------
  uc_title: { en: "For every kind of event", he: "לכל סוג של אירוע" },
  uc_subtitle: { en: "Any occasion, any size.", he: "כל אירוע, בכל גודל." },
  uc_wedding: { en: "Weddings", he: "חתונות" },
  uc_corporate: { en: "Corporate", he: "אירועי חברה" },
  uc_race: { en: "Bar/Bat Mitzva", he: "בר/בת מצווה" },
  uc_school: { en: "Schools", he: "בתי ספר" },
  uc_party: { en: "Parties", he: "מסיבות" },
  uc_festival: { en: "Festivals", he: "פסטיבלים" },

  // ---------- How it works ----------
  how_title: { en: "How it works", he: "איך זה עובד" },
  step1_title: { en: "Create your event", he: "יצירת האירוע" },
  step1_desc: { en: "Set up your album in minutes.", he: "הקימו את האלבום בכמה דקות." },
  step2_title: { en: "Upload the photos", he: "העלאת התמונות" },
  step2_desc: { en: "Bulk-upload the professional shots.", he: "העלאה מרוכזת של התמונות המקצועיות." },
  step3_title: { en: "Share a link or QR", he: "שיתוף קישור או QR" },
  step3_desc: { en: "Guests open the album instantly.", he: "האורחים פותחים את האלבום מיד." },
  step4_title: { en: "Guests find & add", he: "אורחים מוצאים ומוסיפים" },
  step4_desc: { en: "Selfie to find their photos, and upload their own.", he: "סלפי כדי למצוא תמונות, והעלאת תמונות משלהם." },

  // ---------- Feature deep-dive ----------
  feat_title: { en: "Everything you need to share the memories", he: "כל מה שצריך כדי לשתף את הזיכרונות" },
  feat_subtitle: {
    en: "A complete album from everyone's perspective — the photographer's, the AI's, and every guest's.",
    he: "אלבום שלם מכל נקודות המבט — של הצלם, של ה-AI, ושל כל אורח.",
  },
  feat_face_title: { en: "AI face matching", he: "התאמת פנים עם AI" },
  feat_face_desc: { en: "Guests take a selfie and instantly get every photo they appear in.", he: "אורחים מצלמים סלפי ומקבלים מיד כל תמונה שהם מופיעים בה." },
  feat_guest_title: { en: "Guest uploads", he: "העלאות אורחים" },
  feat_guest_desc: { en: "Everyone contributes the moments they captured, right from their phone.", he: "כולם מוסיפים את הרגעים שתיעדו, ישירות מהטלפון." },
  feat_folder_title: { en: "Folders & sharing control", he: "תיקיות ושליטה בשיתוף" },
  feat_folder_desc: { en: "Organize photos into folders and choose exactly what's shared publicly.", he: "ארגנו תמונות בתיקיות ובחרו בדיוק מה משותף בציבור." },
  feat_download_title: { en: "Easy downloads", he: "הורדות בקלות" },
  feat_download_desc: { en: "Guests view and download their photos in full quality — no app required.", he: "אורחים צופים ומורידים את התמונות באיכות מלאה — ללא אפליקציה." },

  // ---------- Testimonials (PLACEHOLDER — replace with real quotes) ----------
  testi_title: { en: "Loved by hosts and photographers", he: "אהוב על מארגנים וצלמים" },
  testi_1_quote: { en: "Guests found their photos in seconds — everyone was blown away.", he: "האורחים מצאו את התמונות שלהם בשניות — כולם התלהבו." },
  testi_1_role: { en: "Wedding photographer", he: "צלם חתונות" },
  testi_2_quote: { en: "The guest uploads made our album feel complete, from every angle.", he: "העלאות האורחים גרמו לאלבום להרגיש שלם, מכל זווית." },
  testi_2_role: { en: "Event organizer", he: "מפיק אירועים" },
  testi_3_quote: { en: "Setup took minutes and the QR link made sharing effortless.", he: "ההקמה לקחה דקות והקישור עם ה-QR הפך את השיתוף לפשוט." },
  testi_3_role: { en: "Bride", he: "כלה" },

  // ---------- Pricing (PLACEHOLDER prices — set your real ones) ----------
  pricing_title: { en: "Simple pricing", he: "מחיר פשוט" },
  pricing_subtitle: { en: "Start free. Pay when you're ready to share.", he: "מתחילים בחינם. משלמים כשמוכנים לשתף." },
  most_popular: { en: "Most popular", he: "הכי פופולרי" },
  pricing_note: { en: "Prices shown are examples — final pricing coming soon.", he: "המחירים המוצגים הם לדוגמה — תמחור סופי בקרוב." },
  plan_starter_name: { en: "Starter", he: "התחלה" },
  plan_starter_price: { en: "Free", he: "חינם" },
  plan_starter_period: { en: "", he: "" },
  plan_starter_desc: { en: "Try it with a single event.", he: "התנסות באירוע אחד." },
  plan_event_name: { en: "Event", he: "אירוע" },
  plan_event_price: { en: "$49", he: "₪179" },
  plan_event_period: { en: "/ event", he: "/ אירוע" },
  plan_event_desc: { en: "Everything for one unforgettable event.", he: "כל מה שצריך לאירוע אחד בלתי נשכח." },
  plan_studio_name: { en: "Studio", he: "סטודיו" },
  plan_studio_price: { en: "Custom", he: "בהתאמה" },
  plan_studio_period: { en: "", he: "" },
  plan_studio_desc: { en: "For photographers & businesses.", he: "לצלמים ולעסקים." },
  pf_one_event: { en: "1 event", he: "אירוע אחד" },
  pf_unlimited_guests: { en: "Unlimited guests", he: "אורחים ללא הגבלה" },
  pf_face: { en: "AI face recognition", he: "זיהוי פנים חכם" },
  pf_guest_uploads: { en: "Guest photo uploads", he: "העלאות תמונות אורחים" },
  pf_everything_starter: { en: "Everything in Starter", he: "כל מה שבחבילת ההתחלה" },
  pf_downloads: { en: "Full-quality downloads", he: "הורדות באיכות מלאה" },
  pf_folders: { en: "Folders & sharing control", he: "תיקיות ושליטה בשיתוף" },
  pf_retention: { en: "Extended photo storage", he: "אחסון תמונות מורחב" },
  pf_multi_events: { en: "Multiple events", he: "אירועים מרובים" },
  pf_branding: { en: "Custom branding", he: "מיתוג אישי" },
  pf_priority: { en: "Priority support", he: "תמיכה מועדפת" },
  pf_custom: { en: "Custom pricing", he: "תמחור בהתאמה" },

  // ---------- FAQ ----------
  faq_title: { en: "Frequently asked questions", he: "שאלות נפוצות" },
  faq_q1: { en: "How does the face recognition work?", he: "איך עובד זיהוי הפנים?" },
  faq_a1: { en: "Guests take a quick selfie and our AI finds every photo they appear in — no manual tagging, no scrolling through thousands of images.", he: "אורחים מצלמים סלפי מהיר וה-AI מוצא כל תמונה שהם מופיעים בה — ללא תיוג ידני וללא גלילה באלפי תמונות." },
  faq_q2: { en: "Do guests need to install an app?", he: "האם האורחים צריכים להתקין אפליקציה?" },
  faq_a2: { en: "No. Everything runs in any web browser on mobile or desktop. Guests just open the link or scan the QR code.", he: "לא. הכול עובד בכל דפדפן, בנייד או במחשב. האורחים פשוט פותחים את הקישור או סורקים את ה-QR." },
  faq_q3: { en: "Can guests add their own photos?", he: "האם אורחים יכולים להוסיף תמונות משלהם?" },
  faq_a3: { en: "Yes. Guests can upload the photos they took, and you choose whether their photos appear in the shared album.", he: "כן. אורחים יכולים להעלות את התמונות שצילמו, ואתם בוחרים אם התמונות שלהם יופיעו באלבום המשותף." },
  faq_q4: { en: "Are the photos private and secure?", he: "האם התמונות פרטיות ומאובטחות?" },
  faq_a4: { en: "Albums are private and unlisted — accessible only by link and never indexed by search engines. Photos are stored securely on AWS.", he: "האלבומים פרטיים ולא רשומים — נגישים רק דרך קישור ולא מאונדקסים במנועי חיפוש. התמונות נשמרות בבטחה ב-AWS." },
  faq_q5: { en: "How do I share the album with guests?", he: "איך משתפים את האלבום עם האורחים?" },
  faq_a5: { en: "Share a link or QR code. Guests open it, take a selfie to find their photos, and can add their own.", he: "משתפים קישור או קוד QR. האורחים פותחים, מצלמים סלפי כדי למצוא את התמונות שלהם, ויכולים להוסיף תמונות משלהם." },

  // ---------- Final CTA + footer ----------
  final_title: { en: "Create your shared event album", he: "צרו את אלבום האירוע המשותף" },
  final_subtitle: { en: "Give every guest their photos — and let everyone add the moments they captured.", he: "תנו לכל אורח את התמונות שלו — ותנו לכולם להוסיף את הרגעים שתיעדו." },
  footer_rights: { en: "All rights reserved.", he: "כל הזכויות שמורות." },
};
