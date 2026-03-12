import axios from 'axios';
import { firebaseAuth } from '@/firebase';
import { signOut } from 'firebase/auth';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001',
  timeout: 15000,
});

// Attach Firebase ID token to every request
apiClient.interceptors.request.use(async (config) => {
  const user = firebaseAuth.currentUser;
  if (user) {
    // false = use cached token; only fetches new one when < 5 min remaining
    const token = await user.getIdToken(false);
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Extract readable error message; sign out on 401
apiClient.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (err.response?.status === 401) {
      await signOut(firebaseAuth);
      window.location.href = '/login';
      return Promise.reject(err);
    }
    // Surface the server's error message if available
    const serverMsg: string | undefined =
      err.response?.data?.error ?? err.response?.data?.message;
    if (serverMsg) {
      err.message = serverMsg;
    } else if (err.code === 'ECONNABORTED') {
      err.message = 'Request timed out. Check your connection and try again.';
    } else if (!err.response) {
      err.message = 'Cannot reach the server. Check your connection.';
    }
    return Promise.reject(err);
  }
);

export default apiClient;
