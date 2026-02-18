import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { formatKES, formatDateTime } from '../utils/format';
import { useToast } from '../context/ToastContext';
import { Lock, Unlock, DollarSign, History, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';

export default function ShiftControl() {
    const toast = useToast();
    const [status, setStatus] = useState({ isOpen: false, shift: null });
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [form, setForm] = useState({ cash: '', notes: '' });

    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
        try {
            const [s, h] = await Promise.all([api.getShiftStatus(), api.getShiftHistory()]);
            setStatus(s); setHistory(h);
        } catch (err) { toast.error('Failed to load shift records'); }
        finally { setLoading(false); }
    };

    const handleOpen = async (e) => {
        e.preventDefault();
        try {
            await api.openShift({ start_cash: parseFloat(form.cash) || 0, notes: form.notes });
            toast.success('Shift opened! You can now start selling.');
            setForm({ cash: '', notes: '' });
            loadData();
        } catch (err) { toast.error(err.message); }
    };

    const handleClose = async (e) => {
        e.preventDefault();
        try {
            const closed = await api.closeShift({ actual_cash: parseFloat(form.cash) || 0, notes: form.notes });
            const varText = closed.variance === 0 ? 'No variance.' :
                closed.variance > 0 ? `Surplus of ${formatKES(closed.variance)}` :
                    `Shortage of ${formatKES(Math.abs(closed.variance))}`;

            toast.info(`Shift closed. ${varText}`);
            setForm({ cash: '', notes: '' });
            loadData();
        } catch (err) { toast.error(err.message); }
    };

    if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>;

    const activeShift = status.shift;

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white">Shift Control</h1>
                    <p className="text-surface-400 text-sm mt-1">Manage drawer cash and session accountability</p>
                </div>
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider ${status.isOpen ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                    }`}>
                    {status.isOpen ? <><Unlock size={14} /> Shift Open</> : <><Lock size={14} /> Shift Closed</>}
                </div>
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
                {/* Active Action */}
                <div className="glass-card p-6">
                    <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                        {status.isOpen ? <Lock className="text-red-400" /> : <Unlock className="text-green-400" />}
                        {status.isOpen ? 'Close Shift (Cash Cleanup)' : 'Open New Shift (Float Entry)'}
                    </h3>

                    <form onSubmit={status.isOpen ? handleClose : handleOpen} className="space-y-5">
                        {status.isOpen && (
                            <div className="p-4 rounded-xl bg-surface-800/40 border border-surface-700/50 mb-2">
                                <div className="flex justify-between text-sm mb-1">
                                    <span className="text-surface-400">Opening Float:</span>
                                    <span className="text-white font-medium">{formatKES(activeShift.start_cash)}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-surface-400">Started At:</span>
                                    <span className="text-white font-medium">{new Date(activeShift.start_time).toLocaleString()}</span>
                                </div>
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-surface-300 mb-2">
                                {status.isOpen ? 'Actual Cash in Drawer' : 'Starting Float (Opening Cash)'}
                            </label>
                            <div className="relative">
                                <DollarSign size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500" />
                                <input
                                    type="number" step="0.01" required value={form.cash} onChange={e => setForm({ ...form, cash: e.target.value })}
                                    placeholder="0.00"
                                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-surface-800 border border-surface-700 text-white focus:border-brand-500 outline-none"
                                />
                            </div>
                            <p className="text-[10px] text-surface-500 mt-2 uppercase font-bold tracking-widest">
                                {status.isOpen ? 'Count physical cash including the float' : 'Enter amount used to start the day'}
                            </p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-surface-300 mb-2">Notes / Reason</label>
                            <textarea
                                value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                                placeholder={status.isOpen ? "Mention any broken cash or small expenses..." : "Stationery bought, etc."}
                                className="w-full px-4 py-3 rounded-xl bg-surface-800 border border-surface-700 text-white focus:border-brand-500 outline-none min-h-[100px]"
                            />
                        </div>

                        <button type="submit" className={`w-full py-4 rounded-xl text-white font-bold shadow-lg transition-all flex items-center justify-center gap-2 ${status.isOpen ? 'bg-gradient-to-r from-red-600 to-rose-700 hover:shadow-red-500/20' : 'bg-gradient-to-r from-green-600 to-emerald-700 hover:shadow-green-500/20'
                            }`}>
                            {status.isOpen ? <Lock size={18} /> : <Unlock size={18} />}
                            {status.isOpen ? 'Finalize & Close Shift' : 'Start My Shift'}
                        </button>
                    </form>
                </div>

                {/* Performance Analytics / Info */}
                <div className="space-y-6">
                    <div className="glass-card p-6 border-brand-500/20 bg-brand-500/[0.02]">
                        <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                            <AlertCircle size={18} className="text-brand-400" />
                            Why Cash Control Matters?
                        </h3>
                        <div className="space-y-4 text-sm text-surface-400">
                            <p>Without shifts, you cannot answer: <strong className="text-white">"Where is my money?"</strong></p>
                            <ul className="space-y-2">
                                <li className="flex gap-2">
                                    <div className="w-5 h-5 rounded bg-brand-500/10 flex items-center justify-center text-brand-400 font-bold text-[10px]">1</div>
                                    <span>Prevents "Till Leakage" where small amounts go missing.</span>
                                </li>
                                <li className="flex gap-2">
                                    <div className="w-5 h-5 rounded bg-brand-500/10 flex items-center justify-center text-brand-400 font-bold text-[10px]">2</div>
                                    <span>Identifies exactly WHICH cashier has a shortage.</span>
                                </li>
                                <li className="flex gap-2">
                                    <div className="w-5 h-5 rounded bg-brand-500/10 flex items-center justify-center text-brand-400 font-bold text-[10px]">3</div>
                                    <span>Forces a physical count daily, matching pure cash logic.</span>
                                </li>
                            </ul>
                        </div>
                    </div>

                    <div className="glass-card p-0 overflow-hidden">
                        <div className="p-4 border-b border-surface-700/50 flex items-center justify-between">
                            <h3 className="text-white font-bold flex items-center gap-2">
                                <History size={18} className="text-surface-400" /> Recent Shifts
                            </h3>
                        </div>
                        <div className="max-h-[300px] overflow-y-auto">
                            {history.length === 0 ? (
                                <div className="p-8 text-center text-surface-500 text-sm italic">No shift history found.</div>
                            ) : history.map(s => (
                                <div key={s.id} className="p-4 border-b border-surface-800/50 hover:bg-surface-800/30 transition-colors">
                                    <div className="flex justify-between items-start mb-2">
                                        <div>
                                            <p className="text-white font-semibold text-sm">{s.user_name}</p>
                                            <p className="text-[10px] text-surface-500">{new Date(s.start_time).toLocaleDateString()} {new Date(s.start_time).toLocaleTimeString()} - {s.end_time ? new Date(s.end_time).toLocaleTimeString() : 'Current'}</p>
                                        </div>
                                        {s.status === 'closed' && (
                                            <div className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${s.variance === 0 ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                                                {s.variance === 0 ? <CheckCircle2 size={10} className="inline mr-1" /> : <XCircle size={10} className="inline mr-1" />}
                                                Var: {formatKES(s.variance)}
                                            </div>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                                        <div className="text-surface-400">Float: <span className="text-surface-200">{formatKES(s.start_cash)}</span></div>
                                        <div className="text-surface-400">Actual: <span className="text-surface-200">{formatKES(s.actual_cash || 0)}</span></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
