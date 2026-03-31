import { onRequest } from 'firebase-functions/v2/https';
import app from '../../server/src/app';

// Wrap the Express app as a Firebase Cloud Function.
// Firebase Admin SDK is initialized in server/src/config/firebase.ts using
// Application Default Credentials (ADC) when K_SERVICE env var is detected.
export const api = onRequest(
  {
    region: 'asia-south1',
    memory: '256MiB',
    timeoutSeconds: 60,
    cors: true,
  },
  app
);
