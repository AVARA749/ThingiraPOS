import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Eye, EyeOff, ShoppingBag, User, Store, Phone, Lock, CheckCircle2, XCircle, Wifi, WifiOff } from 'lucide-react';

export default function Register({ onSwitch }) {
    const { register } = useAuth();
    const toast = useToast();
    const [formData, setFormData] = useState({
        username: '',
        password: '',
        confirmPassword: '',
        full_name: '',
        shop_name: '',
        phone: ''
    });
    const [showPass, setShowPass] = useState(false);
    const [loading, setLoading] = useState(false);
    const [apiStatus, setApiStatus] = useState('checking');

    React.useEffect(() => {
        const apiBase = window.location.protocol === 'file:' ? 'http://localhost:5000/api' : '/api';
        fetch(`${apiBase}/auth/test`)
            .then(res => res.ok ? setApiStatus('online') : setApiStatus('offline'))
            .catch(() => setApiStatus('offline'));
    }, []);

    // Basic live validation states
    const isPassLongEnough = formData.password.length >= 6;
    const doPassMatch = formData.password === formData.confirmPassword && formData.confirmPassword !== '';
    const isUserLongEnough = formData.username.length >= 3;

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Client-side validation
        if (!formData.username || !formData.password || !formData.full_name) {
            toast.warning('Please fill in all required fields.');
            return;
        }
        if (!isUserLongEnough) {
            toast.error('Username must be at least 3 characters.');
            return;
        }
        if (!isPassLongEnough) {
            toast.error('Password must be at least 6 characters.');
            return;
        }
        if (formData.password !== formData.confirmPassword) {
            toast.error('Passwords do not match.');
            return;
        }

        setLoading(true);
        try {
            // Strip confirmPassword before sending to API
            const { confirmPassword, ...registerData } = formData;
            await register(registerData);
            toast.success('Account created! Welcome to ThingiraShop.');
        } catch (err) {
            toast.error(err.message || 'Registration failed.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-surface-950 via-surface-900 to-surface-950 px-4 py-12 relative overflow-hidden">
            {/* Background decorations */}
            <div className="absolute top-20 left-20 w-72 h-72 bg-brand-500/10 rounded-full blur-3xl"></div>
            <div className="absolute bottom-20 right-20 w-96 h-96 bg-emerald-500/8 rounded-full blur-3xl"></div>

            <div className="w-full max-w-lg animate-slide-up">
                {/* Logo */}
                <div className="text-center mb-6">
                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 shadow-2xl shadow-brand-500/30 mb-3">
                        <ShoppingBag size={28} className="text-white" />
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-1">Create Your Account</h1>
                    <p className="text-surface-400 text-sm">Join the next generation of retailers</p>
                </div>

                {/* Register Card */}
                <div className="glass-card p-6 sm:p-8 border border-white/5 shadow-2xl">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-bold text-white">Sign Up</h2>
                        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${apiStatus === 'online' ? 'bg-emerald-500/10 text-emerald-400' :
                            apiStatus === 'offline' ? 'bg-red-500/10 text-red-400' :
                                'bg-surface-800 text-surface-500'
                            }`}>
                            {apiStatus === 'online' ? <><Wifi size={10} /> Online</> :
                                apiStatus === 'offline' ? <><WifiOff size={10} /> Offline</> :
                                    'Checking...'}
                        </div>
                    </div>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-surface-400 mb-1.5 uppercase tracking-wider">Full Name *</label>
                                <div className="relative">
                                    <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500" />
                                    <input
                                        type="text" value={formData.full_name}
                                        onChange={e => setFormData({ ...formData, full_name: e.target.value })}
                                        placeholder="John Doe"
                                        className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface-900/50 border border-surface-700/50 text-white placeholder-surface-600 text-sm transition-all focus:border-brand-500/50 focus:bg-surface-800/80 outline-none"
                                        required
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-surface-400 mb-1.5 uppercase tracking-wider">Username *</label>
                                <div className="relative">
                                    <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500" />
                                    <input
                                        type="text" value={formData.username}
                                        onChange={e => setFormData({ ...formData, username: e.target.value })}
                                        placeholder="johndoe"
                                        className={`w-full pl-10 pr-10 py-2.5 rounded-xl bg-surface-900/50 border ${formData.username && !isUserLongEnough ? 'border-red-500/50' : 'border-surface-700/50'} text-white placeholder-surface-600 text-sm transition-all focus:border-brand-500/50 focus:bg-surface-800/80 outline-none`}
                                        required
                                    />
                                    {formData.username && (
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                            {isUserLongEnough ? <CheckCircle2 size={16} className="text-emerald-500" /> : <XCircle size={16} className="text-red-500" />}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-surface-400 mb-1.5 uppercase tracking-wider">Shop Name</label>
                                <div className="relative">
                                    <Store size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500" />
                                    <input
                                        type="text" value={formData.shop_name}
                                        onChange={e => setFormData({ ...formData, shop_name: e.target.value })}
                                        placeholder="Thingira Retail"
                                        className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-target-900/50 bg-surface-900/50 border border-surface-700/50 text-white placeholder-surface-600 text-sm transition-all focus:border-brand-500/50 focus:bg-surface-800/80 outline-none"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-surface-400 mb-1.5 uppercase tracking-wider">Phone Number</label>
                                <div className="relative">
                                    <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500" />
                                    <input
                                        type="text" value={formData.phone}
                                        onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                        placeholder="07XX XXX XXX"
                                        className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface-900/50 border border-surface-700/50 text-white placeholder-surface-600 text-sm transition-all focus:border-brand-500/50 focus:bg-surface-800/80 outline-none"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-surface-400 mb-1.5 uppercase tracking-wider">Password *</label>
                                <div className="relative">
                                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500" />
                                    <input
                                        type={showPass ? 'text' : 'password'} value={formData.password}
                                        onChange={e => setFormData({ ...formData, password: e.target.value })}
                                        placeholder="••••••••"
                                        className={`w-full pl-10 pr-12 py-2.5 rounded-xl bg-surface-900/50 border ${formData.password && !isPassLongEnough ? 'border-red-500/50' : 'border-surface-700/50'} text-white placeholder-surface-600 text-sm transition-all focus:border-brand-500/50 focus:bg-surface-800/80 outline-none`}
                                        required
                                    />
                                    <button type="button" onClick={() => setShowPass(!showPass)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-500 hover:text-white">
                                        {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>
                                {formData.password && !isPassLongEnough && (
                                    <p className="text-[10px] text-red-400 mt-1 ml-1 font-medium">Min 6 characters</p>
                                )}
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-surface-400 mb-1.5 uppercase tracking-wider">Confirm Password *</label>
                                <div className="relative">
                                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500" />
                                    <input
                                        type={showPass ? 'text' : 'password'} value={formData.confirmPassword}
                                        onChange={e => setFormData({ ...formData, confirmPassword: e.target.value })}
                                        placeholder="••••••••"
                                        className={`w-full pl-10 pr-10 py-2.5 rounded-xl bg-surface-900/50 border ${formData.confirmPassword && !doPassMatch ? 'border-red-500/50' : 'border-surface-700/50'} text-white placeholder-surface-600 text-sm transition-all focus:border-brand-500/50 focus:bg-surface-800/80 outline-none`}
                                        required
                                    />
                                    {formData.confirmPassword && (
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                            {doPassMatch ? <CheckCircle2 size={16} className="text-emerald-500" /> : <XCircle size={16} className="text-red-500" />}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <button type="submit" disabled={loading}
                            className="w-full py-3.5 mt-6 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-400 hover:to-brand-500 text-white font-bold text-sm shadow-xl shadow-brand-500/20 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed">
                            {loading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Creating Account...
                                </span>
                            ) : 'Create Account'}
                        </button>
                    </form>

                    <div className="mt-8 pt-6 border-t border-surface-700/30 text-center">
                        <p className="text-sm text-surface-400">
                            Already have an account?{' '}
                            <button onClick={onSwitch} className="text-brand-400 font-bold hover:text-brand-300 transition-colors">
                                Sign In
                            </button>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
