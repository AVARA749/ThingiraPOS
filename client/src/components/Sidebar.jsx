import React from 'react';
import { useAuth } from '../context/AuthContext';
import { LayoutDashboard, Package, ShoppingCart, ArrowLeftRight, LogOut, Menu, X, FileText, Unlock } from 'lucide-react';

const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'inventory', label: 'Inventory', icon: Package },
    { id: 'pos', label: 'POS', icon: ShoppingCart },
    { id: 'stock', label: 'Stock Control', icon: ArrowLeftRight },
    { id: 'reports', label: 'Reports', icon: FileText },
    { id: 'shifts', label: 'Shift Control', icon: Unlock },
];

export default function Sidebar({ activeTab, onTabChange, isOpen, onToggle }) {
    const { user, logout } = useAuth();

    return (
        <>
            {/* Mobile overlay */}
            {isOpen && (
                <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={onToggle} />
            )}

            <aside className={`fixed top-0 left-0 h-full z-50 w-64 bg-surface-950 border-r border-surface-800 flex flex-col transition-transform duration-300 ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
                }`}>
                {/* Logo */}
                <div className="p-5 border-b border-surface-800">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-brand-500/20">
                                T
                            </div>
                            <div>
                                <h1 className="text-white font-bold text-lg leading-tight">ThingiraShop</h1>
                                <p className="text-surface-500 text-xs">Point of Sale</p>
                            </div>
                        </div>
                        <button onClick={onToggle} className="lg:hidden text-surface-400 hover:text-white">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Navigation */}
                <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
                    {navItems.map(item => {
                        const Icon = item.icon;
                        const isActive = activeTab === item.id;
                        return (
                            <button
                                key={item.id}
                                onClick={() => { onTabChange(item.id); if (window.innerWidth < 1024) onToggle(); }}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${isActive
                                    ? 'bg-brand-600/20 text-brand-400 shadow-lg shadow-brand-500/10 border border-brand-500/20'
                                    : 'text-surface-400 hover:text-white hover:bg-surface-800/60'
                                    }`}
                            >
                                <Icon size={20} className={isActive ? 'text-brand-400' : ''} />
                                {item.label}
                            </button>
                        );
                    })}
                </nav>

                {/* User section */}
                <div className="p-4 border-t border-surface-800">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-500 to-emerald-600 flex items-center justify-center text-white text-sm font-bold">
                            {user?.full_name?.charAt(0) || 'A'}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-medium truncate">{user?.full_name || 'Admin'}</p>
                            <p className="text-surface-500 text-xs truncate">{user?.shop_name || 'ThingiraShop'}</p>
                        </div>
                    </div>
                    <button
                        onClick={logout}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-surface-400 hover:text-red-400 hover:bg-red-500/10 text-sm transition-colors"
                    >
                        <LogOut size={16} />
                        Sign Out
                    </button>
                </div>
            </aside>
        </>
    );
}

export function MobileHeader({ onToggle, activeTab }) {
    return (
        <div className="lg:hidden fixed top-0 left-0 right-0 z-30 bg-surface-950/95 backdrop-blur-md border-b border-surface-800 px-4 py-3 flex items-center justify-between">
            <button onClick={onToggle} className="text-surface-400 hover:text-white p-1">
                <Menu size={24} />
            </button>
            <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white font-bold text-sm">T</div>
                <span className="text-white font-semibold text-sm capitalize">{activeTab}</span>
            </div>
            <div className="w-8" />
        </div>
    );
}
