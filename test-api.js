#!/usr/bin/env node

/**
 * API Testing Script for ThingiraPOS
 * Usage: node test-api.js <token>
 */

const BASE_URL = 'https://thingira-pos.vercel.app/api';
const token = process.argv[2];

if (!token) {
  console.error('❌ Please provide a token: node test-api.js <token>');
  process.exit(1);
}

console.log('🧪 Testing API Endpoints at', BASE_URL);
console.log('\nToken (first 50 chars):', token.substring(0, 50) + '...');
console.log('Token length:', token.length);

const endpoints = [
  { method: 'GET', path: '/health', name: 'health' },
  { method: 'GET', path: '/auth/me', name: 'auth.me' },
  { method: 'GET', path: '/shops/check', name: 'shops.check' },
  { method: 'POST', path: '/shops', name: 'shops.create', body: { name: 'Test Shop', location: 'Test' } },
  { method: 'GET', path: '/dashboard/summary', name: 'dashboard.summary' },
  { method: 'GET', path: '/dashboard/hourly-sales', name: 'dashboard.hourlySales' },
  { method: 'GET', path: '/dashboard/top-items', name: 'dashboard.topItems' },
  { method: 'GET', path: '/items', name: 'items.list' },
  { method: 'POST', path: '/items', name: 'items.create', body: { name: 'Test', category: 'Test', unitPrice: 100, stock: 10 } },
  { method: 'GET', path: '/suppliers', name: 'suppliers.list' },
  { method: 'POST', path: '/suppliers', name: 'suppliers.create', body: { name: 'Test', phone: '1234567890' } },
  { method: 'GET', path: '/customers', name: 'customers.list' },
  { method: 'POST', path: '/customers', name: 'customers.create', body: { name: 'Test', phone: '1234567890' } },
  { method: 'GET', path: '/sales', name: 'sales.list' },
  { method: 'POST', path: '/sales', name: 'sales.create', body: { items: [], total: 0, paymentMethod: 'cash' } },
  { method: 'GET', path: '/staff', name: 'staff.list' },
  { method: 'POST', path: '/staff', name: 'staff.create', body: { name: 'Test', email: 'test@test.com', role: 'staff' } },
  { method: 'GET', path: '/stock/movements', name: 'stock.movements' },
  { method: 'POST', path: '/stock/add', name: 'stock.add', body: { itemId: 1, quantity: 10, reason: 'test' } },
  { method: 'GET', path: '/reports/daily', name: 'reports.daily' },
  { method: 'GET', path: '/reports/inventory', name: 'reports.inventory' },
  { method: 'GET', path: '/shifts/active', name: 'shifts.active' },
  { method: 'POST', path: '/shifts/start', name: 'shifts.start', body: { openingCash: 1000 } },
  // Pump management
  { method: 'GET', path: '/shifts/pumps', name: 'shifts.pumps.list' },
  { method: 'POST', path: '/shifts/pumps', name: 'shifts.pumps.create', body: { name: 'Pump Test', pumpNumber: 664, nozzles: [{ nozzleNumber: 1, fuelType: 'petrol', unitPrice: 54, lastReading: 34 }, { nozzleNumber: 2, fuelType: 'petrol', unitPrice: 34, lastReading: 34 }] } },
];

async function testEndpoint(endpoint) {
  const url = `${BASE_URL}${endpoint.path}`;
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  
  // Debug: Show what we're sending
  console.log(`\n📡 Testing: ${endpoint.name}`);
  console.log(`   URL: ${url}`);
  console.log(`   Method: ${endpoint.method}`);
  console.log(`   Headers:`, JSON.stringify(headers, null, 2));
  
  try {
    const response = await fetch(url, {
      method: endpoint.method,
      headers,
      body: endpoint.body ? JSON.stringify(endpoint.body) : undefined,
    });

    const data = await response.json().catch(() => null);
    
    if (response.ok) {
      console.log(`   ✅ ${response.status} - ${endpoint.name}`);
      if (data && endpoint.name === 'auth.me') {
        console.log('   Response:', JSON.stringify(data, null, 2));
      }
      return true;
    } else {
      console.log(`   ❌ ${response.status} - ${endpoint.name}`);
      console.log('   Error:', data?.error || data?.message || 'Unknown error');
      return false;
    }
  } catch (error) {
    console.log(`   💥 ERROR - ${endpoint.name}`);
    console.log('   Error:', error.message);
    return false;
  }
}

async function run() {
  console.log('\n' + '='.repeat(60));
  
  let passed = 0;
  let failed = 0;
  
  for (const endpoint of endpoints) {
    const ok = await testEndpoint(endpoint);
    if (ok) passed++;
    else failed++;
    
    // Small delay between requests
    await new Promise(r => setTimeout(r, 100));
  }
  
  console.log('\n' + '='.repeat(60));
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
  
  if (failed > 0) {
    console.log('\n💡 Check Vercel logs for debug output from the auth middleware');
    console.log('   Run: vercel logs thingira-pos --json | grep "[AUTH_DEBUG]"');
  }
}

run().catch(console.error);
