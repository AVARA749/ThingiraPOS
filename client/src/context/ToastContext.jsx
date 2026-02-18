import React, { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);

    const addToast = useCallback((message, type = 'success', duration = 3000) => {
        const id = Date.now() + Math.random();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
    }, []);

    const success = useCallback((msg) => addToast(msg, 'success'), [addToast]);
    const error = useCallback((msg) => addToast(msg, 'error', 5000), [addToast]);
    const warning = useCallback((msg) => addToast(msg, 'warning', 4000), [addToast]);
    const info = useCallback((msg) => addToast(msg, 'info'), [addToast]);

    return (
        <ToastContext.Provider value={{ success, error, warning, info }}>
            {children}
            {/* Toast Container */}
            <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm">
                {toasts.map(t => (
                    <div key={t.id} className={`animate-slide-in px-4 py-3 rounded-xl shadow-2xl border flex items-center gap-3 text-sm font-medium ${t.type === 'success' ? 'bg-green-900/90 border-green-500/40 text-green-200' :
                            t.type === 'error' ? 'bg-red-900/90 border-red-500/40 text-red-200' :
                                t.type === 'warning' ? 'bg-yellow-900/90 border-yellow-500/40 text-yellow-200' :
                                    'bg-blue-900/90 border-blue-500/40 text-blue-200'
                        }`}>
                        <span>{t.type === 'success' ? '✓' : t.type === 'error' ? '✗' : t.type === 'warning' ? '⚠' : 'ℹ'}</span>
                        <span>{t.message}</span>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}

export function useToast() {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error('useToast must be used within ToastProvider');
    return ctx;
}
