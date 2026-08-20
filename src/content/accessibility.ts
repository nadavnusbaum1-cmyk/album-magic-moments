// =============================================================================
// ACCESSIBILITY (נגישות) — single source of truth for the accessibility widget
// labels AND the accessibility statement page (הצהרת נגישות), English + Hebrew.
//
// Israel requires web accessibility per Israeli Standard IS 5568 (based on
// WCAG 2.0 Level AA), under the Equal Rights for Persons with Disabilities Law,
// 5758-1998 and the Service Accessibility Adjustments Regulations, 5773-2013.
// Public-facing services must publish an accessibility statement with the
// contact details of an accessibility coordinator (רכז נגישות).
//
// ▶ BEFORE LAUNCH: fill in `coordinator.email` and `coordinator.phone` with your
//   dedicated accessibility contacts, and set `company` to your final site name.
//   Update `lastUpdated` whenever you review the statement.
// =============================================================================

export type Loc = { en: string; he: string };

export const coordinator = {
  company: "HeyMori", // ▶ set to your final site/brand name
  role: { en: "Accessibility Coordinator", he: "רכז/ת נגישות" } as Loc,
  email: "info@heymori.co.il",
  phone: "", // ▶ ADD a dedicated accessibility phone line
};

// Date the statement was last reviewed/updated (shown on the statement page).
export const lastUpdated: Loc = { en: "August 2026", he: "אוגוסט 2026" };

// ---- Accessibility widget (floating menu) labels ----------------------------
export const widgetUI = {
  open: { en: "Accessibility menu", he: "תפריט נגישות" },
  title: { en: "Accessibility", he: "נגישות" },
  close: { en: "Close", he: "סגירה" },
  fontSize: { en: "Text size", he: "גודל טקסט" },
  increase: { en: "Increase text", he: "הגדלת טקסט" },
  decrease: { en: "Decrease text", he: "הקטנת טקסט" },
  grayscale: { en: "Grayscale", he: "גווני אפור" },
  highContrast: { en: "High contrast", he: "ניגודיות גבוהה" },
  negative: { en: "Invert colors", he: "היפוך צבעים" },
  highlightLinks: { en: "Highlight links", he: "הדגשת קישורים" },
  readableFont: { en: "Readable font", he: "גופן קריא" },
  stopMotion: { en: "Stop animations", he: "עצירת אנימציות" },
  reset: { en: "Reset", he: "איפוס" },
  statementLink: { en: "Accessibility statement", he: "הצהרת נגישות" },
};

// ---- Accessibility statement page content -----------------------------------
const C = coordinator.company;

export const statement = {
  pageTitle: { en: "Accessibility Statement", he: "הצהרת נגישות" },

  intro: {
    en: `${C} (hereinafter: "the Company") believes in and promotes the right of every person to browse the internet and receive information in an equal, convenient and respectful manner. We invest significant effort in making our website (hereinafter: "the Site") accessible to people with disabilities, out of the belief that everyone deserves a full life, equal opportunity and independent access to information with dignity.`,
    he: `${C} (להלן: "החברה") מאמינה ומקדמת את זכותו של כל אדם לגלוש באינטרנט ולקבל מידע באופן שוויוני, נוח ומכבד. אנו משקיעים מאמצים רבים בהנגשת אתר האינטרנט שלנו (להלן: "האתר") עבור אנשים עם מוגבלויות, מתוך אמונה כי לכל אדם מגיעה הזכות לחיים מלאים, שוויון הזדמנויות ונגישות למידע באופן עצמאי ומכובד.`,
  },

  standardTitle: { en: "Site accessibility conformance", he: "התאמות הנגישות באתר" },
  standard: {
    en: "The Site complies with the Equal Rights for Persons with Disabilities (Service Accessibility Adjustments) Regulations, 5773-2013. The accessibility adjustments were made in line with the recommendations of Israeli Standard IS 5568 for web content accessibility at Level AA, and conform to the WCAG 2.0 guidelines of the international W3C organization.",
    he: "האתר עומד בדרישות תקנות שוויון זכויות לאנשים עם מוגבלות (התאמות נגישות לשירות), התשע\"ג-2013. התאמות הנגישות בוצעו על פי המלצות התקן הישראלי (ת\"י 5568) לנגישות תכנים באינטרנט ברמה AA, ובהתאם למסמך WCAG 2.0 של הארגון הבינלאומי W3C.",
  },

  featuresTitle: { en: "Accessibility adjustments made on the Site", he: "התאמות הנגישות שבוצעו באתר" },
  features: {
    en: [
      "Keyboard navigation: the Site supports full navigation by keyboard, including Tab, arrow keys, Enter, and Esc to exit menus and dialogs.",
      "Alternative text for images: meaningful images and icons include descriptive alternative text.",
      "Contrast adjustment: the Site offers grayscale, high-contrast and inverted-color display modes.",
      "Text enlargement: text can be enlarged using a dedicated button in the accessibility menu or via the browser.",
      "Semantic structure: the Site is built semantically, with clear headings and an ordered hierarchy for easier screen-reader navigation.",
      "Separation of content and design: styling is handled by separate CSS, allowing flexible presentation of the content.",
      "No flashing elements: flashing elements that could disturb certain users have been avoided.",
      "Accessible menus: menus are usable with a keyboard and a screen reader.",
      "Full accessibility widget: a dedicated menu lets each user personalize accessibility clearly and intuitively, on every page.",
    ],
    he: [
      "ניווט באמצעות מקלדת: האתר מאפשר ניווט מלא באמצעות מקלדת, כולל שימוש במקש Tab, מקשי החיצים, Enter ו-Esc ליציאה מתפריטים וחלונות.",
      "תיאור חלופי לתמונות: לתמונות ולאייקונים בעלי משמעות באתר קיים תיאור טקסטואלי חלופי.",
      "התאמת ניגודיות: האתר מציע מצבי תצוגה של גווני אפור, ניגודיות גבוהה והיפוך צבעים.",
      "הגדלת טקסט: ניתן להגדיל את הטקסט באתר באמצעות כפתור ייעודי בתפריט הנגישות או באמצעות הדפדפן.",
      "מבנה סמנטי: האתר בנוי בצורה סמנטית, עם כותרות ברורות ומדרג מסודר, המאפשר ניווט קל יותר עבור משתמשי קורא מסך.",
      "הפרדה בין תוכן לעיצוב: השימוש ב-CSS נפרד מאפשר גמישות בהצגת התוכן.",
      "הסרת הבהובים: הוסרו אלמנטים מהבהבים העלולים להפריע למשתמשים מסוימים.",
      "תפריטים נגישים: התפריטים באתר מותאמים לשימוש עם מקלדת וקורא מסך.",
      "תוסף נגישות מלא: תפריט ייעודי המאפשר התאמה אישית של נגישות לכל משתמש, בצורה ברורה ואינטואיטיבית, בכל עמודי האתר.",
    ],
  },

  browsersTitle: { en: "Supported browsers", he: "דפדפנים נתמכים" },
  browsers: {
    en: "The Site has been tested and found accessible and compatible with the common browsers — Chrome, Firefox, Safari and Edge — in their up-to-date versions, and is adapted for use on mobile phones. For the best experience with a screen reader, we recommend using the latest version of NVDA.",
    he: "האתר נבדק ונמצא נגיש ותואם לדפדפנים הנפוצים — Chrome, Firefox, Safari ו-Edge — בגרסאותיהם העדכניות, ומותאם לשימוש בטלפון נייד. לחוויית גלישה מיטבית עם תוכנת הקראת מסך, אנו ממליצים להשתמש בתוכנת NVDA העדכנית ביותר.",
  },

  limitationsTitle: { en: "Accessibility limitations", he: "מגבלות הנגישות" },
  limitations: {
    en: "Despite our efforts to make all pages of the Site accessible, some pages may not yet have been made accessible or may be found to be inaccessible — including photos and videos uploaded by event hosts and guests, which are user-generated content and may lack a text description. We are continuing our efforts to improve the Site's accessibility as much as possible.",
    he: "למרות מאמצינו להנגיש את כלל הדפים באתר, ייתכן שחלק מהדפים טרם הונגשו או שיימצאו בלתי נגישים — לרבות תמונות וסרטונים המועלים על ידי מארחי האירועים והאורחים, שהם תוכן משתמשים ולעיתים אינם כוללים תיאור טקסטואלי. אנו ממשיכים במאמצים לשפר את נגישות האתר ככל האפשר.",
  },

  feedbackTitle: { en: "Feedback and requests", he: "משוב ופניות" },
  feedback: {
    en: "We would be glad to receive your feedback on the Site's accessibility. Since the Site is updated on an ongoing basis, areas requiring further accessibility work may occasionally be discovered. If you encounter any accessibility problem or fault, please let us know and we will handle it as soon as possible.",
    he: "נשמח לקבל מכם משוב על נגישות האתר. מכיוון שהאתר מתעדכן באופן שוטף, ייתכן שיתגלו אזורים הדורשים מאמצי הנגשה נוספים. אם נתקלתם בבעיה או בתקלה כלשהי בנושא הנגישות, נודה לכם אם תעדכנו אותנו ונטפל בנושא בהקדם האפשרי.",
  },

  contactTitle: { en: "Accessibility coordinator", he: "רכז נגישות" },
  contactIntro: {
    en: "For accessibility requests, suggestions, or to receive information in an accessible format, please contact the Company's accessibility coordinator:",
    he: "לפניות, בקשות והצעות לשיפור בנושא נגישות, או לקבלת מידע בפורמט נגיש, ניתן ליצור קשר עם רכז/ת הנגישות של החברה:",
  },
  contactPending: {
    en: "Contact details will be published here shortly.",
    he: "פרטי הקשר יתעדכנו כאן בקרוב.",
  },
};
