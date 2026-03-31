import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

if (!admin.apps.length) {
  if (
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  ) {
    // Explicit credentials available (local dev / Netlify Functions)
    const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey,
      }),
    });
  } else {
    // No explicit credentials — use Application Default Credentials.
    // Firebase Cloud Functions (v2) provide ADC automatically via the runtime
    // service account, so no manual credential config is needed.
    admin.initializeApp();
  }
}

export const db = admin.firestore();
export const auth = admin.auth();
export default admin;
