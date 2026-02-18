const { getDatabase, closeDatabase } = require('./database');

function migrate() {
    const db = getDatabase();
    console.log('🔄 Migrating database to support new payment methods...');

    try {
        // SQLite doesn't support changing CHECK constraints easily.
        // We need to disable foreign keys, rename table, create new table, copy data, drop old, rename back.

        db.exec('PRAGMA foreign_keys=OFF;');

        db.exec('BEGIN TRANSACTION;');

        // 1. Rename existing table
        db.exec('ALTER TABLE sales RENAME TO sales_old;');

        // 2. Create new table with updated CHECK constraint
        db.exec(`
      CREATE TABLE sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        receipt_number TEXT UNIQUE,
        customer_id INTEGER,
        customer_name TEXT,
        customer_phone TEXT,
        total_amount REAL NOT NULL DEFAULT 0,
        payment_type TEXT NOT NULL CHECK(payment_type IN ('cash', 'credit', 'mpesa', 'sacco')) DEFAULT 'cash',
        status TEXT DEFAULT 'completed' CHECK(status IN ('completed', 'voided')),
        notes TEXT,
        created_at DATETIME DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
      );
    `);

        // 3. Copy data
        db.exec('INSERT INTO sales SELECT * FROM sales_old;');

        // 4. Drop old table
        db.exec('DROP TABLE sales_old;');

        // 5. Re-create index
        db.exec('CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(created_at);');
        db.exec('CREATE INDEX IF NOT EXISTS idx_sales_payment ON sales(payment_type);');

        db.exec('COMMIT;');
        db.exec('PRAGMA foreign_keys=ON;');

        console.log('✅ Sales table updated successfully!');
    } catch (err) {
        db.exec('ROLLBACK;');
        console.error('❌ Migration failed:', err);
    } finally {
        closeDatabase();
    }
}

migrate();
