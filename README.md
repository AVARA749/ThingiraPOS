# 🏪 ThingiraShop POS — API Server

Express.js + Prisma backend for the ThingiraShop POS system.

> **Frontend** lives at → [github.com/AVARA749/thingira-web](https://github.com/AVARA749/thingira-web)

## Tech Stack

| Layer    | Technology            |
| -------- | --------------------- |
| Runtime  | Node.js + Express     |
| ORM      | Prisma                |
| Database | Supabase (PostgreSQL) |
| Auth     | Supabase Auth + JWT   |

## API Routes

| Prefix           | Description                                       |
| ---------------- | ------------------------------------------------- |
| `/api/auth`      | Login, register, JWT token                        |
| `/api/dashboard` | Daily stats, hourly sales, top items              |
| `/api/items`     | Inventory CRUD                                    |
| `/api/sales`     | POS sales, voiding                                |
| `/api/purchases` | Stock intake                                      |
| `/api/suppliers` | Supplier management                               |
| `/api/customers` | Customer credit management                        |
| `/api/stock`     | Stock movements & current levels                  |
| `/api/reports`   | Daily, inventory, credit, financial reports + CSV |
| `/api/shifts`    | Cash register shift open/close                    |
| `/api/health`    | Health check                                      |

## Getting Started

### 1. Install & generate Prisma client

```bash
cd server
npm install
npx prisma generate
```

### 2. Configure environment

Create `server/.env`:

```env
DATABASE_URL=postgresql://postgres.[ref]:[pass]@...pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.[ref]:[pass]@...supabase.com:5432/postgres
JWT_SECRET=your-long-random-secret
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
CLIENT_ORIGIN=http://localhost:3000
```

### 3. Sync database schema

```bash
cd server
npx prisma db pull   # pull existing Supabase schema
npx prisma generate  # generate client
```

### 4. Start development server

```bash
cd server
npm run dev
```

Server runs on `http://localhost:5000`.

## Deployment (Vercel)

Set these in Vercel → Settings → Environment Variables:

| Key                       | Value                             |
| ------------------------- | --------------------------------- |
| `DATABASE_URL`            | Supabase pooler URL (port 6543)   |
| `DIRECT_URL`              | Supabase direct URL (port 5432)   |
| `JWT_SECRET`              | A long random string              |
| `SUPABASE_URL`            | Your Supabase project URL         |
| `SUPABASE_ANON_KEY`       | Your Supabase anon key            |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service role key (for admin operations) |
| `CLIENT_ORIGIN`           | `https://thingira-web.vercel.app` |

## Why Local Database + Supabase Auth?

You might wonder: **"Why not use Supabase for everything?"**

### Supabase Auth vs Local Business Data

**Supabase Auth** handles:
- User authentication (login, passwords, email verification)
- OAuth providers (Google, GitHub, etc.)
- JWT tokens and session management

**Local PostgreSQL (via Prisma)** handles:
- Business data: Shops, inventory items, sales transactions
- Customer credit records, supplier information
- Stock movements, shift registers
- Financial reports and analytics

### Why Separate?

1. **Supabase Auth is for identity only** - It stores user credentials and metadata, not your business logic data
2. **Complex relationships** - Shops have items, items have sales, sales have customers - these complex relationships are better managed in your own database schema
3. **Custom business logic** - Credit tracking, inventory management, shift registers - these are specific to your POS system
4. **Data ownership** - Your business data stays in your control, separate from the auth provider
5. **Flexibility** - You can switch auth providers without migrating business data

### How They Work Together

```
User logs in → Supabase Auth verifies credentials → Returns JWT token
                                        ↓
                   API uses JWT to identify user → Queries local DB for shop/items/sales
```

The `supabaseUserId` field in the User table links your local user records to Supabase auth users.

## Business Rules

- Cannot sell more than available stock
- Credit sales deduct stock but track debt in the credit ledger
- Voiding a sale restores stock automatically
- All stock changes are logged in `stock_movements`
- Cash register shifts track expected vs actual cash (variance)
- All users must verify their email before logging in

## License

MIT
