-- ThingiraShop PostgreSQL Schema with Multi-Shop Support

-- 1. Ensure Shops Table exists first
CREATE TABLE IF NOT EXISTS shops (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT,
    phone TEXT,
    email TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. Create a default shop (for existing data migration)
INSERT INTO shops (id, name) VALUES (1, 'Default Shop') ON CONFLICT (id) DO NOTHING;
SELECT setval('shops_id_seq', (SELECT MAX(id) FROM shops));

-- 3. Create Tables (if they don't exist)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    shop_name TEXT,
    phone TEXT,
    role TEXT DEFAULT 'admin' CHECK(role IN ('admin', 'staff')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS suppliers (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT,
    phone TEXT,
    email TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS items (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    buying_price DECIMAL(10, 2) NOT NULL DEFAULT 0,
    selling_price DECIMAL(10, 2) NOT NULL DEFAULT 0,
    quantity INTEGER NOT NULL DEFAULT 0,
    min_stock_level INTEGER NOT NULL DEFAULT 5,
    supplier_id INTEGER,
    category TEXT DEFAULT 'General',
    barcode TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS purchases (
    id SERIAL PRIMARY KEY,
    supplier_id INTEGER NOT NULL,
    item_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    buying_price DECIMAL(10, 2) NOT NULL,
    total_cost DECIMAL(10, 2) NOT NULL,
    date_purchased DATE NOT NULL DEFAULT CURRENT_DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    address TEXT,
    total_credit DECIMAL(10, 2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sales (
    id SERIAL PRIMARY KEY,
    receipt_number TEXT,
    customer_id INTEGER,
    customer_name TEXT,
    customer_phone TEXT,
    total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
    payment_type TEXT NOT NULL CHECK(payment_type IN ('cash', 'credit', 'mpesa', 'sacco')) DEFAULT 'cash',
    status TEXT DEFAULT 'completed' CHECK(status IN ('completed', 'voided')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sale_items (
    id SERIAL PRIMARY KEY,
    sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    item_id INTEGER NOT NULL,
    item_name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10, 2) NOT NULL,
    buying_price DECIMAL(10, 2) NOT NULL DEFAULT 0,
    subtotal DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stock_movements (
    id SERIAL PRIMARY KEY,
    item_id INTEGER NOT NULL,
    item_name TEXT NOT NULL,
    movement_type TEXT NOT NULL CHECK(movement_type IN ('IN', 'OUT', 'ADJUSTMENT', 'RETURN', 'EDIT')),
    quantity INTEGER NOT NULL,
    balance_after INTEGER NOT NULL DEFAULT 0,
    reference_type TEXT CHECK(reference_type IN ('purchase', 'sale', 'adjustment', 'delete_sale', 'edit')),
    reference_id INTEGER,
    supplier_name TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS credit_ledger (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL,
    customer_name TEXT NOT NULL,
    sale_id INTEGER NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    paid_amount DECIMAL(10, 2) DEFAULT 0,
    balance DECIMAL(10, 2) NOT NULL,
    status TEXT DEFAULT 'unpaid' CHECK(status IN ('unpaid', 'partial', 'paid', 'voided')),
    due_date DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS credit_payments (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL,
    ledger_id INTEGER,
    amount DECIMAL(10, 2) NOT NULL,
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    notes TEXT,
    shop_id INTEGER REFERENCES shops(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS general_ledger (
    id SERIAL PRIMARY KEY,
    shop_id INTEGER REFERENCES shops(id) ON DELETE CASCADE,
    account_name TEXT NOT NULL,
    account_type TEXT NOT NULL, -- 'Asset', 'Liability', 'Equity', 'Revenue', 'Expense'
    debit DECIMAL(12, 2) DEFAULT 0,
    credit DECIMAL(12, 2) DEFAULT 0,
    reference_type TEXT, -- 'sale', 'purchase', 'payment', 'void', 'adjustment'
    reference_id INTEGER,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS shift_registers (
    id SERIAL PRIMARY KEY,
    shop_id INTEGER REFERENCES shops(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),
    start_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMPTZ,
    start_cash DECIMAL(10, 2) NOT NULL DEFAULT 0,
    expected_cash DECIMAL(10, 2),
    actual_cash DECIMAL(10, 2),
    variance DECIMAL(10, 2),
    status TEXT DEFAULT 'open' CHECK(status IN ('open', 'closed')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 4. Migration: Add shop_id to all tables if missing
DO $$ 
BEGIN
    -- users
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='shop_id') THEN
        ALTER TABLE users ADD COLUMN shop_id INTEGER REFERENCES shops(id) ON DELETE CASCADE;
        UPDATE users SET shop_id = 1 WHERE shop_id IS NULL;
    END IF;

    -- suppliers
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='suppliers' AND column_name='shop_id') THEN
        ALTER TABLE suppliers ADD COLUMN shop_id INTEGER REFERENCES shops(id) ON DELETE CASCADE;
        UPDATE suppliers SET shop_id = 1 WHERE shop_id IS NULL;
    END IF;

    -- items
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='items' AND column_name='shop_id') THEN
        ALTER TABLE items ADD COLUMN shop_id INTEGER REFERENCES shops(id) ON DELETE CASCADE;
        UPDATE items SET shop_id = 1 WHERE shop_id IS NULL;
    END IF;

    -- purchases
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='purchases' AND column_name='shop_id') THEN
        ALTER TABLE purchases ADD COLUMN shop_id INTEGER REFERENCES shops(id) ON DELETE CASCADE;
        UPDATE purchases SET shop_id = 1 WHERE shop_id IS NULL;
    END IF;

    -- customers
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='shop_id') THEN
        ALTER TABLE customers ADD COLUMN shop_id INTEGER REFERENCES shops(id) ON DELETE CASCADE;
        UPDATE customers SET shop_id = 1 WHERE shop_id IS NULL;
    END IF;

    -- sales
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sales' AND column_name='shop_id') THEN
        ALTER TABLE sales ADD COLUMN shop_id INTEGER REFERENCES shops(id) ON DELETE CASCADE;
        UPDATE sales SET shop_id = 1 WHERE shop_id IS NULL;
    END IF;

    -- sale_items
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sale_items' AND column_name='shop_id') THEN
        ALTER TABLE sale_items ADD COLUMN shop_id INTEGER REFERENCES shops(id) ON DELETE CASCADE;
        UPDATE sale_items SET shop_id = 1 WHERE shop_id IS NULL;
    END IF;

    -- stock_movements
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stock_movements' AND column_name='shop_id') THEN
        ALTER TABLE stock_movements ADD COLUMN shop_id INTEGER REFERENCES shops(id) ON DELETE CASCADE;
        UPDATE stock_movements SET shop_id = 1 WHERE shop_id IS NULL;
    END IF;

    -- credit_ledger
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='credit_ledger' AND column_name='shop_id') THEN
        ALTER TABLE credit_ledger ADD COLUMN shop_id INTEGER REFERENCES shops(id) ON DELETE CASCADE;
        UPDATE credit_ledger SET shop_id = 1 WHERE shop_id IS NULL;
    END IF;

    -- credit_payments
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='credit_payments' AND column_name='shop_id') THEN
        ALTER TABLE credit_payments ADD COLUMN shop_id INTEGER REFERENCES shops(id) ON DELETE CASCADE;
        UPDATE credit_payments SET shop_id = 1 WHERE shop_id IS NULL;
    END IF;
    -- general_ledger
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='general_ledger' AND column_name='shop_id') THEN
        ALTER TABLE general_ledger ADD COLUMN shop_id INTEGER REFERENCES shops(id) ON DELETE CASCADE;
        UPDATE general_ledger SET shop_id = 1 WHERE shop_id IS NULL;
    END IF;

    -- Update credit_ledger status check constraint
    ALTER TABLE credit_ledger DROP CONSTRAINT IF EXISTS credit_ledger_status_check;
    ALTER TABLE credit_ledger ADD CONSTRAINT credit_ledger_status_check CHECK (status IN ('unpaid', 'partial', 'paid', 'voided'));

END $$;

-- 5. Indexes (Updated with shop_id for multi-tenancy)
CREATE INDEX IF NOT EXISTS idx_users_shop ON users(shop_id);
CREATE INDEX IF NOT EXISTS idx_items_shop_name ON items(shop_id, name);
CREATE INDEX IF NOT EXISTS idx_suppliers_shop ON suppliers(shop_id);
CREATE INDEX IF NOT EXISTS idx_purchases_shop_date ON purchases(shop_id, date_purchased);
CREATE INDEX IF NOT EXISTS idx_sales_shop_date ON sales(shop_id, created_at);
CREATE INDEX IF NOT EXISTS idx_customers_shop ON customers(shop_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_shop_date ON stock_movements(shop_id, created_at);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_shop_customer ON credit_ledger(shop_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_general_ledger_shop_date ON general_ledger(shop_id, created_at);
CREATE INDEX IF NOT EXISTS idx_general_ledger_ref ON general_ledger(reference_type, reference_id);

-- Constraint for unique receipt numbers WITHIN a shop
ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_receipt_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_receipt_per_shop ON sales(shop_id, receipt_number);
