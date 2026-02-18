import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { formatKES, formatDateTime, getPaymentBadge } from '../utils/format';
import { useToast } from '../context/ToastContext';
import { FileText, Download, TrendingUp, Package, CreditCard, Calendar, X, DollarSign, Receipt, Trash2, AlertTriangle } from 'lucide-react';

const TABS = ['daily', 'transactions', 'inventory', 'credit', 'financial'];

export default function Reports() {
    const toast = useToast();
    const [tab, setTab] = useState('daily');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [daily, setDaily] = useState(null);
    const [transactions, setTransactions] = useState([]);
    const [inventory, setInventory] = useState(null);
    const [credit, setCredit] = useState(null);
    const [financial, setFinancial] = useState(null);
    const [loading, setLoading] = useState(true);
    const [voidConfirm, setVoidConfirm] = useState(null);

    // Payment State
    const [payModal, setPayModal] = useState({ show: false, entry: null, amount: '', date: '', notes: '' });
    const [payLoading, setPayLoading] = useState(false);

    useEffect(() => { loadReport(); }, [tab, date]);

    const loadReport = async () => {
        setLoading(true);
        try {
            if (tab === 'daily') { setDaily(await api.dailyReport(date)); }
            else if (tab === 'transactions') { setTransactions(await api.getSales()); }
            else if (tab === 'inventory') { setInventory(await api.inventoryReport()); }
            else if (tab === 'credit') { setCredit(await api.creditReport()); }
            else { setFinancial(await api.financialReport()); }
        } catch (err) { toast.error('Failed to load report'); }
        finally { setLoading(false); }
    };

    const handlePay = async () => {
        if (!payModal.entry || !payModal.amount) return;
        setPayLoading(true);
        try {
            await api.payCredit(payModal.entry.customer_id, {
                amount: parseFloat(payModal.amount),
                ledger_id: payModal.entry.id,
                payment_date: payModal.date,
                notes: payModal.notes
            });
            toast.success('Payment recorded successfully!');
            setPayModal({ show: false, entry: null, amount: '', date: '', notes: '' });
            loadReport();
        } catch (err) {
            toast.error(err.message || 'Failed to record payment');
        } finally {
            setPayLoading(false);
        }
    };

    const handleExport = async (type) => {
        try { await api.exportCSV(type); toast.success('Report downloaded!'); }
        catch (err) { toast.error('Export failed'); }
    };

    const handleVoidSale = async () => {
        if (!voidConfirm) return;
        try {
            await api.voidSale(voidConfirm.id);
            toast.success('Sale voided and reversed successfully!');
            setVoidConfirm(null);
            loadReport();
        } catch (err) {
            toast.error(err.message || 'Failed to void sale');
        }
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Reports</h1>
                    <p className="text-surface-400 text-sm mt-1">Business insights & summaries</p>
                </div>
            </div>

            {/* Tab Selector */}
            <div className="flex gap-2 flex-wrap">
                {TABS.map(t => (
                    <button key={t} onClick={() => setTab(t)}
                        className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${tab === t ? 'bg-brand-600/20 text-brand-400 border border-brand-500/30'
                            : 'bg-surface-800/50 text-surface-400 hover:text-white hover:bg-surface-700'
                            }`}>
                        {t === 'daily' && <><TrendingUp size={16} /> Daily</>}
                        {t === 'transactions' && <><Receipt size={16} /> Transactions</>}
                        {t === 'inventory' && <><Package size={16} /> Inventory</>}
                        {t === 'credit' && <><CreditCard size={16} /> Credit</>}
                        {t === 'financial' && <><DollarSign size={16} /> Accounting</>}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="flex items-center justify-center h-40"><div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>
            ) : (
                <>
                    {/* Daily Report */}
                    {tab === 'daily' && daily && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-3">
                                <Calendar size={16} className="text-surface-500" />
                                <input type="date" value={date} onChange={e => setDate(e.target.value)}
                                    className="px-3 py-2 rounded-lg bg-surface-800/60 border border-surface-700 text-white text-sm" />
                                <button onClick={() => handleExport('sales')} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-800 hover:bg-surface-700 text-surface-300 text-sm"><Download size={14} /> Export CSV</button>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="glass-card p-4">
                                    <p className="text-surface-400 text-xs mb-1">Revenue</p>
                                    <p className="text-xl font-bold text-brand-400">{formatKES(daily.revenue)}</p>
                                </div>
                                <div className="glass-card p-4">
                                    <p className="text-surface-400 text-xs mb-1">Profit Estimate</p>
                                    <p className="text-xl font-bold text-green-400">{formatKES(daily.profit_estimate)}</p>
                                </div>
                                <div className="glass-card p-4">
                                    <p className="text-surface-400 text-xs mb-1">Items Sold</p>
                                    <p className="text-xl font-bold text-white">{daily.items_sold}</p>
                                </div>
                                <div className="glass-card p-4">
                                    <p className="text-surface-400 text-xs mb-1">Transactions</p>
                                    <p className="text-xl font-bold text-white">{daily.transaction_count}</p>
                                </div>
                            </div>

                            <div className="grid md:grid-cols-2 gap-4">
                                <div className="glass-card p-5">
                                    <h3 className="text-white font-semibold mb-3">Revenue Breakdown</h3>
                                    <div className="space-y-3">
                                        <div className="flex justify-between items-center"><span className="text-surface-400">Cash Sales</span><span className="text-white font-bold">{formatKES(daily.cash_sales)}</span></div>
                                        <div className="w-full bg-surface-800 rounded-full h-2"><div className="bg-green-500 h-2 rounded-full" style={{ width: `${daily.revenue > 0 ? (daily.cash_sales / daily.revenue * 100) : 0}%` }} /></div>

                                        <div className="flex justify-between items-center"><span className="text-surface-400">Brian MPESA</span><span className="text-white font-bold">{formatKES(daily.mpesa_sales)}</span></div>
                                        <div className="w-full bg-surface-800 rounded-full h-2"><div className="bg-brand-500 h-2 rounded-full" style={{ width: `${daily.revenue > 0 ? (daily.mpesa_sales / daily.revenue * 100) : 0}%` }} /></div>

                                        <div className="flex justify-between items-center"><span className="text-surface-400">Direct Tai Sacco</span><span className="text-white font-bold">{formatKES(daily.sacco_sales)}</span></div>
                                        <div className="w-full bg-surface-800 rounded-full h-2"><div className="bg-blue-500 h-2 rounded-full" style={{ width: `${daily.revenue > 0 ? (daily.sacco_sales / daily.revenue * 100) : 0}%` }} /></div>

                                        <div className="flex justify-between items-center"><span className="text-surface-400">Credit Sales</span><span className="text-white font-bold">{formatKES(daily.credit_sales)}</span></div>
                                        <div className="w-full bg-surface-800 rounded-full h-2"><div className="bg-orange-500 h-2 rounded-full" style={{ width: `${daily.revenue > 0 ? (daily.credit_sales / daily.revenue * 100) : 0}%` }} /></div>
                                    </div>
                                </div>
                                <div className="glass-card p-5">
                                    <h3 className="text-white font-semibold mb-3">Profitability</h3>
                                    <div className="space-y-3">
                                        <div className="flex justify-between"><span className="text-surface-400">Revenue</span><span className="text-white">{formatKES(daily.revenue)}</span></div>
                                        <div className="flex justify-between"><span className="text-surface-400">Cost of Goods</span><span className="text-red-400">-{formatKES(daily.cost_of_goods)}</span></div>
                                        <hr className="border-surface-700" />
                                        <div className="flex justify-between"><span className="text-surface-300 font-medium">Gross Profit</span><span className="text-green-400 font-bold text-lg">{formatKES(daily.profit_estimate)}</span></div>
                                        <div className="flex justify-between text-sm"><span className="text-surface-500">Margin</span><span className="text-surface-300">{daily.revenue > 0 ? ((daily.profit_estimate / daily.revenue) * 100).toFixed(1) : 0}%</span></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Transactions List */}
                    {tab === 'transactions' && (
                        <div className="glass-card overflow-hidden">
                            <div className="p-4 border-b border-surface-700/50 flex items-center justify-between">
                                <h3 className="text-white font-semibold flex items-center gap-2">
                                    <Receipt size={18} className="text-brand-400" />
                                    Sale Transactions History
                                </h3>
                                <div className="text-[10px] text-surface-500 font-bold uppercase tracking-widest bg-surface-800 px-2 py-1 rounded">
                                    {transactions.length} Total Records
                                </div>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-surface-700/50 text-surface-400 text-left">
                                            <th className="py-3 px-4 font-medium uppercase text-[11px] tracking-wider">Date/ID</th>
                                            <th className="py-3 px-4 font-medium uppercase text-[11px] tracking-wider">Customer</th>
                                            <th className="py-3 px-4 font-medium uppercase text-[11px] tracking-wider">Payment</th>
                                            <th className="py-3 px-4 font-medium text-right uppercase text-[11px] tracking-wider">Amount</th>
                                            <th className="py-3 px-4 font-medium text-center uppercase text-[11px] tracking-wider">Status</th>
                                            <th className="py-3 px-4 font-medium text-right uppercase text-[11px] tracking-wider">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-surface-800/50">
                                        {transactions.map(tx => (
                                            <tr key={tx.id} className={`hover:bg-surface-800/30 transition-colors ${tx.status === 'voided' ? 'opacity-50 grayscale' : ''}`}>
                                                <td className="py-3 px-4">
                                                    <p className="text-white font-medium">{tx.receipt_number}</p>
                                                    <p className="text-[10px] text-surface-500">{new Date(tx.created_at).toLocaleString()}</p>
                                                </td>
                                                <td className="py-3 px-4">
                                                    <div className="text-white text-xs">{tx.customer_name}</div>
                                                    <div className="text-[10px] text-surface-500">{tx.customer_phone || 'No phone'}</div>
                                                </td>
                                                <td className="py-3 px-4">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${getPaymentBadge(tx.payment_type)}`}>
                                                        {tx.payment_type}
                                                    </span>
                                                </td>
                                                <td className="py-3 px-4 text-right font-bold text-white">
                                                    {formatKES(tx.total_amount)}
                                                </td>
                                                <td className="py-3 px-4 text-center">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${tx.status === 'voided' ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'
                                                        }`}>
                                                        {tx.status}
                                                    </span>
                                                </td>
                                                <td className="py-3 px-4 text-right">
                                                    {tx.status !== 'voided' && (
                                                        <button
                                                            onClick={() => setVoidConfirm(tx)}
                                                            className="p-1.5 rounded-lg hover:bg-red-500/10 text-surface-500 hover:text-red-400 transition-colors"
                                                            title="Void Transaction"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Inventory Report */}
                    {tab === 'inventory' && inventory && (
                        <div className="space-y-4">
                            <div className="flex justify-end">
                                <button onClick={() => handleExport('inventory')} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-800 hover:bg-surface-700 text-surface-300 text-sm"><Download size={14} /> Export CSV</button>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="glass-card p-4"><p className="text-surface-400 text-xs mb-1">Total Items</p><p className="text-xl font-bold text-white">{inventory.valuation?.total_items}</p></div>
                                <div className="glass-card p-4"><p className="text-surface-400 text-xs mb-1">Total Units</p><p className="text-xl font-bold text-white">{inventory.valuation?.total_units}</p></div>
                                <div className="glass-card p-4"><p className="text-surface-400 text-xs mb-1">Cost Value</p><p className="text-xl font-bold text-blue-400">{formatKES(inventory.valuation?.cost_value)}</p></div>
                                <div className="glass-card p-4"><p className="text-surface-400 text-xs mb-1">Selling Value</p><p className="text-xl font-bold text-brand-400">{formatKES(inventory.valuation?.selling_value)}</p></div>
                            </div>

                            <div className="grid md:grid-cols-2 gap-4">
                                <div className="glass-card p-5">
                                    <h3 className="text-white font-semibold mb-3">🔥 Fast Moving (30 days)</h3>
                                    <div className="space-y-2">{inventory.fast_moving?.map((item, i) => (
                                        <div key={i} className="flex justify-between items-center p-2 rounded-lg bg-surface-800/40"><span className="text-white text-sm">{item.name}</span><span className="text-brand-400 font-bold text-sm">{item.sold} sold</span></div>
                                    ))}</div>
                                    {(!inventory.fast_moving || inventory.fast_moving.length === 0) && <p className="text-surface-500 text-sm text-center py-4">No data</p>}
                                </div>
                                <div className="glass-card p-5">
                                    <h3 className="text-white font-semibold mb-3">🐌 Slow Moving (30 days)</h3>
                                    <div className="space-y-2">{inventory.slow_moving?.map((item, i) => (
                                        <div key={i} className="flex justify-between items-center p-2 rounded-lg bg-surface-800/40"><span className="text-white text-sm">{item.name}</span><span className="text-yellow-400 font-bold text-sm">{item.sold} sold</span></div>
                                    ))}</div>
                                    {(!inventory.slow_moving || inventory.slow_moving.length === 0) && <p className="text-surface-500 text-sm text-center py-4">No data</p>}
                                </div>
                            </div>

                            {inventory.low_stock?.length > 0 && (
                                <div className="glass-card p-5">
                                    <h3 className="text-white font-semibold mb-3">⚠ Low Stock Items</h3>
                                    <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2">{inventory.low_stock.map((item, i) => (
                                        <div key={i} className="flex justify-between items-center p-2 rounded-lg bg-yellow-500/5 border border-yellow-500/20">
                                            <span className="text-white text-sm">{item.name}</span><span className="text-yellow-400 font-bold text-sm">{item.quantity}/{item.min_stock_level}</span>
                                        </div>
                                    ))}</div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Credit Report */}
                    {tab === 'credit' && credit && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="glass-card p-4 inline-block"><p className="text-surface-400 text-xs mb-1">Total Outstanding</p><p className="text-2xl font-bold text-red-400">{formatKES(credit.total_outstanding)}</p></div>
                                <button onClick={() => handleExport('credit')} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-800 hover:bg-surface-700 text-surface-300 text-sm"><Download size={14} /> Export CSV</button>
                            </div>

                            <div className="glass-card p-5">
                                <h3 className="text-white font-semibold mb-3">Customer Balances</h3>
                                <div className="space-y-2">{credit.customers?.map(c => (
                                    <div key={c.id} className="flex items-center justify-between p-3 rounded-lg bg-surface-800/40">
                                        <div><p className="text-white font-medium text-sm">{c.name}</p><p className="text-surface-500 text-xs">{c.phone} • {c.entries} unpaid</p></div>
                                        <p className="text-red-400 font-bold">{formatKES(c.total_credit)}</p>
                                    </div>
                                ))}</div>
                                {(!credit.customers || credit.customers.length === 0) && <p className="text-surface-500 text-sm text-center py-4">No outstanding credit</p>}
                            </div>

                            {credit.ledger?.length > 0 && (
                                <div className="glass-card overflow-hidden">
                                    <div className="p-4 border-b border-surface-700/50">
                                        <h3 className="text-white font-semibold">Credit Ledger</h3>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead><tr className="border-b border-surface-700/50 text-surface-400">
                                                <th className="text-left py-2 px-4 font-medium">Customer</th>
                                                <th className="text-left py-2 px-4 font-medium">Receipt</th>
                                                <th className="text-right py-2 px-4 font-medium">Amount</th>
                                                <th className="text-right py-2 px-4 font-medium">Paid</th>
                                                <th className="text-right py-2 px-4 font-medium">Balance</th>
                                                <th className="text-center py-2 px-4 font-medium">Status</th>
                                                <th className="text-center py-2 px-4 font-medium">Action</th>
                                            </tr></thead>
                                            <tbody>{credit.ledger.map(l => (
                                                <tr key={l.id} className="border-b border-surface-800/50 hover:bg-surface-800/30">
                                                    <td className="py-2 px-4 text-white font-medium">{l.customer_name}</td>
                                                    <td className="py-2 px-4 text-surface-400 text-xs">{l.receipt_number}</td>
                                                    <td className="py-2 px-4 text-right text-surface-300">{formatKES(l.amount)}</td>
                                                    <td className="py-2 px-4 text-right text-emerald-400">{formatKES(l.paid_amount)}</td>
                                                    <td className="py-2 px-4 text-right text-red-400 font-bold">{formatKES(l.balance)}</td>
                                                    <td className="py-2 px-4 text-center">
                                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${l.status === 'paid' ? 'bg-emerald-500/20 text-emerald-400' : l.status === 'partial' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'}`}>
                                                            {l.status}
                                                        </span>
                                                    </td>
                                                    <td className="py-2 px-4 text-center">
                                                        <button
                                                            onClick={() => setPayModal({ show: true, entry: l, amount: l.balance.toString(), date: new Date().toISOString().split('T')[0], notes: '' })}
                                                            className="px-3 py-1 rounded-lg bg-brand-500/20 text-brand-400 hover:bg-brand-500 text-xs font-semibold transition-all hover:text-white"
                                                        >
                                                            Pay
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}</tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {credit.recent_payments?.length > 0 && (
                                <div className="glass-card p-5">
                                    <h3 className="text-white font-semibold mb-3">Recent Payments</h3>
                                    <div className="space-y-2">
                                        {credit.recent_payments.map(p => (
                                            <div key={p.id} className="flex items-center justify-between p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
                                                <div>
                                                    <p className="text-white font-medium text-sm">{p.customer_name}</p>
                                                    <p className="text-surface-500 text-xs">
                                                        {new Date(p.payment_date).toLocaleDateString()} {p.notes ? `• ${p.notes}` : ''}
                                                    </p>
                                                </div>
                                                <p className="text-emerald-400 font-bold">+{formatKES(p.amount)}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Financial Report */}
                    {tab === 'financial' && financial && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="glass-card p-5 border-l-4 border-l-emerald-500">
                                    <p className="text-surface-400 text-xs mb-1 uppercase tracking-wider">Net Profit</p>
                                    <p className={`text-2xl font-bold ${financial.summary.net_profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {formatKES(financial.summary.net_profit)}
                                    </p>
                                    <div className="mt-2 text-[10px] text-surface-500 flex justify-between uppercase">
                                        <span>Rev: {formatKES(financial.summary.total_revenue)}</span>
                                        <span>Exp: {formatKES(financial.summary.total_expenses)}</span>
                                    </div>
                                </div>
                                <div className="glass-card p-5 border-l-4 border-l-blue-500">
                                    <p className="text-surface-400 text-xs mb-1 uppercase tracking-wider">Total Assets</p>
                                    <p className="text-2xl font-bold text-blue-400">{formatKES(financial.summary.total_assets)}</p>
                                </div>
                                <div className="glass-card p-5 border-l-4 border-l-purple-500">
                                    <p className="text-surface-400 text-xs mb-1 uppercase tracking-wider">Equity (Net Worth)</p>
                                    <p className="text-2xl font-bold text-purple-400">{formatKES(financial.summary.equity)}</p>
                                    <p className="text-[10px] text-surface-500 mt-1 uppercase">After Liabilities: {formatKES(financial.summary.total_liabilities)}</p>
                                </div>
                            </div>

                            <div className="glass-card overflow-hidden">
                                <div className="p-4 border-b border-surface-700/50 bg-surface-800/30 flex items-center justify-between">
                                    <h3 className="text-white font-semibold flex items-center gap-2">
                                        <FileText size={18} className="text-brand-400" />
                                        Trial Balance (Ledger Accounts)
                                    </h3>
                                    <span className="text-[10px] text-surface-500 uppercase font-bold tracking-widest">Double Entry Verified</span>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b border-surface-700/50 text-surface-400 text-left">
                                                <th className="py-3 px-4 font-medium uppercase text-[11px] tracking-wider">Account</th>
                                                <th className="py-3 px-4 font-medium uppercase text-[11px] tracking-wider">Category</th>
                                                <th className="py-3 px-4 font-medium text-right uppercase text-[11px] tracking-wider">Debit</th>
                                                <th className="py-3 px-4 font-medium text-right uppercase text-[11px] tracking-wider">Credit</th>
                                                <th className="py-3 px-4 font-medium text-right uppercase text-[11px] tracking-wider">Balance</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-surface-800/50">
                                            {financial.trial_balance?.map((row, i) => (
                                                <tr key={i} className="hover:bg-surface-800/30 transition-colors">
                                                    <td className="py-3 px-4 text-white font-medium">{row.account_name}</td>
                                                    <td className="py-3 px-4">
                                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${row.account_type === 'Asset' ? 'bg-blue-500/10 text-blue-400' :
                                                            row.account_type === 'Revenue' ? 'bg-emerald-500/10 text-emerald-400' :
                                                                row.account_type === 'Expense' ? 'bg-red-500/10 text-red-400' :
                                                                    'bg-surface-700 text-surface-400'
                                                            }`}>
                                                            {row.account_type}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-4 text-right text-surface-300">
                                                        {row.total_debit > 0 ? formatKES(row.total_debit) : '-'}
                                                    </td>
                                                    <td className="py-3 px-4 text-right text-surface-300">
                                                        {row.total_credit > 0 ? formatKES(row.total_credit) : '-'}
                                                    </td>
                                                    <td className={`py-3 px-4 text-right font-bold ${row.net_balance >= 0 ? 'text-white' : 'text-red-400'
                                                        }`}>
                                                        {formatKES(Math.abs(row.net_balance))} {row.net_balance >= 0 ? '(Dr)' : '(Cr)'}
                                                    </td>
                                                </tr>
                                            ))}
                                            {(!financial.trial_balance || financial.trial_balance.length === 0) && (
                                                <tr>
                                                    <td colSpan="5" className="py-10 text-center text-surface-500">
                                                        No ledger entries found for this shop yet.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                    {/* Void Confirmation Modal */}
                    {voidConfirm && (
                        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md animate-fade-in">
                            <div className="glass-card p-6 max-w-sm w-full mx-4 shadow-2xl border-red-500/30">
                                <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center text-red-500 mx-auto mb-4">
                                    <AlertTriangle size={24} />
                                </div>
                                <h3 className="text-lg font-bold text-white text-center mb-2">Void Transaction?</h3>
                                <p className="text-surface-400 text-sm text-center mb-6">
                                    Are you sure you want to void <strong>{voidConfirm.receipt_number}</strong>?
                                    This will restore stock and create a reversing ledger entry.
                                    <span className="block mt-2 text-red-400/80 text-[10px] uppercase font-bold">This action is permanent for audit.</span>
                                </p>
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setVoidConfirm(null)}
                                        className="flex-1 py-2.5 rounded-xl bg-surface-800 hover:bg-surface-700 text-white text-sm font-medium"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleVoidSale}
                                        className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-bold shadow-lg shadow-red-600/20"
                                    >
                                        Confirm Void
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Payment Modal */}
            {payModal.show && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-surface-950/80 backdrop-blur-sm" onClick={() => setPayModal({ ...payModal, show: false })} />
                    <div className="glass-card w-full max-w-md p-6 relative z-10 animate-scale-in">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h2 className="text-xl font-bold text-white">Receive Payment</h2>
                                <p className="text-surface-400 text-sm mt-1">{payModal.entry?.customer_name} • {payModal.entry?.receipt_number}</p>
                            </div>
                            <button onClick={() => setPayModal({ ...payModal, show: false })} className="p-2 rounded-lg hover:bg-surface-800 text-surface-400 hover:text-white transition-colors">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div className="p-4 rounded-xl bg-surface-800/50 border border-surface-700/50 mb-4">
                                <div className="flex justify-between text-sm mb-1">
                                    <span className="text-surface-400">Current Balance</span>
                                    <span className="text-red-400 font-bold">{formatKES(payModal.entry?.balance)}</span>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-surface-400 mb-1.5">Payment Amount (KES)</label>
                                <div className="relative">
                                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-surface-500 font-medium">KES</div>
                                    <input
                                        type="number"
                                        value={payModal.amount}
                                        onChange={e => setPayModal({ ...payModal, amount: e.target.value })}
                                        className="w-full pl-14 pr-4 py-3 rounded-xl bg-surface-800/60 border border-surface-700 text-white placeholder-surface-500 focus:border-brand-500 transition-all outline-none"
                                        placeholder="0.00"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-surface-400 mb-1.5">Payment Date</label>
                                <div className="relative">
                                    <Calendar size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-surface-500" />
                                    <input
                                        type="date"
                                        value={payModal.date}
                                        onChange={e => setPayModal({ ...payModal, date: e.target.value })}
                                        className="w-full pl-12 pr-4 py-3 rounded-xl bg-surface-800/60 border border-surface-700 text-white focus:border-brand-500 transition-all outline-none"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-surface-400 mb-1.5">Notes (Optional)</label>
                                <textarea
                                    value={payModal.notes}
                                    onChange={e => setPayModal({ ...payModal, notes: e.target.value })}
                                    className="w-full px-4 py-3 rounded-xl bg-surface-800/60 border border-surface-700 text-white placeholder-surface-500 focus:border-brand-500 transition-all outline-none h-24 resize-none"
                                    placeholder="Enter details..."
                                />
                            </div>

                            <button
                                onClick={handlePay}
                                disabled={payLoading || !payModal.amount || parseFloat(payModal.amount) <= 0}
                                className="w-full py-4 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-400 hover:to-brand-500 text-white font-bold shadow-lg shadow-brand-500/20 transition-all disabled:opacity-50 mt-4 flex items-center justify-center gap-2"
                            >
                                {payLoading ? 'Processing...' : 'Record Payment'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
