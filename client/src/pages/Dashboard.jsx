import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { formatKES, formatDateTime, formatTime, getPaymentBadge } from '../utils/format';
import { DollarSign, ShoppingCart, TrendingUp, CreditCard, Receipt, AlertTriangle, Clock, Phone, Landmark } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function Dashboard() {
    const [summary, setSummary] = useState(null);
    const [hourly, setHourly] = useState([]);
    const [topItems, setTopItems] = useState([]);
    const [recent, setRecent] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
        try {
            const [s, h, t, r] = await Promise.all([
                api.dashboardSummary(), api.hourlySales(), api.topItems(), api.recentTransactions()
            ]);
            setSummary(s); setHourly(h); setTopItems(t); setRecent(r);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>;

    const cards = [
        { label: 'Total Sales', value: formatKES(summary?.total_sales), icon: DollarSign, color: 'from-green-500 to-emerald-600', bg: 'bg-green-500/10' },
        { label: 'Items Sold', value: summary?.total_items_sold || 0, icon: ShoppingCart, color: 'from-blue-500 to-cyan-600', bg: 'bg-blue-500/10' },
        { label: 'Cash Sales', value: formatKES(summary?.cash_sales), icon: TrendingUp, color: 'from-violet-500 to-purple-600', bg: 'bg-violet-500/10' },
        { label: 'Brian MPESA', value: formatKES(summary?.mpesa_sales), icon: Phone, color: 'from-brand-500 to-brand-600', bg: 'bg-brand-500/10' },
        { label: 'Tai Sacco', value: formatKES(summary?.sacco_sales), icon: Landmark, color: 'from-blue-500 to-indigo-600', bg: 'bg-blue-500/10' },
        { label: 'Credit Sales', value: formatKES(summary?.credit_sales), icon: CreditCard, color: 'from-orange-500 to-amber-600', bg: 'bg-orange-500/10' },
        { label: 'Transactions', value: summary?.transaction_count || 0, icon: Receipt, color: 'from-pink-500 to-rose-600', bg: 'bg-pink-500/10' },
        { label: 'Low Stock Alerts', value: summary?.low_stock_items?.length || 0, icon: AlertTriangle, color: 'from-red-500 to-rose-600', bg: 'bg-red-500/10' },
    ];

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white">Dashboard</h1>
                    <p className="text-surface-400 text-sm mt-1">Today's performance overview • {summary?.date}</p>
                </div>
                <button onClick={() => { setLoading(true); loadData(); }} className="px-4 py-2 rounded-xl bg-surface-800 hover:bg-surface-700 text-surface-300 text-sm font-medium transition-colors flex items-center gap-2">
                    <Clock size={14} /> Refresh
                </button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-4">
                {cards.map((card, i) => {
                    const Icon = card.icon;
                    return (
                        <div key={i} className="glass-card p-4 hover:border-surface-600 transition-all duration-300 group animate-slide-up" style={{ animationDelay: `${i * 60}ms` }}>
                            <div className="flex items-center justify-between mb-3">
                                <div className={`w-9 h-9 rounded-lg ${card.bg} flex items-center justify-center`}>
                                    <Icon size={18} className={`bg-gradient-to-r ${card.color} bg-clip-text`} style={{ color: 'inherit' }} />
                                </div>
                            </div>
                            <p className="text-xl font-bold text-white">{card.value}</p>
                            <p className="text-surface-500 text-xs mt-1">{card.label}</p>
                        </div>
                    );
                })}
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
                {/* Hourly Sales Chart */}
                <div className="lg:col-span-2 glass-card p-5">
                    <h3 className="text-white font-semibold mb-4">Sales Today (Hourly)</h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={hourly}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                <XAxis dataKey="hour" tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} />
                                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                                <Tooltip
                                    contentStyle={{ background: '#1e293b', border: '1px solid #475569', borderRadius: 12, color: '#e2e8f0' }}
                                    formatter={(v) => [formatKES(v), 'Revenue']}
                                />
                                <Bar dataKey="total" fill="url(#gradientGreen)" radius={[6, 6, 0, 0]} />
                                <defs>
                                    <linearGradient id="gradientGreen" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#22c55e" />
                                        <stop offset="100%" stopColor="#15803d" />
                                    </linearGradient>
                                </defs>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Top Items */}
                <div className="glass-card p-5">
                    <h3 className="text-white font-semibold mb-4">Top 5 Selling Items</h3>
                    <div className="space-y-3">
                        {topItems.length === 0 ? (
                            <p className="text-surface-500 text-sm text-center py-8">No sales yet today</p>
                        ) : topItems.map((item, i) => (
                            <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-surface-800/40 hover:bg-surface-800/60 transition-colors">
                                <div className="w-7 h-7 rounded-lg bg-brand-500/20 flex items-center justify-center text-brand-400 text-xs font-bold">
                                    {i + 1}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-white text-sm font-medium truncate">{item.name}</p>
                                    <p className="text-surface-500 text-xs">{item.quantity_sold} sold</p>
                                </div>
                                <p className="text-brand-400 text-sm font-semibold">{formatKES(item.revenue)}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
                {/* Recent Transactions */}
                <div className="glass-card p-5">
                    <h3 className="text-white font-semibold mb-4">Recent Transactions</h3>
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                        {recent.length === 0 ? (
                            <p className="text-surface-500 text-sm text-center py-8">No transactions today</p>
                        ) : recent.map(tx => (
                            <div key={tx.id} className="flex items-center gap-3 p-3 rounded-lg bg-surface-800/40 hover:bg-surface-800/60 transition-colors">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <p className="text-white text-sm font-medium">{tx.receipt_number}</p>
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getPaymentBadge(tx.payment_type)}`}>
                                            {tx.payment_type}
                                        </span>
                                    </div>
                                    <p className="text-surface-500 text-xs mt-0.5">{tx.customer_name} • {tx.item_count} items</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-white text-sm font-semibold">{formatKES(tx.total_amount)}</p>
                                    <p className="text-surface-500 text-xs">{formatTime(tx.created_at)}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Low Stock Alerts */}
                <div className="glass-card p-5">
                    <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                        <AlertTriangle size={16} className="text-yellow-400" /> Low Stock Alerts
                    </h3>
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                        {(!summary?.low_stock_items || summary.low_stock_items.length === 0) ? (
                            <p className="text-surface-500 text-sm text-center py-8">All items well stocked ✓</p>
                        ) : summary.low_stock_items.map(item => (
                            <div key={item.id} className="flex items-center gap-3 p-3 rounded-lg bg-surface-800/40 hover:bg-surface-800/60 transition-colors">
                                <div className={`w-2 h-2 rounded-full ${item.quantity <= 0 ? 'bg-red-500' : 'bg-yellow-500'} animate-pulse`} />
                                <div className="flex-1 min-w-0">
                                    <p className="text-white text-sm font-medium truncate">{item.name}</p>
                                    <p className="text-surface-500 text-xs">Min: {item.min_stock_level}</p>
                                </div>
                                <div className="text-right">
                                    <p className={`text-sm font-bold ${item.quantity <= 0 ? 'text-red-400' : 'text-yellow-400'}`}>
                                        {item.quantity} left
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
