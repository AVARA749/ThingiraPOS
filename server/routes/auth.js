const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getOne, query, getDatabase } = require('../db/database');
const { JWT_SECRET, authenticateToken } = require('../middleware/auth');

const router = express.Router();

router.get('/test', (req, res) => res.json({ message: 'Auth routes are reachable' }));

// POST /api/auth/register
router.post('/register', async (req, res) => {
    try {
        const { username, password, full_name, shop_name, phone } = req.body;

        // Validation
        if (!username || !password || !full_name) {
            return res.status(400).json({ error: 'Username, password, and full name are required.' });
        }
        if (username.length < 3) {
            return res.status(400).json({ error: 'Username must be at least 3 characters long.' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
        }

        // Check if user exists
        const existing = await getOne('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [username]);
        if (existing) {
            return res.status(409).json({ error: 'Username already taken.' });
        }

        // Handle Shop Creation/Linking
        let shopId = null;
        let finalShopName = shop_name || 'ThingiraShop';

        // Check if shop exists
        let shop = await getOne('SELECT id, name FROM shops WHERE LOWER(name) = LOWER($1)', [finalShopName]);
        if (!shop) {
            // Create new shop
            const shopResult = await query('INSERT INTO shops (name) VALUES ($1) RETURNING id', [finalShopName]);
            shopId = shopResult.rows[0].id;
        } else {
            shopId = shop.id;
        }

        // Check if this is the first user of THIS shop (make them admin)
        const shopUserCount = await getOne('SELECT COUNT(*)::INTEGER as count FROM users WHERE shop_id = $1', [shopId]);
        const role = shopUserCount.count === 0 ? 'admin' : 'staff';

        const passwordHash = bcrypt.hashSync(password, 10);
        const result = await query(`
            INSERT INTO users (username, password_hash, full_name, shop_name, shop_id, phone, role)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id, username, full_name, shop_name, shop_id, phone, role
        `, [username, passwordHash, full_name, finalShopName, shopId, phone || '', role]);

        const user = result.rows[0];

        const token = jwt.sign(
            { id: user.id, username: user.username, full_name: user.full_name, shop_name: user.shop_name, shop_id: user.shop_id, role: user.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.status(201).json({ token, user });
    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({ error: 'Server error during registration.' });
    }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required.' });
        }

        const user = await getOne('SELECT * FROM users WHERE LOWER(username) = LOWER($1)', [username]);

        if (!user) {
            return res.status(401).json({ error: 'Invalid username or password.' });
        }

        const validPassword = bcrypt.compareSync(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid username or password.' });
        }

        const token = jwt.sign(
            { id: user.id, username: user.username, full_name: user.full_name, shop_name: user.shop_name, shop_id: user.shop_id, role: user.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                full_name: user.full_name,
                shop_name: user.shop_name,
                shop_id: user.shop_id,
                phone: user.phone,
                role: user.role
            },
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Server error during login.' });
    }
});

// GET /api/auth/me
router.get('/me', authenticateToken, async (req, res) => {
    try {
        const user = await getOne('SELECT id, username, full_name, shop_name, shop_id, phone, role FROM users WHERE id = $1', [req.user.id]);
        if (!user) return res.status(404).json({ error: 'User not found.' });
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: 'Server error.' });
    }
});

module.exports = router;
