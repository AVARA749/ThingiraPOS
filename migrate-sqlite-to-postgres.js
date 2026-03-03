/**
 * SQLite to PostgreSQL Migration Script
 *
 * Migrates data from the legacy SQLite database to the production PostgreSQL database.
 * This script handles the schema differences:
 * - SQLite had no "shops" table - everything was in a single implicit shop
 * - PostgreSQL has "shops" as the top-level entity
 *
 * Usage:
 *   cd "ThingiraPOS Server"
 *   node migrate-sqlite-to-postgres.js
 */

require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const SQLITE_DB_PATH = path.join(__dirname, '..', 'thingirashop (1).db');

// Default shop info for migrated data
const DEFAULT_SHOP = {
  name: 'Thingira Main Shop',
  address: 'Nyeri, Kenya',
  phone: '0722000111',
};

function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

async function migrate() {
  console.log('🚀 Starting SQLite to PostgreSQL migration...\n');

  // Connect to SQLite
  const sqliteDb = new sqlite3.Database(SQLITE_DB_PATH, sqlite3.OPEN_READONLY, (err) => {
    if (err) {
      console.error('❌ Error opening SQLite database:', err.message);
      process.exit(1);
    }
    console.log('✅ Connected to SQLite database');
  });

  // Promisify SQLite queries
  const sqliteAll = (sql) => new Promise((resolve, reject) => {
    sqliteDb.all(sql, [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });

  // Connect to PostgreSQL via Prisma
  const prisma = createPrismaClient();

  try {
    // Check if data already exists
    const existingShops = await prisma.shop.count();
    if (existingShops > 0) {
      console.log(`⚠️  Warning: ${existingShops} shop(s) already exist in PostgreSQL.`);
      console.log('   Migration may create duplicate data. Continue with caution.\n');
    }

    // Step 1: Create the default shop
    console.log('🏪 Creating default shop...');
    const shop = await prisma.shop.create({
      data: DEFAULT_SHOP,
    });
    console.log(`   Created shop: ${shop.name} (ID: ${shop.id})\n`);

    // Step 2: Migrate users
    console.log('👤 Migrating users...');
    const users = await sqliteAll('SELECT * FROM users');
    console.log(`   Found ${users.length} users`);
    
    for (const user of users) {
      try {
        await prisma.user.create({
          data: {
            id: user.id,
            username: user.username,
            passwordHash: user.password_hash,
            fullName: user.full_name,
            shopName: user.shop_name || DEFAULT_SHOP.name,
            phone: user.phone,
            role: 'admin', // Default role
            shopId: shop.id,
            createdAt: new Date(user.created_at),
            updatedAt: new Date(user.updated_at),
          },
        });
      } catch (e) {
        if (e.code === 'P2002') {
          console.log(`   ⚠️  User '${user.username}' already exists, skipping`);
        } else {
          throw e;
        }
      }
    }
    console.log(`   ✅ Migrated ${users.length} users\n`);

    // Step 3: Migrate suppliers
    console.log('🏭 Migrating suppliers...');
    const suppliers = await sqliteAll('SELECT * FROM suppliers');
    console.log(`   Found ${suppliers.length} suppliers`);
    
    for (const supplier of suppliers) {
      try {
        await prisma.supplier.create({
          data: {
            id: supplier.id,
            name: supplier.name,
            address: supplier.address,
            phone: supplier.phone,
            email: supplier.email,
            shopId: shop.id,
            createdAt: new Date(supplier.created_at),
            updatedAt: new Date(supplier.updated_at),
          },
        });
      } catch (e) {
        if (e.code === 'P2002') {
          console.log(`   ⚠️  Supplier '${supplier.name}' already exists, skipping`);
        } else {
          throw e;
        }
      }
    }
    console.log(`   ✅ Migrated ${suppliers.length} suppliers\n`);

    // Step 4: Migrate items
    console.log('📦 Migrating items...');
    const items = await sqliteAll('SELECT * FROM items');
    console.log(`   Found ${items.length} items`);
    
    for (const item of items) {
      try {
        await prisma.item.create({
          data: {
            id: item.id,
            name: item.name,
            buyingPrice: item.buying_price,
            sellingPrice: item.selling_price,
            quantity: item.quantity,
            minStockLevel: item.min_stock_level,
            supplierId: item.supplier_id,
            category: item.category || 'General',
            barcode: item.barcode,
            shopId: shop.id,
            createdAt: new Date(item.created_at),
            updatedAt: new Date(item.updated_at),
          },
        });
      } catch (e) {
        if (e.code === 'P2002') {
          console.log(`   ⚠️  Item '${item.name}' already exists, skipping`);
        } else {
          throw e;
        }
      }
    }
    console.log(`   ✅ Migrated ${items.length} items\n`);

    // Step 5: Migrate purchases
    console.log('📥 Migrating purchases...');
    const purchases = await sqliteAll('SELECT * FROM purchases');
    console.log(`   Found ${purchases.length} purchases`);
    
    for (const purchase of purchases) {
      try {
        await prisma.purchase.create({
          data: {
            id: purchase.id,
            supplierId: purchase.supplier_id,
            itemId: purchase.item_id,
            quantity: purchase.quantity,
            buyingPrice: purchase.buying_price,
            totalCost: purchase.total_cost,
            datePurchased: new Date(purchase.date_purchased),
            notes: purchase.notes,
            shopId: shop.id,
            createdAt: new Date(purchase.created_at),
          },
        });
      } catch (e) {
        if (e.code === 'P2002') {
          console.log(`   ⚠️  Purchase ID ${purchase.id} already exists, skipping`);
        } else {
          throw e;
        }
      }
    }
    console.log(`   ✅ Migrated ${purchases.length} purchases\n`);

    // Step 6: Migrate customers
    console.log('👥 Migrating customers...');
    const customers = await sqliteAll('SELECT * FROM customers');
    console.log(`   Found ${customers.length} customers`);
    
    for (const customer of customers) {
      try {
        await prisma.customer.create({
          data: {
            id: customer.id,
            name: customer.name,
            phone: customer.phone,
            email: customer.email,
            address: customer.address,
            totalCredit: customer.total_credit || 0,
            shopId: shop.id,
            createdAt: new Date(customer.created_at),
            updatedAt: new Date(customer.updated_at),
          },
        });
      } catch (e) {
        if (e.code === 'P2002') {
          console.log(`   ⚠️  Customer '${customer.name}' already exists, skipping`);
        } else {
          throw e;
        }
      }
    }
    console.log(`   ✅ Migrated ${customers.length} customers\n`);

    // Step 7: Migrate sales
    console.log('💰 Migrating sales...');
    const sales = await sqliteAll('SELECT * FROM sales');
    console.log(`   Found ${sales.length} sales`);
    
    for (const sale of sales) {
      try {
        await prisma.sale.create({
          data: {
            id: sale.id,
            receiptNumber: sale.receipt_number,
            customerId: sale.customer_id,
            customerName: sale.customer_name,
            customerPhone: sale.customer_phone,
            totalAmount: sale.total_amount,
            paymentType: sale.payment_type || 'cash',
            status: sale.status || 'completed',
            notes: sale.notes,
            shopId: shop.id,
            createdAt: new Date(sale.created_at),
          },
        });
      } catch (e) {
        if (e.code === 'P2002') {
          console.log(`   ⚠️  Sale ID ${sale.id} already exists, skipping`);
        } else {
          throw e;
        }
      }
    }
    console.log(`   ✅ Migrated ${sales.length} sales\n`);

    // Step 8: Migrate sale items
    console.log('🛒 Migrating sale items...');
    const saleItems = await sqliteAll('SELECT * FROM sale_items');
    console.log(`   Found ${saleItems.length} sale items`);
    
    for (const item of saleItems) {
      try {
        await prisma.saleItem.create({
          data: {
            id: item.id,
            saleId: item.sale_id,
            itemId: item.item_id,
            itemName: item.item_name,
            quantity: item.quantity,
            unitPrice: item.unit_price,
            buyingPrice: item.buying_price || 0,
            subtotal: item.subtotal,
            shopId: shop.id,
            createdAt: new Date(item.created_at),
          },
        });
      } catch (e) {
        if (e.code === 'P2002') {
          console.log(`   ⚠️  SaleItem ID ${item.id} already exists, skipping`);
        } else {
          throw e;
        }
      }
    }
    console.log(`   ✅ Migrated ${saleItems.length} sale items\n`);

    // Step 9: Migrate stock movements
    console.log('📊 Migrating stock movements...');
    const movements = await sqliteAll('SELECT * FROM stock_movements');
    console.log(`   Found ${movements.length} stock movements`);
    
    for (const movement of movements) {
      try {
        await prisma.stockMovement.create({
          data: {
            id: movement.id,
            itemId: movement.item_id,
            itemName: movement.item_name,
            movementType: movement.movement_type,
            quantity: movement.quantity,
            balanceAfter: movement.balance_after,
            referenceType: movement.reference_type,
            referenceId: movement.reference_id,
            supplierName: movement.supplier_name,
            notes: movement.notes,
            shopId: shop.id,
            createdAt: new Date(movement.created_at),
          },
        });
      } catch (e) {
        if (e.code === 'P2002') {
          console.log(`   ⚠️  StockMovement ID ${movement.id} already exists, skipping`);
        } else {
          throw e;
        }
      }
    }
    console.log(`   ✅ Migrated ${movements.length} stock movements\n`);

    // Step 10: Migrate credit ledger
    console.log('💳 Migrating credit ledger...');
    const credits = await sqliteAll('SELECT * FROM credit_ledger');
    console.log(`   Found ${credits.length} credit records`);
    
    for (const credit of credits) {
      try {
        await prisma.creditLedger.create({
          data: {
            id: credit.id,
            customerId: credit.customer_id,
            customerName: credit.customer_name,
            saleId: credit.sale_id,
            amount: credit.amount,
            paidAmount: credit.paid_amount || 0,
            balance: credit.balance,
            status: credit.status || 'unpaid',
            dueDate: credit.due_date ? new Date(credit.due_date) : null,
            notes: credit.notes,
            shopId: shop.id,
            createdAt: new Date(credit.created_at),
            updatedAt: new Date(credit.updated_at),
          },
        });
      } catch (e) {
        if (e.code === 'P2002') {
          console.log(`   ⚠️  CreditLedger ID ${credit.id} already exists, skipping`);
        } else {
          throw e;
        }
      }
    }
    console.log(`   ✅ Migrated ${credits.length} credit records\n`);

    // Final summary
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Migration completed successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   Shop: ${shop.name}`);
    console.log(`   Users: ${users.length}`);
    console.log(`   Suppliers: ${suppliers.length}`);
    console.log(`   Items: ${items.length}`);
    console.log(`   Purchases: ${purchases.length}`);
    console.log(`   Customers: ${customers.length}`);
    console.log(`   Sales: ${sales.length}`);
    console.log(`   Sale Items: ${saleItems.length}`);
    console.log(`   Stock Movements: ${movements.length}`);
    console.log(`   Credit Records: ${credits.length}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    sqliteDb.close();
    await prisma.$disconnect();
  }
}

// Run migration
migrate();
