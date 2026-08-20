// =============================================================================
// PLANS — single source of truth for pricing shown on the landing page AND the
// plan-selection page. Edit prices, the crossed-out "was" price, badges, and
// what's included / not included here. English + Hebrew side by side.
//
//   key        : internal plan id sent to the backend (do NOT rename: must stay
//                'free' | 'small' | 'wedding' | 'business' to match plan limits).
//   name/price : display text per language.
//   oldPrice   : optional crossed-out original price (for a discount look).
//   badge      : optional highlight, e.g. "Most popular".
//   features   : list shown on the card; `included: false` renders as struck-out.
// =============================================================================

export type Loc = { en: string; he: string };
export type PlanFeature = { text: Loc; included: boolean };
export type Plan = {
  key: "free" | "small" | "wedding" | "business";
  name: Loc;
  price: Loc;
  oldPrice?: Loc;
  badge?: Loc;
  features: PlanFeature[];
};

const feat = (en: string, he: string, included = true): PlanFeature => ({ text: { en, he }, included });

export const plans: Plan[] = [
  {
    key: "free",
    name: { en: "Demo", he: "דמו" },
    price: { en: "Free", he: "חינם" },
    features: [
      feat("Up to 50 photos", "עד 50 תמונות"),
      feat("1 event", "אירוע אחד"),
      feat("AI face recognition", "זיהוי פנים חכם"),
      feat("Guest photo uploads", "העלאות תמונות אורחים"),
feat("Priority support", "שמירה בענן למשך 12 חודשים", false),
      feat("Full-quality downloads", "הורדות באיכות מלאה", false),
      feat("Priority support", "תמיכה מועדפת", false),
    ],
  },
  {
    key: "small",
    name: { en: "Small event", he: "אירוע קטן" },
    price: { en: "₪299", he: "₪299" },
    oldPrice: { en: "₪349", he: "₪349" },
    features: [
      feat("Up to 1,000 photos", "עד 1,000 תמונות"),
      feat("1 event", "אירוע אחד"),
      feat("AI face recognition", "זיהוי פנים חכם"),
      feat("Guest photo uploads", "איסוף תמונות מהאורחים"),
feat("Priority support", "שמירה בענן למשך 12 חודשים"),
      feat("Full-quality downloads", "הורדות באיכות מלאה"),
      feat("Priority support", "תמיכה מועדפת"),
    ],
  },
  {
    key: "wedding",
    name: { en: "Wedding", he: "חתונה" },
    price: { en: "₪499", he: "₪499" },
    oldPrice: { en: "₪599", he: "₪599" },
    badge: { en: "Most popular", he: "הכי פופולרי" },
    features: [
      feat("Up to 10,000 photos", "עד 10,000 תמונות"),
      feat("1 event", "אירוע אחד"),
      feat("AI face recognition", "זיהוי פנים חכם"),
      feat("Guest photo uploads", "איסוף תמונות מהאורחים"),
feat("Priority support", "שמירה בענן למשך 12 חודשים"),
      feat("Full-quality downloads", "הורדות באיכות מלאה"),
      feat("Priority support", "תמיכה מועדפת"),
    ],
  },
  {
    key: "business",
    name: { en: "Photographer / Business", he: "צלם / עסק" },
    price: { en: "Custom", he: "בהתאמה" },
    features: [
      feat("Unlimited photos", "תמונות ללא הגבלה"),
      feat("Unlimited events", "אירועים ללא הגבלה"),
      feat("AI face recognition", "זיהוי פנים חכם"),
feat("Priority support", "שמירה בענן מותאם אישית"),
      feat("Custom branding", "מיתוג אישי"),
      feat("Priority support", "תמיכה מועדפת"),
    ],
  },
];
