import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import { firebaseAuth } from '@/firebase';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  getIdToken: () => Promise<string>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(firebaseAuth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  async function signIn(email: string, password: string) {
    await signInWithEmailAndPassword(firebaseAuth, email, password);
  }

  async function logout() {
    await signOut(firebaseAuth);
  }

  async function getIdToken(): Promise<string> {
    if (!user) throw new Error('Not authenticated');
    return user.getIdToken();
  }

  return (
    <AuthContext.Provider value={{ user, loading, signIn, logout, getIdToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
