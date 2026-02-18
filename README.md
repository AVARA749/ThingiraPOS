# 🏪 ThingiraShop POS System

A complete, production-ready web-based Point of Sale (POS) system designed for small retail businesses in Kenya.

## Features

- **Dashboard** — Real-time daily sales summary, hourly chart, top items, low stock alerts
- **Inventory Management** — Stock intake with supplier tracking, CRUD operations
- **Point of Sale** — Fast cashier-friendly sales screen with cart, customer details, cash/credit
- **Stock Control** — Stock in/out movements, current levels, period filters
- **Reports** — Daily P&L, inventory valuation, credit report, CSV export
- **Authentication** — Secure JWT-based login

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + Tailwind CSS 3 |
| Backend | Node.js + Express |
| Database | SQLite (via better-sqlite3) |
| Charts | Recharts |
| Icons | Lucide React |
| Auth | JWT + bcryptjs |

## Quick Start

### 1. Install Dependencies

```bash
# Server
cd server
npm install

# Client 
cd ../client
npm install
```

### 2. Seed the Database

```bash
cd server
npm run seed
```

This creates sample data with:
- **Admin login**: `admin` / `thingira2024`
- 5 suppliers (Bidco, Kapa, Pwani Oil, Unilever, EABL)
- 20 product items with Kenyan pricing
- 5 customers
- 8 sample sales transactions

### 3. Start the Server

```bash
cd server
npm run dev
```

Server runs on `http://localhost:5000`

### 4. Start the Client

```bash
cd client
npm run dev
```

Client runs on `http://localhost:3000`

### 5. Login

Open `http://localhost:3000` and login with:
- **Username**: `admin`
- **Password**: `thingira2024`

## Database Schema

| Table | Purpose |
|-------|---------|
| `users` | Shop owner authentication |
| `suppliers` | Supplier directory |
| `items` | Product catalog & stock levels |
| `purchases` | Stock intake records |
| `sales` | Sale transactions |
| `sale_items` | Line items per sale |
| `customers` | Customer directory |
| `stock_movements` | Full audit trail (IN/OUT/RETURN) |
| `credit_ledger` | Credit sale tracking |

## API Routes

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login |
| GET | `/api/auth/me` | Get current user |
| GET | `/api/dashboard/summary` | Today's summary |
| GET | `/api/dashboard/hourly-sales` | Hourly chart data |
| GET | `/api/dashboard/top-items` | Top 5 selling |
| GET | `/api/dashboard/recent-transactions` | Recent sales |
| GET/POST | `/api/items` | List/Create items |
| PUT/DELETE | `/api/items/:id` | Update/Delete item |
| GET/POST | `/api/suppliers` | List/Create suppliers |
| POST | `/api/purchases` | Record stock intake |
| GET/POST | `/api/sales` | List/Create sales |
| DELETE | `/api/sales/:id` | Void sale (restore stock) |
| GET | `/api/customers` | List customers |
| POST | `/api/customers/:id/pay` | Record credit payment |
| GET | `/api/stock/current` | Current stock levels |
| GET | `/api/stock/in` | Stock in history |
| GET | `/api/stock/out` | Stock out history |
| GET | `/api/reports/daily` | Daily P&L report |
| GET | `/api/reports/inventory` | Inventory valuation |
| GET | `/api/reports/credit` | Credit/debtor report |
| GET | `/api/reports/export/csv` | Export to CSV |

## Currency

All monetary values are in **Kenyan Shillings (KES)**, formatted as `KES 1,234.00`.

## Business Rules

- Cannot sell more than available stock
- Credit sales deduct stock but track debt in credit ledger
- Voiding a sale restores stock automatically
- All stock changes are logged in `stock_movements`
- Low stock alerts when quantity ≤ minimum level

## License

MIT
