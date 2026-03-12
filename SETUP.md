# SMP Cash Book — Setup Guide

## Prerequisites
- Node.js 18+ and npm 9+
- A Firebase project

---

## 1. Firebase Project Setup

### 1a. Create Firebase project
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project (e.g. `smp-cashbook`)

### 1b. Enable Authentication
- Firebase Console → Authentication → Sign-in method → Email/Password → Enable
- Authentication → Users → Add User → enter your admin email + password

### 1c. Create Firestore Database
- Firebase Console → Firestore Database → Create database → Start in production mode
- Choose a region close to you

### 1d. Set Firestore Security Rules
Go to Firestore → Rules and paste:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read: if request.auth != null;
      allow write: if false; // all writes go through the backend
    }
  }
}
```

### 1e. Get Web App Config (for client)
- Firebase Console → Project Settings → Your apps → Add app → Web
- Copy the `firebaseConfig` object values

### 1f. Get Service Account (for server)
- Firebase Console → Project Settings → Service Accounts → Generate new private key
- Download the JSON file

---

## 2. Environment Configuration

### Server (`server/.env`)
```
PORT=3001
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxx@your-project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_KEY\n-----END PRIVATE KEY-----\n"
```
> Copy `private_key`, `client_email`, `project_id` from the service account JSON.
> Keep the `\n` escape sequences in the private key as-is (the server handles `\\n` → `\n`).

### Client (`client/.env`)
```
VITE_API_BASE_URL=http://localhost:3001
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

---

## 3. Install & Run

```bash
# Install all dependencies (from repo root)
npm install

# Start both server + client in dev mode
npm run dev
```

- **Server** → http://localhost:3001
- **Client** → http://localhost:5173

---

## 4. First Use

1. Open http://localhost:5173
2. Sign in with the admin email + password you created in Firebase Auth
3. Go to **Settings** to configure your Financial Years and active Cash Book Type
4. Go to **Cash Book** to start adding entries

---

## Project Structure

```
/shared      TypeScript types and utilities (shared between client + server)
/server      Express API (Firebase Admin SDK)
/client      React + Vite + TailwindCSS frontend
```
