import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export type Lang = "en" | "he";

const dict: Record<Lang, Record<string, string>> = {
  en: {
    // Tabs
    upload: "Upload",
    photos: "Photos",
    review: "Review",
    people: "People",
    share: "Share",
    settings: "Settings",
    // Common
    save: "Save",
    cancel: "Cancel",
    delete: "Delete",
    refresh: "Refresh",
    loading: "Loading…",
    // Settings
    language: "Language",
    english: "English",
    hebrew: "עברית",
    event_name: "Event name",
    event_date: "Event date",
    cover_image: "Cover image",
    cover_image_hint: "Upload an image, paste a URL, or pick one of your photos with the ⭐ icon.",
    upload_image: "Upload image",
    paste_url: "Or paste a URL",
    show_people_title: 'Show "People" section',
    show_people_desc: "Browse-by-person tiles on the public album",
    show_all_photos_title: 'Show "All photos" link',
    show_all_photos_desc: 'A "View full album" button below People',
    allow_guest_title: "Allow guest uploads",
    allow_guest_desc: "Guests can add photos from the public album page",
    published_title: "Published",
    published_desc: "Public URL is live",
    // Dashboard
    all_events: "All events",
    dashboard: "Dashboard",
    // Misc
    saved: "Saved",
    saving: "Saving…",
    uploading: "Uploading…",
  },
  he: {
    upload: "העלאה",
    photos: "תמונות",
    review: "בדיקה",
    people: "אנשים",
    share: "שיתוף",
    settings: "הגדרות",
    save: "שמירה",
    cancel: "ביטול",
    delete: "מחיקה",
    refresh: "רענון",
    loading: "טוען…",
    language: "שפה",
    english: "English",
    hebrew: "עברית",
    event_name: "שם האירוע",
    event_date: "תאריך האירוע",
    cover_image: "תמונת שער",
    cover_image_hint: "העלה תמונה, הדבק קישור, או בחר אחת מהתמונות עם סמל ה-⭐.",
    upload_image: "העלאת תמונה",
    paste_url: "או הדבק קישור",
    show_people_title: 'הצג מקטע "אנשים"',
    show_people_desc: "אריחי אנשים באלבום הציבורי",
    show_all_photos_title: 'הצג קישור "כל התמונות"',
    show_all_photos_desc: 'כפתור "צפה באלבום המלא" מתחת לאנשים',
    allow_guest_title: "אפשר העלאות אורחים",
    allow_guest_desc: "אורחים יכולים להוסיף תמונות מדף האלבום הציבורי",
    published_title: "פורסם",
    published_desc: "הקישור הציבורי פעיל",
    all_events: "כל האירועים",
    dashboard: "לוח הבקרה",
    saved: "נשמר",
    saving: "שומר…",
    uploading: "מעלה…",
  },
};

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (k: string) => string; dir: "ltr" | "rtl" };
const LangCtx = createContext<Ctx | null>(null);

const STORAGE_KEY = "app:lang";

function applyToDocument(l: Lang) {
  const dir = l === "he" ? "rtl" : "ltr";
  document.documentElement.lang = l;
  document.documentElement.dir = dir;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Lang | null;
    return saved === "he" || saved === "en" ? saved : "en";
  });

  useEffect(() => {
    applyToDocument(lang);
  }, [lang]);

  const setLang = (l: Lang) => {
    localStorage.setItem(STORAGE_KEY, l);
    setLangState(l);
  };

  const t = (k: string) => dict[lang][k] ?? dict.en[k] ?? k;
  const dir: "ltr" | "rtl" = lang === "he" ? "rtl" : "ltr";

  return <LangCtx.Provider value={{ lang, setLang, t, dir }}>{children}</LangCtx.Provider>;
}

export function useI18n() {
  const ctx = useContext(LangCtx);
  if (!ctx) throw new Error("useI18n must be used inside LanguageProvider");
  return ctx;
}
