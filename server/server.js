require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const { getDatabase, closeDatabase } = require('./db/database');

const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const itemRoutes = require('./routes/items');
const supplierRoutes = require('./routes/suppliers');
const purchaseRoutes = require('./routes/purchases');
const salesRoutes = require('./routes/sales');
const customerRoutes = require('./routes/customers');
const stockRoutes = require('./routes/stock');
const reportRoutes = require('./routes/reports');
const shiftRoutes = require('./routes/shifts');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginEmbedderPolicy: false
}));
app.use(cors({ origin: '*' })); // Allow all origins, no credentials needed for Bearer token
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Custom Request Logger
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms)`);
    });
    next();
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/shifts', shiftRoutes);

// Health checks
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', name: 'ThingiraShop API', version: '1.0.0' });
});

app.get('/api/ping', (req, res) => {
    res.send('pong');
});

// Serve static files in production
const clientBuildPath = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientBuildPath));
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(clientBuildPath, 'index.html'));
    }
});

// Error handling
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error.' });
});

// Initialize database and start server
const startServer = async () => {
    try {
        const { initDatabase } = require('./db/database');
        await initDatabase();

        app.listen(PORT, '0.0.0.0', () => {
            console.log(`\n🏪 ThingiraShop API running on http://0.0.0.0:${PORT}`);
            console.log(`📦 Database: PostgreSQL (Connected)\n`);
        });
    } catch (err) {
        console.error('❌ Failed to start server:', err);
        process.exit(1);
    }
};

startServer();

process.on('SIGINT', () => { closeDatabase(); process.exit(0); });
process.on('SIGTERM', () => { closeDatabase(); process.exit(0); });

module.exports = app;
