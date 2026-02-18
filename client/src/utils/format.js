export function formatKES(amount) {
    if (amount === null || amount === undefined) return 'KES 0.00';
    return 'KES ' + Number(amount).toLocaleString('en-KE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

export function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatTime(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
}

export function getStatusBadge(status) {
    switch (status) {
        case 'OK': return 'badge-ok';
        case 'LOW': return 'badge-low';
        case 'OUT': return 'badge-out';
        default: return 'badge-ok';
    }
}

export function getPaymentBadge(type) {
    switch (type) {
        case 'cash': return 'badge-cash';
        case 'credit': return 'badge-credit';
        case 'mpesa': return 'bg-brand-500/20 text-brand-400';
        case 'sacco': return 'bg-blue-500/20 text-blue-400';
        default: return 'bg-surface-800 text-surface-400';
    }
}
