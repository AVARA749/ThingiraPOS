import React, { useState, useEffect, useRef } from 'react';
import api from '../utils/api';
import { formatKES } from '../utils/format';
import { useToast } from '../context/ToastContext';
import { Search, Plus, Minus, Trash2, ShoppingCart, CreditCard, Banknote, X, Printer, User, Phone, Landmark } from 'lucide-react';

export default function POS() {
    const toast = useToast();
    const [items, setItems] = useState([]);
    const [search, setSearch] = useState('');
    const [cart, setCart] = useState([]);
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [paymentType, setPaymentType] = useState('cash');
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [receipt, setReceipt] = useState(null);
    const searchRef = useRef(null);

    useEffect(() => { loadItems(); }, []);

    const loadItems = async () => {
        try { const data = await api.getItems(); setItems(data); }
        catch (err) { toast.error('Failed to load items'); }
        finally { setLoading(false); }
    };

    const filteredItems = search.length > 0
        ? items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()) && i.quantity > 0)
        : [];

    const addToCart = (item) => {
        const existing = cart.find(c => c.item_id === item.id);
        if (existing) {
            if (existing.quantity >= item.quantity) {
                toast.warning(`Only ${item.quantity} available for "${item.name}"`);
                return;
            }
            setCart(cart.map(c => c.item_id === item.id
                ? { ...c, quantity: c.quantity + 1, subtotal: (c.quantity + 1) * c.unit_price }
                : c
            ));
        } else {
            if (item.quantity <= 0) { toast.warning(`"${item.name}" is out of stock`); return; }
            setCart([...cart, {
                item_id: item.id, item_name: item.name, unit_price: item.selling_price,
                quantity: 1, subtotal: item.selling_price, available: item.quantity,
            }]);
        }
        setSearch('');
        searchRef.current?.focus();
    };

    const updateQty = (itemId, delta) => {
        setCart(cart.map(c => {
            if (c.item_id !== itemId) return c;
            const newQty = c.quantity + delta;
            if (newQty <= 0) return null;
            if (newQty > c.available) { toast.warning(`Only ${c.available} available`); return c; }
            return { ...c, quantity: newQty, subtotal: newQty * c.unit_price };
        }).filter(Boolean));
    };

    const removeFromCart = (itemId) => {
        setCart(cart.filter(c => c.item_id !== itemId));
    };

    const cartTotal = cart.reduce((sum, c) => sum + c.subtotal, 0);

    const handleCheckout = async () => {
        if (cart.length === 0) { toast.warning('Cart is empty'); return; }
        if (paymentType === 'credit' && !customerName) { toast.warning('Customer name is required for credit sales'); return; }

        setProcessing(true);
        try {
            const result = await api.createSale({
                items: cart.map(c => ({ item_id: c.item_id, quantity: c.quantity, unit_price: c.unit_price })),
                customer_name: customerName || 'Walk-in Customer',
                customer_phone: customerPhone, payment_type: paymentType,
            });
            toast.success(`Sale completed! Receipt: ${result.receipt_number}`);
            setReceipt(result);
            setCart([]); setCustomerName(''); setCustomerPhone(''); setPaymentType('cash');
            loadItems();
        } catch (err) { toast.error(err.message); }
        finally { setProcessing(false); }
    };

    const printReceipt = () => {
        const win = window.open('', '_blank', 'width=350,height=600');
        win.document.write(receiptHTML(receipt));
        win.document.close();
        win.print();
    };

    if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>;

    return (
        <div className="animate-fade-in">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-white">Point of Sale</h1>
                    <p className="text-surface-400 text-sm mt-1">Process sales quickly</p>
                </div>
            </div>

            <div className="grid lg:grid-cols-5 gap-6">
                {/* Left: Item Search & Quick Select */}
                <div className="lg:col-span-3 space-y-4">
                    {/* Search */}
                    <div className="relative">
                        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-surface-500" />
                        <input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)}
                            placeholder="Search items to add to sale..." autoFocus
                            className="w-full pl-11 pr-4 py-3.5 rounded-xl bg-surface-800/60 border border-surface-700 text-white placeholder-surface-500 text-base" />
                    </div>

                    {/* Search Results */}
                    {filteredItems.length > 0 && (
                        <div className="glass-card max-h-60 overflow-y-auto divide-y divide-surface-800/50">
                            {filteredItems.slice(0, 10).map(item => (
                                <button key={item.id} onClick={() => addToCart(item)}
                                    className="w-full flex items-center gap-4 px-4 py-3 hover:bg-surface-800/40 transition-colors text-left">
                                    <div className="w-10 h-10 rounded-lg bg-brand-500/15 flex items-center justify-center text-brand-400">
                                        <ShoppingCart size={18} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-white font-medium text-sm">{item.name}</p>
                                        <p className="text-surface-500 text-xs">Stock: {item.quantity}</p>
                                    </div>
                                    <p className="text-brand-400 font-bold text-base">{formatKES(item.selling_price)}</p>
                                    <Plus size={20} className="text-brand-400" />
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Quick Select Grid */}
                    <div>
                        <h3 className="text-surface-400 text-xs font-semibold uppercase tracking-wider mb-3">Quick Select</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                            {items.filter(i => i.quantity > 0).slice(0, 16).map(item => (
                                <button key={item.id} onClick={() => addToCart(item)}
                                    className="glass-card p-3 hover:border-brand-500/40 hover:bg-brand-500/5 transition-all text-left group">
                                    <p className="text-white text-sm font-medium truncate group-hover:text-brand-400 transition-colors">{item.name}</p>
                                    <div className="flex items-center justify-between mt-1.5">
                                        <p className="text-brand-400 font-bold text-sm">{formatKES(item.selling_price)}</p>
                                        <span className="text-surface-500 text-xs">{item.quantity} left</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right: Cart & Checkout */}
                <div className="lg:col-span-2 space-y-4">
                    {/* Cart */}
                    <div className="glass-card p-4">
                        <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                            <ShoppingCart size={18} /> Cart ({cart.length} items)
                        </h3>

                        {cart.length === 0 ? (
                            <div className="text-center py-8 text-surface-500">
                                <ShoppingCart size={32} className="mx-auto mb-2 opacity-40" />
                                <p className="text-sm">Cart is empty</p>
                            </div>
                        ) : (
                            <div className="space-y-2 max-h-60 overflow-y-auto mb-4">
                                {cart.map(c => (
                                    <div key={c.item_id} className="flex items-center gap-3 p-2.5 rounded-lg bg-surface-800/40">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-white text-sm font-medium truncate">{c.item_name}</p>
                                            <p className="text-surface-500 text-xs">@ {formatKES(c.unit_price)}</p>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button onClick={() => updateQty(c.item_id, -1)} className="w-7 h-7 rounded-md bg-surface-700 hover:bg-surface-600 flex items-center justify-center text-white"><Minus size={14} /></button>
                                            <span className="w-8 text-center text-white font-bold text-sm">{c.quantity}</span>
                                            <button onClick={() => updateQty(c.item_id, 1)} className="w-7 h-7 rounded-md bg-surface-700 hover:bg-surface-600 flex items-center justify-center text-white"><Plus size={14} /></button>
                                        </div>
                                        <p className="text-brand-400 font-bold text-sm w-20 text-right">{formatKES(c.subtotal)}</p>
                                        <button onClick={() => removeFromCart(c.item_id)} className="text-surface-500 hover:text-red-400"><Trash2 size={15} /></button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Total */}
                        <div className="border-t border-surface-700/50 pt-3">
                            <div className="flex items-center justify-between">
                                <span className="text-surface-400 font-medium">Total</span>
                                <span className="text-2xl font-bold text-white">{formatKES(cartTotal)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Customer */}
                    <div className="glass-card p-4 space-y-3">
                        <h4 className="text-sm font-semibold text-surface-300 flex items-center gap-2"><User size={15} /> Customer</h4>
                        <input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Customer name (optional for cash)"
                            className="w-full px-3 py-2.5 rounded-lg bg-surface-800/60 border border-surface-700 text-white placeholder-surface-500 text-sm" />
                        <input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="Phone number"
                            className="w-full px-3 py-2.5 rounded-lg bg-surface-800/60 border border-surface-700 text-white placeholder-surface-500 text-sm" />
                    </div>

                    {/* Payment Type */}
                    <div className="glass-card p-4">
                        <h4 className="text-sm font-semibold text-surface-300 mb-3">Payment Method</h4>
                        <div className="grid grid-cols-2 gap-3">
                            <button onClick={() => setPaymentType('cash')}
                                className={`flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-semibold transition-all ${paymentType === 'cash'
                                    ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg shadow-green-500/25'
                                    : 'bg-surface-800 text-surface-400 hover:bg-surface-700'
                                    }`}>
                                <Banknote size={16} /> Cash
                            </button>
                            <button onClick={() => setPaymentType('mpesa')}
                                className={`flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-semibold transition-all ${paymentType === 'mpesa'
                                    ? 'bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-lg shadow-brand-500/25'
                                    : 'bg-surface-800 text-surface-400 hover:bg-surface-700'
                                    }`}>
                                <Phone size={16} /> Brian MPESA
                            </button>
                            <button onClick={() => setPaymentType('sacco')}
                                className={`flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-semibold transition-all ${paymentType === 'sacco'
                                    ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/25'
                                    : 'bg-surface-800 text-surface-400 hover:bg-surface-700'
                                    }`}>
                                <Landmark size={16} /> Direct Tai Sacco
                            </button>
                            <button onClick={() => setPaymentType('credit')}
                                className={`flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-semibold transition-all ${paymentType === 'credit'
                                    ? 'bg-gradient-to-r from-orange-500 to-amber-600 text-white shadow-lg shadow-orange-500/25'
                                    : 'bg-surface-800 text-surface-400 hover:bg-surface-700'
                                    }`}>
                                <CreditCard size={16} /> Credit
                            </button>
                        </div>
                        {paymentType === 'credit' && (
                            <p className="text-xs text-orange-400 mt-2">⚠ Credit sale: amount will be added to customer's debt.</p>
                        )}
                    </div>

                    {/* Checkout Button */}
                    <button onClick={handleCheckout} disabled={processing || cart.length === 0}
                        className="w-full py-4 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-400 hover:to-brand-500 text-white font-bold text-lg shadow-xl shadow-brand-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                        {processing ? 'Processing...' : `Checkout ${formatKES(cartTotal)}`}
                    </button>
                </div>
            </div>

            {/* Receipt Modal */}
            {receipt && (
                <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
                    <div className="glass-card p-6 max-w-md w-full mx-4 animate-slide-up">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-white">✅ Sale Complete</h3>
                            <button onClick={() => setReceipt(null)} className="text-surface-400 hover:text-white"><X size={20} /></button>
                        </div>
                        <div className="bg-white text-black p-4 rounded-lg text-sm font-mono">
                            <div className="text-center border-b pb-2 mb-2">
                                <p className="font-bold text-lg">ThingiraShop</p>
                                <p className="text-xs text-gray-500">Receipt</p>
                            </div>
                            <p><strong>Receipt:</strong> {receipt.receipt_number}</p>
                            <p><strong>Date:</strong> {new Date().toLocaleString('en-KE')}</p>
                            <p><strong>Customer:</strong> {receipt.sale?.customer_name}</p>
                            <p><strong>Payment:</strong> {
                                receipt.sale?.payment_type === 'mpesa' ? 'Brian MPESA' :
                                    receipt.sale?.payment_type === 'sacco' ? 'Direct Tai Sacco' :
                                        receipt.sale?.payment_type?.toUpperCase()
                            }</p>
                            <hr className="my-2" />
                            {receipt.items?.map((item, i) => (
                                <div key={i} className="flex justify-between text-xs py-0.5">
                                    <span>{item.item_name} x{item.quantity}</span>
                                    <span>KES {item.subtotal?.toFixed(2)}</span>
                                </div>
                            ))}
                            <hr className="my-2" />
                            <div className="flex justify-between font-bold text-base">
                                <span>TOTAL</span>
                                <span>{formatKES(receipt.sale?.total_amount)}</span>
                            </div>
                            <p className="text-center text-xs text-gray-400 mt-3">Thank you for shopping with us!</p>
                        </div>
                        <div className="flex gap-3 mt-4">
                            <button onClick={() => setReceipt(null)} className="flex-1 py-2.5 rounded-xl bg-surface-700 hover:bg-surface-600 text-surface-300 text-sm font-medium">Close</button>
                            <button onClick={printReceipt} className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 text-white text-sm font-semibold flex items-center justify-center gap-2">
                                <Printer size={16} /> Print
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function receiptHTML(receipt) {
    if (!receipt) return '';
    const items = receipt.items?.map(i => `<tr><td>${i.item_name}</td><td align="center">${i.quantity}</td><td align="right">KES ${i.subtotal?.toFixed(2)}</td></tr>`).join('') || '';
    return `<!DOCTYPE html><html><head><title>Receipt</title><style>body{font-family:monospace;width:72mm;margin:0 auto;padding:10px;font-size:12px}table{width:100%;border-collapse:collapse}td{padding:2px 0}.center{text-align:center}hr{border:none;border-top:1px dashed #000;margin:5px 0}.total{font-size:16px;font-weight:bold}</style></head><body>
  <div class="center"><h2 style="margin:0">ThingiraShop</h2><p style="font-size:10px">Point of Sale Receipt</p></div><hr>
  <p>Receipt: ${receipt.receipt_number}</p><p>Date: ${new Date().toLocaleString('en-KE')}</p><p>Customer: ${receipt.sale?.customer_name}</p><p>Payment: ${receipt.sale?.payment_type === 'mpesa' ? 'Brian MPESA' :
            receipt.sale?.payment_type === 'sacco' ? 'Direct Tai Sacco' :
                receipt.sale?.payment_type?.toUpperCase()
        }</p><hr>
  <table><tr><th align="left">Item</th><th>Qty</th><th align="right">Amount</th></tr>${items}</table><hr>
  <div class="total" style="display:flex;justify-content:space-between"><span>TOTAL</span><span>KES ${receipt.sale?.total_amount?.toFixed(2)}</span></div><hr>
  <p class="center" style="font-size:10px">Thank you for shopping!<br>ThingiraShop POS System</p></body></html>`;
}
