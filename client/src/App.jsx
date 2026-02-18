import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import Sidebar, { MobileHeader } from './components/Sidebar';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import POS from './pages/POS';
import StockControl from './pages/StockControl';
import Reports from './pages/Reports';
import ShiftControl from './pages/ShiftControl';

function AppContent() {
    const { isAuthenticated, loading } = useAuth();
    const [activeTab, setActiveTab] = useState('dashboard');
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [authView, setAuthView] = useState('login'); // 'login' or 'register'

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-surface-950">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 animate-pulse flex items-center justify-center text-white font-bold text-xl">T</div>
                    <p className="text-surface-400 text-sm">Loading ThingiraShop...</p>
                </div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return authView === 'login'
            ? <Login onSwitch={() => setAuthView('register')} />
            : <Register onSwitch={() => setAuthView('login')} />;
    }

    const renderPage = () => {
        switch (activeTab) {
            case 'dashboard': return <Dashboard />;
            case 'inventory': return <Inventory />;
            case 'pos': return <POS />;
            case 'stock': return <StockControl />;
            case 'reports': return <Reports />;
            case 'shifts': return <ShiftControl />;
            default: return <Dashboard />;
        }
    };

    return (
        <div className="min-h-screen bg-surface-950">
            <Sidebar activeTab={activeTab} onTabChange={setActiveTab} isOpen={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />
            <MobileHeader onToggle={() => setSidebarOpen(!sidebarOpen)} activeTab={activeTab} />
            <main className="lg:ml-64 pt-14 lg:pt-0 min-h-screen">
                <div className="p-4 lg:p-6">
                    {renderPage()}
                </div>
            </main>
        </div>
    );
}

export default function App() {
    return (
        <AuthProvider>
            <ToastProvider>
                <AppContent />
            </ToastProvider>
        </AuthProvider>
    );
}
