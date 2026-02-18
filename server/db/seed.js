const bcrypt = require('bcryptjs');
const { getDatabase, closeDatabase } = require('./database');

function seed() {
    const db = getDatabase();

    console.log('🧹 Cleaning ThingiraShop database...\n');

    // Clear all data
    db.exec(`
    DELETE FROM credit_ledger;
    DELETE FROM stock_movements;
    DELETE FROM sale_items;
    DELETE FROM sales;
    DELETE FROM purchases;
    DELETE FROM items;
    DELETE FROM customers;
    DELETE FROM suppliers;
    DELETE FROM users;
  `);

    // Create admin user only
    const passwordHash = bcrypt.hashSync('thingira2024', 10);
    db.prepare(`
    INSERT INTO users (username, password_hash, full_name, shop_name, phone)
    VALUES (?, ?, ?, ?, ?)
  `).run('admin', passwordHash, 'James Mwangi', 'ThingiraShop', '0722000111');

    console.log('👤 Admin user created (admin / thingira2024)');

    closeDatabase();
    console.log('\n✅ Database cleaned! All tables are empty.');
    console.log('📌 Login: admin / thingira2024\n');
}

seed();
