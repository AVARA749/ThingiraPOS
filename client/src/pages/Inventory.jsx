import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { formatKES, formatDate } from '../utils/format';
import { useToast } from '../context/ToastContext';
import ConfirmDialog from '../components/ConfirmDialog';
import { Plus, Search, Edit3, Trash2, Package, X, ChevronDown } from 'lucide-react';

export default function Inventory() {
    const toast = useToast();
    const [items, setItems] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [editItem, setEditItem] = useState(null);
    const [deleteConfirm, setDeleteConfirm] = useState(null);
    const [formMode, setFormMode] = useState('purchase'); // 'purchase' or 'item'

    // Purchase form
    const [purchaseForm, setPurchaseForm] = useState({
        supplier_name: '', supplier_address: '', supplier_phone: '',
        date_purchased: new Date().toISOString().split('T')[0],
        items: [{ item_id: '', item_name: '', buying_price: '', selling_price: '', quantity: '', min_stock_level: '5', category: 'Others' }]
    });

    // Single item edit form
    const [editForm, setEditForm] = useState({
        name: '', buying_price: '', selling_price: '', quantity: '', min_stock_level: '5', category: 'Others'
    });

    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
        try {
            const [itemData, suppData] = await Promise.all([api.getItems(), api.getSuppliers()]);
            setItems(itemData); setSuppliers(suppData);
        } catch (err) { toast.error('Failed to load inventory'); }
        finally { setLoading(false); }
    };

    const filteredItems = items.filter(i =>
        i.name.toLowerCase().includes(search.toLowerCase()) ||
        i.category?.toLowerCase().includes(search.toLowerCase())
    );

    const resetForm = () => {
        setPurchaseForm({
            supplier_name: '', supplier_address: '', supplier_phone: '',
            date_purchased: new Date().toISOString().split('T')[0],
            items: [{ item_id: '', item_name: '', buying_price: '', selling_price: '', quantity: '', min_stock_level: '5', category: 'Others' }]
        });
        setEditForm({ name: '', buying_price: '', selling_price: '', quantity: '', min_stock_level: '5', category: 'Others' });
        setEditItem(null); setShowForm(false);
    };

    const addItemRow = () => {
        setPurchaseForm(f => ({
            ...f,
            items: [...f.items, { item_id: '', item_name: '', buying_price: '', selling_price: '', quantity: '', min_stock_level: '5', category: 'Others' }]
        }));
    };

    const removeItemRow = (index) => {
        if (purchaseForm.items.length <= 1) return;
        setPurchaseForm(f => ({
            ...f,
            items: f.items.filter((_, i) => i !== index)
        }));
    };

    const updateItemRow = (index, field, value) => {
        const newItems = [...purchaseForm.items];
        newItems[index] = { ...newItems[index], [field]: value };

        // If selecting an existing item, auto-fill prices
        if (field === 'item_id' && value) {
            const existing = items.find(i => i.id == value);
            if (existing) {
                newItems[index].item_name = existing.name;
                newItems[index].buying_price = existing.buying_price;
                newItems[index].selling_price = existing.selling_price;
                newItems[index].min_stock_level = existing.min_stock_level;
                newItems[index].category = existing.category;
            }
        }

        setPurchaseForm(f => ({ ...f, items: newItems }));
    };

    const handleFormSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editItem) {
                await api.updateItem(editItem.id, {
                    name: editForm.name,
                    buying_price: parseFloat(editForm.buying_price),
                    selling_price: parseFloat(editForm.selling_price),
                    quantity: parseInt(editForm.quantity),
                    min_stock_level: parseInt(editForm.min_stock_level),
                    category: editForm.category,
                });
                toast.success('Item updated successfully');
            } else {
                // Validate items
                if (purchaseForm.items.some(i => !i.item_name || !i.buying_price || !i.quantity)) {
                    return toast.warning('Please fill in all required item fields');
                }

                await api.createPurchase({
                    supplier_name: purchaseForm.supplier_name,
                    supplier_address: purchaseForm.supplier_address,
                    supplier_phone: purchaseForm.supplier_phone,
                    items: purchaseForm.items.map(i => ({
                        ...i,
                        buying_price: parseFloat(i.buying_price),
                        selling_price: parseFloat(i.selling_price),
                        quantity: parseInt(i.quantity),
                        min_stock_level: parseInt(i.min_stock_level),
                        date_purchased: purchaseForm.date_purchased
                    }))
                });
                toast.success('Stock intake recorded!');
            }
            resetForm(); loadData();
        } catch (err) { toast.error(err.message); }
    };

    const handleEdit = (item) => {
        setEditItem(item);
        setEditForm({
            name: item.name, buying_price: item.buying_price,
            selling_price: item.selling_price, quantity: item.quantity,
            min_stock_level: item.min_stock_level, category: item.category || 'Others',
        });
        setShowForm(true);
    };

    const handleDelete = async () => {
        if (!deleteConfirm) return;
        try {
            await api.deleteItem(deleteConfirm.id);
            toast.success('Item deleted');
            setDeleteConfirm(null); loadData();
        } catch (err) { toast.error(err.message); }
    };

    if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>;

    const CATEGORIES = ["Element", "Plugs", "Oils", "Brake Fluids", "Others"];

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Inventory</h1>
                    <p className="text-surface-400 text-sm mt-1">Manage stock intake & product catalog</p>
                </div>
                <button onClick={() => { resetForm(); setShowForm(true); }}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-400 hover:to-brand-500 text-white text-sm font-semibold shadow-lg shadow-brand-500/25 transition-all">
                    <Plus size={18} /> Add Stock
                </button>
            </div>

            {/* Search */}
            <div className="relative max-w-md">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search items..."
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface-800/60 border border-surface-700 text-white placeholder-surface-500 text-sm focus:border-brand-500/50 outline-none" />
            </div>

            {/* Items Table */}
            <div className="glass-card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-surface-700/50 text-surface-400 uppercase text-[11px] tracking-wider">
                                <th className="text-left py-4 px-4 font-medium">Item</th>
                                <th className="text-left py-4 px-4 font-medium hidden md:table-cell">Category</th>
                                <th className="text-right py-4 px-4 font-medium">Buy Price</th>
                                <th className="text-right py-4 px-4 font-medium">Sell Price</th>
                                <th className="text-right py-4 px-4 font-medium">Stock</th>
                                <th className="text-center py-4 px-4 font-medium">Status</th>
                                <th className="text-left py-4 px-4 font-medium hidden lg:table-cell">Supplier</th>
                                <th className="text-right py-4 px-4 font-medium">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-surface-800/50">
                            {filteredItems.map(item => (
                                <tr key={item.id} className="hover:bg-surface-800/30 transition-colors">
                                    <td className="py-3 px-4">
                                        <p className="text-white font-medium">{item.name}</p>
                                    </td>
                                    <td className="py-3 px-4 text-surface-400 hidden md:table-cell">
                                        <span className="bg-surface-800 px-2 py-0.5 rounded text-[10px] uppercase font-bold text-surface-400 border border-surface-700/50">
                                            {item.category}
                                        </span>
                                    </td>
                                    <td className="py-3 px-4 text-right text-surface-300 font-mono font-medium">{formatKES(item.buying_price)}</td>
                                    <td className="py-3 px-4 text-right text-white font-bold font-mono">{formatKES(item.selling_price)}</td>
                                    <td className="py-3 px-4 text-right text-white font-bold">{item.quantity}</td>
                                    <td className="py-3 px-4 text-center">
                                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${item.quantity <= 0 ? 'badge-out' : item.quantity <= item.min_stock_level ? 'badge-low' : 'badge-ok'
                                            }`}>
                                            {item.quantity <= 0 ? 'OUT' : item.quantity <= item.min_stock_level ? 'LOW' : 'OK'}
                                        </span>
                                    </td>
                                    <td className="py-3 px-4 text-surface-400 hidden lg:table-cell">{item.supplier_name || '-'}</td>
                                    <td className="py-3 px-4 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <button onClick={() => handleEdit(item)} className="p-1.5 rounded-lg hover:bg-surface-700 text-surface-500 hover:text-white transition-colors">
                                                <Edit3 size={15} />
                                            </button>
                                            <button onClick={() => setDeleteConfirm(item)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-surface-500 hover:text-red-400 transition-colors">
                                                <Trash2 size={15} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {filteredItems.length === 0 && (
                    <div className="text-center py-16 text-surface-500">
                        <div className="w-16 h-16 rounded-full bg-surface-800 flex items-center justify-center mx-auto mb-4 border border-surface-700/50">
                            <Package size={30} className="opacity-40" />
                        </div>
                        <p className="font-medium text-surface-400">No items found</p>
                        <p className="text-xs text-surface-600 mt-1">Try a different search term or add a new item.</p>
                    </div>
                )}
            </div>

            {/* Add/Edit Form Modal */}
            {showForm && (
                <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/80 backdrop-blur-md animate-fade-in py-8 px-4">
                    <div className="glass-card max-w-4xl w-full animate-slide-up flex flex-col max-h-[90vh] shadow-2xl overflow-hidden">
                        <div className="p-6 border-b border-surface-700/50 flex items-center justify-between shrink-0">
                            <h3 className="text-lg font-bold text-white">{editItem ? 'Edit Product Details' : 'Batch Stock Intake'}</h3>
                            <button onClick={resetForm} className="text-surface-400 hover:text-white p-1 hover:bg-surface-700 rounded-lg transition-colors"><X size={20} /></button>
                        </div>

                        <form onSubmit={handleFormSubmit} className="flex flex-col flex-1 min-h-0">
                            <div className="p-6 overflow-y-auto space-y-8 flex-1">
                                {editItem ? (
                                    /* SINGLE ITEM EDIT */
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div>
                                            <label className="text-xs font-bold text-surface-500 mb-2 block uppercase tracking-wider">Item Name</label>
                                            <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} required
                                                className="w-full px-4 py-3 rounded-xl bg-surface-800 border border-surface-700 text-white text-sm focus:border-brand-500/50 outline-none" />
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-surface-500 mb-2 block uppercase tracking-wider">Category</label>
                                            <select value={editForm.category} onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))}
                                                className="w-full px-4 py-3 rounded-xl bg-surface-800 border border-surface-700 text-white text-sm focus:border-brand-500/50 outline-none">
                                                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-surface-500 mb-2 block uppercase tracking-wider">Buying Price (KES)</label>
                                            <input type="number" step="0.01" value={editForm.buying_price} onChange={e => setEditForm(f => ({ ...f, buying_price: e.target.value }))} required
                                                className="w-full px-4 py-3 rounded-xl bg-surface-800 border border-surface-700 text-white text-sm font-mono focus:border-brand-500/50 outline-none" />
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-surface-500 mb-2 block uppercase tracking-wider">Selling Price (KES)</label>
                                            <input type="number" step="0.01" value={editForm.selling_price} onChange={e => setEditForm(f => ({ ...f, selling_price: e.target.value }))} required
                                                className="w-full px-4 py-3 rounded-xl bg-surface-800 border border-surface-700 text-white text-sm font-mono focus:border-brand-500/50 outline-none" />
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-surface-500 mb-2 block uppercase tracking-wider">Current Quantity</label>
                                            <input type="number" value={editForm.quantity} onChange={e => setEditForm(f => ({ ...f, quantity: e.target.value }))} required
                                                className="w-full px-4 py-3 rounded-xl bg-surface-800 border border-surface-700 text-white text-sm focus:border-brand-500/50 outline-none" />
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-surface-500 mb-2 block uppercase tracking-wider">Alt Min Stock</label>
                                            <input type="number" value={editForm.min_stock_level} onChange={e => setEditForm(f => ({ ...f, min_stock_level: e.target.value }))}
                                                className="w-full px-4 py-3 rounded-xl bg-surface-800 border border-surface-700 text-white text-sm focus:border-brand-500/50 outline-none" />
                                        </div>
                                    </div>
                                ) : (
                                    /* BATCH PURCHASE FORM */
                                    <div className="space-y-10">
                                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pb-8 border-b border-surface-800/50 items-end">
                                            <div className="md:col-span-2">
                                                <label className="text-[10px] font-bold text-surface-500 mb-2 block uppercase tracking-widest">Supplier Name</label>
                                                <input value={purchaseForm.supplier_name} onChange={e => setPurchaseForm(f => ({ ...f, supplier_name: e.target.value }))} placeholder="Select or type supplier..." required
                                                    className="w-full px-4 py-3 rounded-xl bg-surface-800 border border-surface-700 text-white text-sm focus:border-brand-500/50 outline-none" />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-bold text-surface-500 mb-2 block uppercase tracking-widest">Supplier Phone</label>
                                                <input value={purchaseForm.supplier_phone} onChange={e => setPurchaseForm(f => ({ ...f, supplier_phone: e.target.value }))} placeholder="Phone"
                                                    className="w-full px-4 py-3 rounded-xl bg-surface-800 border border-surface-700 text-white text-sm focus:border-brand-500/50 outline-none" />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-bold text-surface-500 mb-2 block uppercase tracking-widest">Date</label>
                                                <input type="date" value={purchaseForm.date_purchased} onChange={e => setPurchaseForm(f => ({ ...f, date_purchased: e.target.value }))}
                                                    className="w-full px-4 py-3 rounded-xl bg-surface-800 border border-surface-700 text-white text-sm focus:border-brand-500/50 outline-none" />
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between mb-2">
                                                <h4 className="text-sm font-bold text-white uppercase tracking-widest">Product Items</h4>
                                                <button type="button" onClick={addItemRow} className="text-xs font-bold text-brand-400 hover:text-brand-300 flex items-center gap-1 transition-colors">
                                                    <Plus size={14} /> Add Another Row
                                                </button>
                                            </div>

                                            <div className="space-y-3">
                                                {purchaseForm.items.map((row, idx) => (
                                                    <div key={idx} className="p-5 rounded-2xl bg-surface-800/40 border border-surface-700/30 grid grid-cols-1 md:grid-cols-12 gap-4 items-end group relative animate-slide-up" style={{ animationDelay: `${idx * 50}ms` }}>
                                                        <div className="md:col-span-4">
                                                            <label className="text-[10px] font-bold text-surface-500 mb-2 block uppercase tracking-widest">Product</label>
                                                            <select value={row.item_id} onChange={e => updateItemRow(idx, 'item_id', e.target.value)}
                                                                className="w-full px-3 py-2 rounded-lg bg-surface-800 border border-surface-700 text-white text-sm focus:border-brand-500 outline-none mb-2">
                                                                <option value="">— Create New Item —</option>
                                                                {items.map(i => <option key={i.id} value={i.id}>{i.name} (Stock: {i.quantity})</option>)}
                                                            </select>
                                                            <input value={row.item_name} onChange={e => updateItemRow(idx, 'item_name', e.target.value)} placeholder="Type item name..." required
                                                                className="w-full px-3 py-2 rounded-lg bg-surface-900 border border-surface-800 text-white text-sm focus:border-brand-500 outline-none" />
                                                        </div>
                                                        <div className="md:col-span-2">
                                                            <label className="text-[10px] font-bold text-surface-500 mb-2 block uppercase tracking-widest">Buy (KES)</label>
                                                            <input type="number" step="0.01" value={row.buying_price} onChange={e => updateItemRow(idx, 'buying_price', e.target.value)} placeholder="Price" required
                                                                className="w-full px-3 py-2 rounded-lg bg-surface-900 border border-surface-800 text-white text-sm font-mono focus:border-brand-500 outline-none" />
                                                        </div>
                                                        <div className="md:col-span-2">
                                                            <label className="text-[10px] font-bold text-surface-500 mb-2 block uppercase tracking-widest">Sell (KES)</label>
                                                            <input type="number" step="0.01" value={row.selling_price} onChange={e => updateItemRow(idx, 'selling_price', e.target.value)} placeholder="Price" required
                                                                className="w-full px-3 py-2 rounded-lg bg-surface-900 border border-surface-800 text-white text-sm font-mono focus:border-brand-500 outline-none" />
                                                        </div>
                                                        <div className="md:col-span-1">
                                                            <label className="text-[10px] font-bold text-surface-500 mb-2 block uppercase tracking-widest">Qty</label>
                                                            <input type="number" value={row.quantity} onChange={e => updateItemRow(idx, 'quantity', e.target.value)} placeholder="0" required
                                                                className="w-full px-3 py-2 rounded-lg bg-surface-900 border border-surface-800 text-white text-sm focus:border-brand-500 outline-none" />
                                                        </div>
                                                        <div className="md:col-span-2">
                                                            <label className="text-[10px] font-bold text-surface-500 mb-2 block uppercase tracking-widest">Category</label>
                                                            <select value={row.category} onChange={e => updateItemRow(idx, 'category', e.target.value)}
                                                                className="w-full px-3 py-2 rounded-lg bg-surface-900 border border-surface-800 text-white text-sm focus:border-brand-500 outline-none">
                                                                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                                            </select>
                                                        </div>
                                                        <div className="md:col-span-1 flex justify-center">
                                                            {purchaseForm.items.length > 1 && (
                                                                <button type="button" onClick={() => removeItemRow(idx)} className="p-2 text-surface-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                                                                    <Trash2 size={16} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="p-6 border-t border-surface-700/50 flex gap-4 shrink-0 bg-surface-900/50 backdrop-blur-md">
                                <button type="button" onClick={resetForm} className="flex-1 py-3.5 rounded-2xl bg-surface-800 hover:bg-surface-700 text-surface-300 text-sm font-bold transition-all border border-surface-700/50">Cancel</button>
                                <button type="submit" className="flex-[2] py-3.5 rounded-2xl bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-400 hover:to-brand-500 text-white text-sm font-bold shadow-xl shadow-brand-500/20 active:scale-[0.98] transition-all">
                                    {editItem ? <><Edit3 size={18} className="inline mr-2" /> Save Changes</> : <><Package size={18} className="inline mr-2" /> Complete Batch Intake</>}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <ConfirmDialog isOpen={!!deleteConfirm} title="Delete Item" message={`Are you sure you want to delete "${deleteConfirm?.name}"? This cannot be undone.`}
                onConfirm={handleDelete} onCancel={() => setDeleteConfirm(null)} danger />
        </div>
    );
}
