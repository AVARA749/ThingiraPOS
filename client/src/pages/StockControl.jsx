import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { formatKES, formatDateTime } from '../utils/format';
import { useToast } from '../context/ToastContext';
import { ArrowDownCircle, ArrowUpCircle, Package, Filter } from 'lucide-react';

const TABS = ['current', 'in', 'out'];
const PERIODS = [
    { value: 'today', label: 'Today' },
    { value: 'week', label: 'This Week' },
    { value: 'month', label: 'This Month' },
    { value: 'custom', label: 'Custom Range' },
];

export default function StockControl() {
    const toast = useToast();
    const [tab, setTab] = useState('current');
    const [period, setPeriod] = useState('today');
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [current, setCurrent] = useState({ items: [], summary: {} });
    const [stockIn, setStockIn] = useState([]);
    const [stockOut, setStockOut] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => { loadData(); }, [tab, period, fromDate, toDate]);

    const loadData = async () => {
        setLoading(true);
        try {
            const params = period === 'custom'
                ? `from=${fromDate}&to=${toDate}`
                : `period=${period}`;

            if (tab === 'current') {
                const data = await api.currentStock();
                setCurrent(data);
            } else if (tab === 'in') {
                const data = await api.stockIn(params);
                setStockIn(data);
            } else {
                const data = await api.stockOut(params);
                setStockOut(data);
            }
        } catch (err) { toast.error('Failed to load stock data'); }
        finally { setLoading(false); }
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <div>
                <h1 className="text-2xl font-bold text-white">Stock Control</h1>
                <p className="text-surface-400 text-sm mt-1">Track stock movements & inventory levels</p>
            </div>

            {/* Tab Selector */}
            <div className="flex gap-2">
                {TABS.map(t => (
                    <button key={t} onClick={() => setTab(t)}
                        className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${tab === t
                                ? 'bg-brand-600/20 text-brand-400 border border-brand-500/30'
                                : 'bg-surface-800/50 text-surface-400 hover:text-white hover:bg-surface-700'
                            }`}>
                        {t === 'current' ? '📦 Current Stock' : t === 'in' ? '📥 Stock In' : '📤 Stock Out'}
                    </button>
                ))}
            </div>

            {/* Period Filter (for in/out tabs) */}
            {tab !== 'current' && (
                <div className="flex flex-wrap gap-3 items-center">
                    <Filter size={16} className="text-surface-500" />
                    {PERIODS.map(p => (
                        <button key={p.value} onClick={() => setPeriod(p.value)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${period === p.value ? 'bg-brand-500/20 text-brand-400 border border-brand-500/30'
                                    : 'bg-surface-800/50 text-surface-400 hover:bg-surface-700'
                                }`}>
                            {p.label}
                        </button>
                    ))}
                    {period === 'custom' && (
                        <div className="flex gap-2">
                            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
                                className="px-3 py-1.5 rounded-lg bg-surface-800/60 border border-surface-700 text-white text-xs" />
                            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
                                className="px-3 py-1.5 rounded-lg bg-surface-800/60 border border-surface-700 text-white text-xs" />
                        </div>
                    )}
                </div>
            )}

            {loading ? (
                <div className="flex items-center justify-center h-40"><div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>
            ) : (
                <>
                    {/* Current Stock Tab */}
                    {tab === 'current' && (
                        <>
                            {/* Summary Cards */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="glass-card p-4">
                                    <p className="text-surface-400 text-xs mb-1">Total Items</p>
                                    <p className="text-xl font-bold text-white">{current.summary?.total_items || 0}</p>
                                </div>
                                <div className="glass-card p-4">
                                    <p className="text-surface-400 text-xs mb-1">Total Units</p>
                                    <p className="text-xl font-bold text-white">{current.summary?.total_units || 0}</p>
                                </div>
                                <div className="glass-card p-4">
                                    <p className="text-surface-400 text-xs mb-1">Stock Value (Selling)</p>
                                    <p className="text-xl font-bold text-brand-400">{formatKES(current.summary?.total_value_selling)}</p>
                                </div>
                                <div className="glass-card p-4">
                                    <p className="text-surface-400 text-xs mb-1">Low/Out Stock</p>
                                    <p className="text-xl font-bold text-yellow-400">{(current.summary?.low_stock || 0) + (current.summary?.out_of_stock || 0)}</p>
                                </div>
                            </div>

                            <div className="glass-card overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b border-surface-700/50 text-surface-400">
                                                <th className="text-left py-3 px-4 font-medium">Item</th>
                                                <th className="text-right py-3 px-4 font-medium">Qty</th>
                                                <th className="text-right py-3 px-4 font-medium hidden sm:table-cell">Value (KES)</th>
                                                <th className="text-center py-3 px-4 font-medium">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {current.items?.map(item => (
                                                <tr key={item.id} className="border-b border-surface-800/50 hover:bg-surface-800/30">
                                                    <td className="py-2.5 px-4 text-white font-medium text-sm">{item.name}</td>
                                                    <td className="py-2.5 px-4 text-right text-white font-bold">{item.quantity}</td>
                                                    <td className="py-2.5 px-4 text-right text-surface-300 hidden sm:table-cell">{formatKES(item.value_selling || item.value_at_selling)}</td>
                                                    <td className="py-2.5 px-4 text-center">
                                                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${item.status === 'OUT' ? 'badge-out' : item.status === 'LOW' ? 'badge-low' : 'badge-ok'
                                                            }`}>{item.status}</span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    )}

                    {/* Stock In Tab */}
                    {tab === 'in' && (
                        <div className="glass-card overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-surface-700/50 text-surface-400">
                                            <th className="text-left py-3 px-4 font-medium">Date</th>
                                            <th className="text-left py-3 px-4 font-medium">Item</th>
                                            <th className="text-right py-3 px-4 font-medium">Qty Added</th>
                                            <th className="text-left py-3 px-4 font-medium hidden sm:table-cell">Supplier</th>
                                            <th className="text-right py-3 px-4 font-medium hidden md:table-cell">Balance</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {stockIn.map(m => (
                                            <tr key={m.id} className="border-b border-surface-800/50 hover:bg-surface-800/30">
                                                <td className="py-2.5 px-4 text-surface-400 text-xs">{formatDateTime(m.created_at)}</td>
                                                <td className="py-2.5 px-4 text-white font-medium">{m.item_name}</td>
                                                <td className="py-2.5 px-4 text-right">
                                                    <span className="text-green-400 font-bold flex items-center justify-end gap-1">
                                                        <ArrowDownCircle size={14} /> +{m.quantity}
                                                    </span>
                                                </td>
                                                <td className="py-2.5 px-4 text-surface-400 hidden sm:table-cell">{m.supplier_name || '-'}</td>
                                                <td className="py-2.5 px-4 text-right text-white font-medium hidden md:table-cell">{m.balance_after}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {stockIn.length === 0 && <p className="text-center py-8 text-surface-500">No stock in records found</p>}
                        </div>
                    )}

                    {/* Stock Out Tab */}
                    {tab === 'out' && (
                        <div className="glass-card overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-surface-700/50 text-surface-400">
                                            <th className="text-left py-3 px-4 font-medium">Date</th>
                                            <th className="text-left py-3 px-4 font-medium">Item</th>
                                            <th className="text-right py-3 px-4 font-medium">Qty Sold</th>
                                            <th className="text-left py-3 px-4 font-medium hidden sm:table-cell">Reference</th>
                                            <th className="text-right py-3 px-4 font-medium hidden md:table-cell">Balance</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {stockOut.map(m => (
                                            <tr key={m.id} className="border-b border-surface-800/50 hover:bg-surface-800/30">
                                                <td className="py-2.5 px-4 text-surface-400 text-xs">{formatDateTime(m.created_at)}</td>
                                                <td className="py-2.5 px-4 text-white font-medium">{m.item_name}</td>
                                                <td className="py-2.5 px-4 text-right">
                                                    <span className={`font-bold flex items-center justify-end gap-1 ${m.movement_type === 'RETURN' ? 'text-blue-400' : 'text-red-400'}`}>
                                                        <ArrowUpCircle size={14} /> {m.movement_type === 'RETURN' ? '+' : '-'}{m.quantity}
                                                    </span>
                                                </td>
                                                <td className="py-2.5 px-4 text-surface-400 hidden sm:table-cell text-xs">
                                                    {m.reference_type === 'sale' ? `Sale #${m.reference_id}` : m.notes || '-'}
                                                </td>
                                                <td className="py-2.5 px-4 text-right text-white font-medium hidden md:table-cell">{m.balance_after}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {stockOut.length === 0 && <p className="text-center py-8 text-surface-500">No stock out records found</p>}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
