#!/usr/bin/env node
/**
 * API Endpoint Test Script
 * Run with: node test-api.js <CLERK_JWT_TOKEN>
 * 
 * To get a Clerk JWT token:
 * 1. Log in to the app
 * 2. Open browser console
 * 3. Run: await window.Clerk.session.getToken()
 * 4. Copy the token and run: node test-api.js <token>
 */

const BASE_URL = process.env.API_URL || "https://thingira-pos.vercel.app/api";

// Test configuration
const tests = {
  // Health check (no auth required)
  health: {
    method: "GET",
    url: "/webhooks/health",
    auth: false,
  },

  // Auth endpoints
  auth: {
    me: {
      method: "GET",
      url: "/auth/me",
      auth: true,
    },
  },

  // Shop endpoints
  shops: {
    check: {
      method: "GET",
      url: "/shops/check",
      auth: true,
    },
    create: {
      method: "POST",
      url: "/shops",
      auth: true,
      payload: {
        name: "Test Shop",
        address: "123 Test St",
        phone: "+254700000000",
        email: "test@shop.com",
      },
    },
  },

  // Dashboard
  dashboard: {
    summary: {
      method: "GET",
      url: "/dashboard/summary",
      auth: true,
    },
    hourlySales: {
      method: "GET",
      url: "/dashboard/hourly-sales",
      auth: true,
    },
    topItems: {
      method: "GET",
      url: "/dashboard/top-items",
      auth: true,
    },
  },

  // Items
  items: {
    list: {
      method: "GET",
      url: "/items",
      auth: true,
    },
    create: {
      method: "POST",
      url: "/items",
      auth: true,
      payload: {
        name: "Test Item",
        buyingPrice: 100,
        sellingPrice: 150,
        quantity: 10,
        minStockLevel: 5,
        category: "Test",
      },
    },
  },

  // Suppliers
  suppliers: {
    list: {
      method: "GET",
      url: "/suppliers",
      auth: true,
    },
    create: {
      method: "POST",
      url: "/suppliers",
      auth: true,
      payload: {
        name: "Test Supplier",
        phone: "+254700000001",
        email: "supplier@test.com",
      },
    },
  },

  // Customers
  customers: {
    list: {
      method: "GET",
      url: "/customers",
      auth: true,
    },
    create: {
      method: "POST",
      url: "/customers",
      auth: true,
      payload: {
        name: "Test Customer",
        phone: "+254700000002",
        email: "customer@test.com",
      },
    },
  },

  // Sales
  sales: {
    list: {
      method: "GET",
      url: "/sales",
      auth: true,
    },
    create: {
      method: "POST",
      url: "/sales",
      auth: true,
      payload: {
        paymentType: "cash",
        totalAmount: 500,
        items: [
          {
            itemId: "test-item-id",
            quantity: 2,
            unitPrice: 250,
            total: 500,
          },
        ],
      },
    },
  },

  // Staff
  staff: {
    list: {
      method: "GET",
      url: "/staff",
      auth: true,
    },
    create: {
      method: "POST",
      url: "/staff",
      auth: true,
      payload: {
        fullName: "Test Staff",
        username: "teststaff",
        email: "staff@test.com",
        phone: "+254700000003",
        role: "staff",
      },
    },
  },

  // Stock
  stock: {
    movements: {
      method: "GET",
      url: "/stock/movements",
      auth: true,
    },
    add: {
      method: "POST",
      url: "/stock/add",
      auth: true,
      payload: {
        itemId: "test-item-id",
        quantity: 10,
        type: "in",
        notes: "Test stock addition",
      },
    },
  },

  // Reports
  reports: {
    daily: {
      method: "GET",
      url: "/reports/daily",
      auth: true,
    },
    inventory: {
      method: "GET",
      url: "/reports/inventory",
      auth: true,
    },
  },

  // Shifts
  shifts: {
    active: {
      method: "GET",
      url: "/shifts/active",
      auth: true,
    },
    start: {
      method: "POST",
      url: "/shifts/start",
      auth: true,
      payload: {
        openingCash: 1000,
      },
    },
  },
};

async function makeRequest(method, url, token, payload = null) {
  const headers = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const options = {
    method,
    headers,
  };

  if (payload) {
    options.body = JSON.stringify(payload);
  }

  try {
    const response = await fetch(`${BASE_URL}${url}`, options);
    const status = response.status;
    const ok = response.ok;

    let data;
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    return { status, ok, data };
  } catch (error) {
    return { status: 0, ok: false, error: error.message };
  }
}

function flattenTests(tests, prefix = "") {
  const results = [];

  for (const [key, value] of Object.entries(tests)) {
    const name = prefix ? `${prefix}.${key}` : key;

    if (value.url) {
      // This is a test case
      results.push({ name, ...value });
    } else {
      // This is a nested object
      results.push(...flattenTests(value, name));
    }
  }

  return results;
}

async function runTests(token) {
  const allTests = flattenTests(tests);
  let passed = 0;
  let failed = 0;

  console.log(`\n🧪 Testing API Endpoints at ${BASE_URL}\n`);
  console.log("=".repeat(60));

  for (const test of allTests) {
    process.stdout.write(`${test.name.padEnd(30)} ... `);

    const result = await makeRequest(
      test.method,
      test.url,
      test.auth ? token : null,
      test.payload
    );

    if (result.ok) {
      console.log(`✅ ${result.status}`);
      passed++;
    } else {
      console.log(`❌ ${result.status}`);
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      } else if (result.data && result.data.error) {
        console.log(`   Error: ${result.data.error}`);
      }
      failed++;
    }
  }

  console.log("=".repeat(60));
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

  return failed === 0;
}

// Main
async function main() {
  const token = process.argv[2];

  if (!token) {
    console.log("\n❌ Please provide a Clerk JWT token\n");
    console.log("Usage: node test-api.js <CLERK_JWT_TOKEN>\n");
    console.log("To get a token:");
    console.log("1. Log in to the app at https://thingira-web.vercel.app");
    console.log("2. Open browser console (F12)");
    console.log("3. Run: await window.Clerk.session.getToken()");
    console.log("4. Copy the token and run this script\n");
    process.exit(1);
  }

  const success = await runTests(token);
  process.exit(success ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
