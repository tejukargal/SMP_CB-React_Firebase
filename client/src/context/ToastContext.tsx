import React, { createContext, useContext, useReducer, useCallback } from 'react';

export type ToastType = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastState {
  toasts: Toast[];
}

type ToastAction =
  | { type: 'ADD'; toast: Toast }
  | { type: 'REMOVE'; id: string };

function reducer(state: ToastState, action: ToastAction): ToastState {
  switch (action.type) {
    case 'ADD':
      return { toasts: [...state.toasts, action.toast] };
    case 'REMOVE':
      return { toasts: state.toasts.filter((t) => t.id !== action.id) };
  }
}

interface ToastContextValue {
  toasts: Toast[];
  addToast: (message: string, type?: ToastType) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { toasts: [] });

  const addToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = `${Date.now()}-${Math.random()}`;
    dispatch({ type: 'ADD', toast: { id, message, type } });
    setTimeout(() => dispatch({ type: 'REMOVE', id }), 4000);
  }, []);

  const removeToast = useCallback((id: string) => {
    dispatch({ type: 'REMOVE', id });
  }, []);

  return (
    <ToastContext.Provider value={{ toasts: state.toasts, addToast, removeToast }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
