const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const SCHEMA_PATH = path.join(__dirname, "schema_pg.sql");

let pool;

async function initDatabase() {
  const db = getDatabase();
  try {
    const schema = fs.readFileSync(SCHEMA_PATH, "utf-8");
    await db.query(schema);
    console.log("✅ PostgreSQL Database schema initialized.");
    return true;
  } catch (err) {
    if (err.code === "42P07") {
      console.log("ℹ️ PostgreSQL tables already exist.");
      return true;
    } else {
      console.error("❌ PostgreSQL Initialization error:", err);
      throw err;
    }
  }
}

function getDatabase() {
  if (!pool) {
    const connectionConfig =
      process.env.DATABASE_URL ?
        {
          connectionString: process.env.DATABASE_URL,
          ssl:
            (
              process.env.DATABASE_URL.includes("supabase") ||
              process.env.DATABASE_URL.includes("localhost")
            ) ?
              false
            : { rejectUnauthorized: false },
        }
      : {
          host: process.env.DB_HOST,
          port: process.env.DB_PORT,
          user: process.env.DB_USER,
          password: process.env.DB_PASSWORD,
          database: process.env.DB_NAME,
          ssl:
            process.env.DB_HOST !== "localhost" ?
              { rejectUnauthorized: false }
            : false,
        };

    // For Supabase specifically, if using their direct connection or transaction pooler
    if (
      connectionConfig.host &&
      connectionConfig.host.includes("supabase.co")
    ) {
      connectionConfig.ssl = { rejectUnauthorized: false };
    }

    pool = new Pool(connectionConfig);
  }
  return pool;
}

// Added a helper for easier query execution that mimics better-sqlite3 where possible but async
async function query(text, params) {
  const db = getDatabase();
  return db.query(text, params);
}

// Helper to get exactly one row
async function getOne(text, params) {
  const res = await query(text, params);
  return res.rows[0];
}

// Helper to get all rows
async function getAll(text, params) {
  const res = await query(text, params);
  return res.rows;
}

function closeDatabase() {
  if (pool) {
    pool.end();
    pool = null;
    console.log("PostgreSQL connection pool closed.");
  }
}

module.exports = {
  getDatabase,
  initDatabase,
  query,
  getOne,
  getAll,
  closeDatabase,
};
