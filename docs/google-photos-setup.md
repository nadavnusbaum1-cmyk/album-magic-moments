# Google Photos import — setup

Lets hosts import photos (e.g. a photographer's shared album they've saved to
their Google Photos) straight into an event, via Google's **Picker API**.

The code is already built and deployed but **inert until you set the client id**.
Two things are required: a Google OAuth client, and Google's app verification.

## 1. Google Cloud project

1. https://console.cloud.google.com → create/select a project.
2. **APIs & Services → Library** → enable **Photos Picker API**.
3. **APIs & Services → OAuth consent screen**:
   - User type: **External**.
   - App name **HeyMori**, support email, logo, app domain `https://heymori.co.il`,
     privacy policy `https://heymori.co.il/legal`.
   - **Scopes** → add `https://www.googleapis.com/auth/photospicker.mediaitems.readonly`.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Type: **Web application**.
   - **Authorized JavaScript origins**: `https://heymori.co.il`, `https://www.heymori.co.il`,
     `http://localhost:8080` (for dev).
   - Save and copy the **Client ID** (looks like `xx….apps.googleusercontent.com`).

## 2. Configure the app

Set the client id as a build-time env var (Vercel → Project → Settings →
Environment Variables), then redeploy the frontend:

```
VITE_GOOGLE_CLIENT_ID=<your-client-id>.apps.googleusercontent.com
```

No backend secret is needed — the `gphotos` edge function only proxies the
short-lived token the browser obtains. Once the var is present, an **"Import from
Google Photos"** button appears in the event Upload tab.

## 3. Verification (the long pole)

`photospicker.mediaitems.readonly` is a **sensitive scope**, so for public use
Google requires **OAuth app verification** (consent-screen review; sometimes a
demo video). Until approved:
- Add yourself + testers under **OAuth consent screen → Test users** (up to ~100)
  to use it immediately while in "Testing".
- Submit for verification early — review can take days to a few weeks.

## How it works (reference)

Browser gets a token via Google Identity Services → `gphotos` proxy creates a
Picker **session** → user selects photos in Google's picker → we poll the session,
list the picked items, and download them through the proxy → the files flow into
the normal upload pipeline (renditions, HEIC conversion, S3, face matching).

Notes:
- Only items the user explicitly picks are ever accessible (Library API deep
  access was retired in 2025).
- `baseUrl` downloads are restricted server-side to Google hosts.
