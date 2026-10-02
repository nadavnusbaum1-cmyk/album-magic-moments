// Lightweight gtag helpers. The base gtag.js loader and the Google Ads config
// (AW-18417038077) live in index.html; this just fires events from the app.
declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

const GOOGLE_ADS_ID = "AW-18417038077";

// Conversion label for the "Submit lead form" action. Get it from Google Ads →
// the conversion → "Tag setup / event snippet": it looks like
// gtag('event','conversion',{send_to:'AW-18417038077/AbC-dEf12'}) — the part
// AFTER the slash. (This is NOT the numeric "Conversion type ID".) Until it's
// filled in, the GA `generate_lead` event still fires but the Ads conversion
// does not — so set this before relying on it, and remove the old page-load
// trigger on /auth so the conversion isn't counted twice.
const LEAD_CONVERSION_LABEL = "";

/**
 * Fire a lead conversion — a sign-up or a contact-form submission.
 * Safe to call anytime: if gtag hasn't loaded (ad blocker, etc.) it's a no-op.
 */
export function trackLead(source: "signup" | "contact") {
  try {
    const g = window.gtag;
    if (typeof g !== "function") return;
    // Generic lead event (useful for GA4 / future analytics and reporting).
    g("event", "generate_lead", { event_source: source, value: 1, currency: "ILS" });
    // Google Ads conversion — only once the label above is configured.
    if (LEAD_CONVERSION_LABEL) {
      g("event", "conversion", { send_to: `${GOOGLE_ADS_ID}/${LEAD_CONVERSION_LABEL}`, value: 1, currency: "ILS" });
    }
  } catch {
    /* analytics must never break the app */
  }
}
