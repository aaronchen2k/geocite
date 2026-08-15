'use client';

import {createContext, useCallback, useContext, useMemo, useState, type ReactNode} from 'react';

type ToastContextValue = {success: (message: string) => void; error: (message: string) => void};
type ToastItem = {id: number; message: string; tone: 'success' | 'error'};
const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({children}: {children: ReactNode}): React.JSX.Element {
  const [items, setItems] = useState<ToastItem[]>([]);
  const show = useCallback((message: string, tone: ToastItem['tone']) => {
    const id = Date.now();
    setItems((current) => [...current, {id, message, tone}]);
    window.setTimeout(() => setItems((current) => current.filter((item) => item.id !== id)), 3600);
  }, []);
  const value = useMemo(() => ({success: (message: string) => show(message, 'success'), error: (message: string) => show(message, 'error')}), [show]);
  return <ToastContext.Provider value={value}>{children}<div aria-live="polite" className="fixed right-5 top-5 z-[60] flex w-[min(24rem,calc(100vw-2.5rem))] flex-col gap-2">{items.map((item) => <div key={item.id} role="status" className={`rounded-lg border px-4 py-3 text-sm shadow-lg ${item.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`}>{item.message}</div>)}</div></ToastContext.Provider>;
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast 必须在 ToastProvider 内使用');
  return context;
}
