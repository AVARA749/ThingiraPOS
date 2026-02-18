const { getAll, closeDatabase } = require('./db/database');

async function checkUsers() {
    try {
        const users = await getAll('SELECT username, shop_id FROM users');
        console.log('Current users:', users);
        const shops = await getAll('SELECT id, name FROM shops');
        console.log('Current shops:', shops);
    } catch (err) {
        console.error('Error:', err);
    } finally {
        closeDatabase();
    }
}

checkUsers();
