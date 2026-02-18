const { initDatabase, closeDatabase } = require('./db/database');

async function runMigration() {
    try {
        console.log('Running database migration...');
        await initDatabase();
        console.log('Migration complete!');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        closeDatabase();
    }
}

runMigration();
