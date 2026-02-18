import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Eye, EyeOff, ShoppingBag, Wifi, WifiOff } from 'lucide-react';

export default function Login({ onSwitch }) {
    const { login } = useAuth();
    const toast = useToast();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [loading, setLoading] = useState(false);
    const [apiStatus, setApiStatus] = useState('checking'); // 'checking', 'online', 'offline'

    React.useEffect(() => {
        const apiBase = window.location.protocol === 'file:' ? 'http://localhost:5000/api' : '/api';
        fetch(`${apiBase}/auth/test`)
            .then(res => res.ok ? setApiStatus('online') : setApiStatus('offline'))
            .catch(() => setApiStatus('offline'));
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!username || !password) { toast.warning('Please enter both username and password.'); return; }
        setLoading(true);
        try {
            await login(username, password);
            toast.success('Welcome to ThingiraShop!');
        } catch (err) {
            toast.error(err.message || 'Login failed. Check your credentials.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-surface-950 via-surface-900 to-surface-950 px-4 relative overflow-hidden">
            {/* Background decorations */}
            <div className="absolute top-20 left-20 w-72 h-72 bg-brand-500/10 rounded-full blur-3xl"></div>
            <div className="absolute bottom-20 right-20 w-96 h-96 bg-emerald-500/8 rounded-full blur-3xl"></div>

            <div className="w-full max-w-md animate-slide-up">
                {/* Logo */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 shadow-2xl shadow-brand-500/30 mb-4">
                        <ShoppingBag size={32} className="text-white" />
                    </div>
                    <h1 className="text-3xl font-bold text-white mb-1">ThingiraShop</h1>
                    <p className="text-surface-400 text-sm">Point of Sale System</p>
                </div>

                {/* Login Card */}
                <div className="glass-card p-8">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-semibold text-white">Sign in to your shop</h2>
                        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${apiStatus === 'online' ? 'bg-emerald-500/10 text-emerald-400' :
                            apiStatus === 'offline' ? 'bg-red-500/10 text-red-400' :
                                'bg-surface-800 text-surface-500'
                            }`}>
                            {apiStatus === 'online' ? <><Wifi size={10} /> Online</> :
                                apiStatus === 'offline' ? <><WifiOff size={10} /> Offline</> :
                                    'Checking...'}
                        </div>
                    </div>
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label className="block text-sm font-medium text-surface-400 mb-2">Username</label>
                            <input
                                type="text" value={username} onChange={e => setUsername(e.target.value)}
                                placeholder="Enter username"
                                className="w-full px-4 py-3 rounded-xl bg-surface-800/60 border border-surface-700 text-white placeholder-surface-500 text-sm transition-all"
                                autoComplete="username"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-surface-400 mb-2">Password</label>
                            <div className="relative">
                                <input
                                    type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                                    placeholder="Enter password"
                                    className="w-full px-4 py-3 pr-12 rounded-xl bg-surface-800/60 border border-surface-700 text-white placeholder-surface-500 text-sm transition-all"
                                    autoComplete="current-password"
                                />
                                <button type="button" onClick={() => setShowPass(!showPass)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-500 hover:text-white">
                                    {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>
                        <button type="submit" disabled={loading}
                            className="w-full py-3 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-400 hover:to-brand-500 text-white font-semibold text-sm shadow-lg shadow-brand-500/25 transition-all duration-200 disabled:opacity-50">
                            {loading ? 'Signing in...' : 'Sign In'}
                        </button>
                    </form>

                    <div className="mt-8 pt-6 border-t border-surface-700/50 text-center">
                        <p className="text-sm text-surface-400">
                            Don't have an account?{' '}
                            <button onClick={onSwitch} className="text-brand-400 font-semibold hover:text-brand-300 transition-colors">
                                Sign Up
                            </button>
                        </p>
                    </div>

                    <div className="mt-4 p-3 rounded-lg bg-surface-800/40 border border-surface-700/50">
                        <p className="text-xs text-surface-500 text-center">
                            Demo: <span className="text-brand-400 font-mono">admin</span> / <span className="text-brand-400 font-mono">thingira2024</span>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
