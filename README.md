# Wedding Moments Shared

please create for me an app that create a personalized album of the wedding for the guests so each guest will get his own photos only based on a selfir that he will upload. PROMPT: WhatsApp-Based Wedding Personal Album App

Build a system that creates personalized wedding photo albums for each guest, where all interaction happens through WhatsApp.

🧩 Core Flow

1. Guest Entry Point

 Each guest receives:

 QR code OR link → opens WhatsApp chat with the bot

 Pre-filled message like:

 “Hi, I’m joining Nadav & Maya’s wedding”

2. Selfie Collection (via WhatsApp)

 Bot responds:

 “Send me a selfie so I can find you in the event photos 📸”

 User uploads image directly in WhatsApp

 Backend:

 Stores image

 Extracts face embedding

3. Photo Collection (Event Photos)

 Photos come from:

 Photographer uploads (bulk)

 Guests send images to WhatsApp bot

 System stores all images in cloud

4. Face Recognition Engine

 For every uploaded image:

 Detect faces

 Match against guest selfies

 Build mapping:

 guest_id → list of images

5. Personal Album Delivery (via WhatsApp)

 After processing:

 Bot sends message:

 “We found 42 photos of you 🎉”

 Includes:

 Link to personal gallery (web)

 OR carousel-style images (batch messages)

6. Real-Time Updates

 Whenever new photos are found:

 Bot sends:

 “+5 new photos of you just added 👀”

7. Personal Album Web View

 Mobile optimized page:

 Grid gallery

 Download all

 Share buttons

 No login required (magic token link)

⚙️ Tech Stack

Messaging Layer

WhatsApp Business API
OR

Twilio WhatsApp API

Backend

 Node.js / Python (FastAPI)

 Queue system (for image processing)

AI / Vision

Amazon Rekognition
OR

Google Cloud Vision AI
OR custom FaceNet

Storage

 AWS S3 / Firebase Storage

Database

 PostgreSQL / Firestore

🧠 Smart Features (Highly Recommended)

 Best photo selection (no blurry shots)

 Auto highlight message:

 “Your best moment from the night 💃”

 Group detection:

 “Photos with your friends”

 AI-generated mini video per guest

⚡ UX Copy (IMPORTANT)

Bot tone:

 Fun, short, human

Examples:

 “Send me a selfie and I’ll do the magic ✨”

 “Found you dancing in 12 pics already 🕺”

 “You were BUSY last night 😄 58 photos found”

🛠️ Admin Dashboard

 Upload photos

 See matching progress

 Trigger re-scan

 Download all albums

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://album-magic-moments.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/13acbd12-0acf-4a84-8474-cfef04070b83).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
