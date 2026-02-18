const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:5000/api' : '/api';

function getToken() {
    return localStorage.getItem('thingira_token');
}

async function request(endpoint, options = {}) {
    const token = getToken();
    const config = {
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...options.headers,
        },
        ...options,
    };

    try {
        const response = await fetch(`${API_BASE}${endpoint}`, config);

        if (response.status === 401 || response.status === 403) {
            localStorage.removeItem('thingira_token');
            localStorage.removeItem('thingira_user');
            // Check if we are on login page already to avoid loops
            if (!window.location.hash.includes('login') && !window.location.pathname.includes('login')) {
                // Let AuthContext handle state
            }
            throw new Error('Session expired. Please sign in again.');
        }

        // CSV download
        if (response.headers.get('content-type')?.includes('text/csv')) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = response.headers.get('content-disposition')?.split('filename=')[1] || 'report.csv';
            a.click();
            window.URL.revokeObjectURL(url);
            return { success: true };
        }

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Request failed');
        return data;
    } catch (err) {
        console.error(`API Error [${endpoint}]:`, err);
        throw err;
    }
}

const api = {
    // Auth
    login: (username, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
    register: (data) => request('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
    me: () => request('/auth/me'),

    // Dashboard
    dashboardSummary: () => request('/dashboard/summary'),
    hourlySales: () => request('/dashboard/hourly-sales'),
    topItems: () => request('/dashboard/top-items'),
    recentTransactions: () => request('/dashboard/recent-transactions'),

    // Items
    getItems: (params = '') => request(`/items${params ? '?' + params : ''}`),
    getItem: (id) => request(`/items/${id}`),
    createItem: (data) => request('/items', { method: 'POST', body: JSON.stringify(data) }),
    updateItem: (id, data) => request(`/items/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteItem: (id) => request(`/items/${id}`, { method: 'DELETE' }),
    getCategories: () => request('/items/categories'),

    // Suppliers
    getSuppliers: () => request('/suppliers'),
    createSupplier: (data) => request('/suppliers', { method: 'POST', body: JSON.stringify(data) }),
    getSupplierPurchases: (id) => request(`/suppliers/${id}/purchases`),

    // Purchases
    createPurchase: (data) => request('/purchases', { method: 'POST', body: JSON.stringify(data) }),
    getPurchases: (params = '') => request(`/purchases${params ? '?' + params : ''}`),

    // Sales
    createSale: (data) => request('/sales', { method: 'POST', body: JSON.stringify(data) }),
    getSales: (params = '') => request(`/sales${params ? '?' + params : ''}`),
    getSale: (id) => request(`/sales/${id}`),
    voidSale: (id) => request(`/sales/${id}`, { method: 'DELETE' }),

    // Customers
    getCustomers: (q = '') => request(`/customers${q ? '?q=' + q : ''}`),
    getCustomerLedger: (id) => request(`/customers/${id}/ledger`),
    payCredit: (id, data) => request(`/customers/${id}/pay`, { method: 'POST', body: JSON.stringify(data) }),

    // Stock
    stockMovements: (params = '') => request(`/stock/movements${params ? '?' + params : ''}`),
    stockIn: (params = '') => request(`/stock/in${params ? '?' + params : ''}`),
    stockOut: (params = '') => request(`/stock/out${params ? '?' + params : ''}`),
    currentStock: () => request('/stock/current'),

    // Reports
    dailyReport: (date) => request(`/reports/daily${date ? '?date=' + date : ''}`),
    inventoryReport: () => request('/reports/inventory'),
    creditReport: () => request('/reports/credit'),
    financialReport: () => request('/reports/financial'),
    exportCSV: (type, from, to) => request(`/reports/export/csv?type=${type}${from ? '&from=' + from : ''}${to ? '&to=' + to : ''}`),

    // Shifts
    getShiftStatus: () => request('/shifts/status'),
    openShift: (data) => request('/shifts/open', { method: 'POST', body: JSON.stringify(data) }),
    closeShift: (data) => request('/shifts/close', { method: 'POST', body: JSON.stringify(data) }),
    getShiftHistory: () => request('/shifts/history'),
};

export default api;
