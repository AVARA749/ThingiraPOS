import React from 'react';

export default function ConfirmDialog({ isOpen, title, message, onConfirm, onCancel, danger = false }) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="glass-card p-6 max-w-md w-full mx-4 animate-slide-up">
                <h3 className="text-lg font-bold text-white mb-2">{title || 'Confirm Action'}</h3>
                <p className="text-surface-400 text-sm mb-6">{message}</p>
                <div className="flex justify-end gap-3">
                    <button onClick={onCancel} className="px-4 py-2 rounded-lg bg-surface-700 hover:bg-surface-600 text-surface-300 text-sm font-medium transition-colors">
                        Cancel
                    </button>
                    <button onClick={onConfirm} className={`px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors ${danger ? 'bg-red-600 hover:bg-red-500' : 'bg-brand-600 hover:bg-brand-500'
                        }`}>
                        Confirm
                    </button>
                </div>
            </div>
        </div>
    );
}
